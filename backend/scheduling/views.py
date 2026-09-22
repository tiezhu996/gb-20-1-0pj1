from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db import transaction, IntegrityError
import uuid
from core.models import Semester, Classroom, Teacher, Class
from .models import (
    ClassCourse, ScheduleEntry, Conflict, SwapRequest, SwapRecord, Substitute
)
from .serializers import (
    ClassCourseSerializer, ScheduleEntrySerializer,
    ScheduleEntryDetailSerializer, ConflictSerializer,
    SwapRequestSerializer, SubstituteSerializer,
    AutoScheduleRequestSerializer, ConflictCheckSerializer,
    SwapScheduleRequestSerializer, SubstituteRequestSerializer
)
from .csp_solver import CSPScheduler, SchedulingTask
from .swap_service import (
    simulate_swap, rebuild_semester_conflicts, detect_semester_conflicts
)
from .pdf_export import (
    generate_class_timetable_pdf,
    generate_teacher_timetable_pdf,
    generate_classroom_timetable_pdf
)


class ClassCourseViewSet(viewsets.ModelViewSet):
    queryset = ClassCourse.objects.all()
    serializer_class = ClassCourseSerializer
    permission_classes = [AllowAny]


class ScheduleEntryViewSet(viewsets.ModelViewSet):
    queryset = ScheduleEntry.objects.all().select_related(
        'course', 'teacher', 'classroom', 'class_id', 'semester'
    )
    serializer_class = ScheduleEntryDetailSerializer
    permission_classes = [AllowAny]

    def get_serializer_class(self):
        if self.action in ['list', 'retrieve']:
            return ScheduleEntryDetailSerializer
        return ScheduleEntrySerializer

    @action(detail=False, methods=['get'])
    def by_semester(self, request):
        semester_id = request.query_params.get('semester_id')
        if not semester_id:
            return Response(
                {'error': 'semester_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        entries = self.queryset.filter(semester_id=semester_id)
        serializer = ScheduleEntryDetailSerializer(entries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_class(self, request):
        semester_id = request.query_params.get('semester_id')
        class_id = request.query_params.get('class_id')
        entries = self.queryset.filter(semester_id=semester_id, class_id=class_id)
        serializer = ScheduleEntryDetailSerializer(entries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_teacher(self, request):
        semester_id = request.query_params.get('semester_id')
        teacher_id = request.query_params.get('teacher_id')
        entries = self.queryset.filter(semester_id=semester_id, teacher_id=teacher_id)
        serializer = ScheduleEntryDetailSerializer(entries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['get'])
    def by_classroom(self, request):
        semester_id = request.query_params.get('semester_id')
        classroom_id = request.query_params.get('classroom_id')
        entries = self.queryset.filter(semester_id=semester_id, classroom_id=classroom_id)
        serializer = ScheduleEntryDetailSerializer(entries, many=True)
        return Response(serializer.data)

    @action(detail=False, methods=['post'])
    def auto_schedule(self, request):
        req_serializer = AutoScheduleRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        semester_id = req_serializer.validated_data['semester_id']
        respect_locked = req_serializer.validated_data['respect_locked']

        try:
            semester = Semester.objects.get(id=semester_id)
        except Semester.DoesNotExist:
            return Response(
                {'error': 'Semester not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        class_courses = ClassCourse.objects.filter(
            semester=semester
        ).select_related('class_id', 'course', 'teacher')

        if not class_courses.exists():
            return Response(
                {'error': 'No class courses configured for this semester'},
                status=status.HTTP_400_BAD_REQUEST
            )

        tasks = []
        for cc in class_courses:
            tasks.append(SchedulingTask(
                class_id=cc.class_id.id,
                course_id=cc.course.id,
                teacher_id=cc.teacher.id,
                weekly_hours=cc.course.weekly_hours,
                preferred_room_type=cc.course.preferred_room_type,
                priority=cc.course.priority,
                available_time_slots=[],
                classroom_capacity=cc.class_id.student_count or 40
            ))

        classrooms_data = {
            c.id: {
                'room_type': c.room_type,
                'capacity': c.capacity,
                'name': c.name
            } for c in Classroom.objects.filter(is_active=True)
        }

        teachers_data = {
            t.id: {
                'name': t.name,
                'available_time_slots': t.available_time_slots if t.available_time_slots else []
            } for t in Teacher.objects.filter(is_active=True)
        }

        locked_entries = []
        if respect_locked:
            locked = ScheduleEntry.objects.filter(
                semester=semester, is_locked=True
            ).values(
                'id', 'class_id', 'teacher_id', 'classroom_id',
                'day_of_week', 'period', 'is_locked'
            )
            locked_entries = list(locked)

        scheduler = CSPScheduler(semester)
        assignments, scheduling_conflicts = scheduler.schedule(
            tasks, classrooms_data, teachers_data, locked_entries
        )

        with transaction.atomic():
            if respect_locked:
                ScheduleEntry.objects.filter(
                    semester=semester, is_locked=False
                ).delete()
            else:
                ScheduleEntry.objects.filter(semester=semester).delete()

            bulk_entries = []
            for a in assignments:
                if a.get('is_locked'):
                    continue
                bulk_entries.append(ScheduleEntry(
                    semester_id=a['semester_id'],
                    class_id_id=a['class_id'],
                    course_id=a['course_id'],
                    teacher_id=a['teacher_id'],
                    classroom_id=a['classroom_id'],
                    day_of_week=a['day_of_week'],
                    period=a['period'],
                    is_locked=False
                ))
            ScheduleEntry.objects.bulk_create(bulk_entries)

            conflicts = rebuild_semester_conflicts(semester)

        final_entries = ScheduleEntry.objects.filter(semester=semester)
        serializer = ScheduleEntryDetailSerializer(final_entries, many=True)

        return Response({
            'schedule': serializer.data,
            'conflicts': conflicts,
            'scheduling_messages': scheduling_conflicts,
            'total_entries': len(serializer.data)
        })

    @action(detail=False, methods=['post'])
    def check_conflicts(self, request):
        req_serializer = ConflictCheckSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        semester_id = req_serializer.validated_data['semester_id']
        try:
            semester = Semester.objects.get(id=semester_id)
        except Semester.DoesNotExist:
            return Response(
                {'error': 'Semester not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        conflicts = detect_semester_conflicts(semester)

        return Response({'conflicts': conflicts})

    def _build_swap_response(self, record: SwapRecord, replayed: bool):
        """根据 SwapRecord 构造统一响应（首次提交与幂等回放共用）。"""
        base = {
            'status': record.status,
            'replayed': replayed,
            'client_token': record.client_token,
            'message': record.message,
            'reason': record.reason,
        }
        if record.status == 'success':
            base.update({
                'entry1': record.result.get('entry1'),
                'entry2': record.result.get('entry2'),
                'conflicts': record.conflicts,
            })
        else:
            base.update({
                'conflicts': record.conflicts,
            })
        http_status = (
            status.HTTP_200_OK
            if record.status == 'success'
            else status.HTTP_409_CONFLICT
        )
        return Response(base, status=http_status)

    @action(detail=False, methods=['post'])
    def swap(self, request):
        """教务员调课：交换两条排课的时段。

        流程：参数/规则校验 → 行锁 + 幂等令牌（重复或并发提交只生效一次）→
        试算交换后的教师/教室/班级占用，任一冲突即整笔拒绝、原课表不变 →
        试算通过才交换时段，并重算冲突记录与条目状态。
        """
        req_serializer = SwapScheduleRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entry1_id = req_serializer.validated_data['entry1_id']
        entry2_id = req_serializer.validated_data['entry2_id']
        reason = req_serializer.validated_data.get('reason') or ''
        client_token = (
            req_serializer.validated_data.get('client_token')
            or uuid.uuid4().hex
        )
        # 空白令牌视为未提供，由服务端生成
        client_token = client_token.strip() or uuid.uuid4().hex

        if entry1_id == entry2_id:
            return Response(
                {'error': '不能与自身调课，请选择两条不同的排课'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 幂等命中：同一令牌的重复提交（含上一笔仍在进行时的并发提交）
        existing = SwapRecord.objects.filter(
            client_token=client_token
        ).first()
        if existing is not None:
            return self._build_swap_response(existing, replayed=True)

        record = None
        try:
            with transaction.atomic():
                # 按固定顺序加行锁，既防止并发交换造成丢失更新，也避免死锁
                entries = {
                    e.id: e for e in ScheduleEntry.objects.select_for_update().filter(
                        id__in=[entry1_id, entry2_id]
                    ).select_related('semester', 'teacher', 'classroom', 'class_id', 'course')
                }
                entry1 = entries.get(entry1_id)
                entry2 = entries.get(entry2_id)
                if entry1 is None or entry2 is None:
                    return Response(
                        {'error': 'One or both entries not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )

                # 拿到锁后再查一次令牌：并发请求会在锁上排队，
                # 此时首笔记录已提交，直接回放其结果，保证只生效一次
                existing = SwapRecord.objects.filter(client_token=client_token).first()
                if existing is not None:
                    return self._build_swap_response(existing, replayed=True)

                if entry1.semester_id != entry2.semester_id:
                    return Response(
                        {'error': '两条排课不属于同一学期，不能调课'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if entry1.day_of_week == entry2.day_of_week and entry1.period == entry2.period:
                    return Response(
                        {'error': '两条排课已在同一时段，无需调课'},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # 锁定规则不变：被锁定的条目不允许参与调课
                if entry1.is_locked or entry2.is_locked:
                    locked_names = []
                    if entry1.is_locked:
                        locked_names.append(f"{entry1.course.name}（{entry1.class_id.name}）")
                    if entry2.is_locked:
                        locked_names.append(f"{entry2.course.name}（{entry2.class_id.name}）")
                    return Response(
                        {'error': f"以下排课已锁定，不能调课：{'、'.join(locked_names)}"},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # 先试算：任一冲突即整笔拒绝，不修改任何课表
                trial_conflicts = simulate_swap(entry1, entry2)

                if trial_conflicts:
                    conflict_desc = '；'.join(c['message'] for c in trial_conflicts)
                    record = SwapRecord.objects.create(
                        client_token=client_token,
                        semester=entry1.semester,
                        entry1=entry1,
                        entry2=entry2,
                        entry1_id_snapshot=entry1.id,
                        entry2_id_snapshot=entry2.id,
                        reason=reason,
                        status='rejected',
                        conflicts=trial_conflicts,
                        message=f'调课被拒绝：试算发现占用冲突（{conflict_desc}）',
                    )
                    return self._build_swap_response(record, replayed=False)

                # 试算通过：交换时段
                entry1.day_of_week, entry2.day_of_week = entry2.day_of_week, entry1.day_of_week
                entry1.period, entry2.period = entry2.period, entry1.period
                entry1.save(update_fields=['day_of_week', 'period', 'updated_at'])
                entry2.save(update_fields=['day_of_week', 'period', 'updated_at'])

                # 重算整学期冲突记录与条目状态
                remaining_conflicts = rebuild_semester_conflicts(entry1.semester)

                entry1.refresh_from_db()
                entry2.refresh_from_db()
                result_snapshot = {
                    'entry1': ScheduleEntryDetailSerializer(entry1).data,
                    'entry2': ScheduleEntryDetailSerializer(entry2).data,
                }

                if reason:
                    SwapRequest.objects.create(
                        semester=entry1.semester,
                        requesting_teacher=entry1.teacher,
                        target_teacher=entry2.teacher,
                        entry1=entry1,
                        entry2=entry2,
                        reason=reason,
                        status='approved'
                    )

                record = SwapRecord.objects.create(
                    client_token=client_token,
                    semester=entry1.semester,
                    entry1=entry1,
                    entry2=entry2,
                    entry1_id_snapshot=entry1.id,
                    entry2_id_snapshot=entry2.id,
                    reason=reason,
                    status='success',
                    conflicts=remaining_conflicts,
                    result=result_snapshot,
                    message='调课成功：两个时段已交换',
                )
        except IntegrityError:
            # 两个并发请求同时通过预检查、且在行锁外竞速插入同令牌记录时，
            # 唯一约束会拒绝其中一笔：回滚后回放首笔结果，确保只生效一次
            existing = SwapRecord.objects.filter(client_token=client_token).first()
            if existing is not None:
                return self._build_swap_response(existing, replayed=True)
            raise

        return self._build_swap_response(record, replayed=False)

    @action(detail=False, methods=['get'])
    def swap_result(self, request):
        """按幂等令牌查询调课结果，供刷新页面后展示交换结果或拒绝原因。"""
        client_token = request.query_params.get('client_token')
        if not client_token:
            return Response(
                {'error': 'client_token is required'},
                status=status.HTTP_400_BAD_REQUEST
            )

        record = SwapRecord.objects.filter(client_token=client_token).first()
        if record is None:
            return Response(
                {'error': '未找到该调课记录'},
                status=status.HTTP_404_NOT_FOUND
            )
        return self._build_swap_response(record, replayed=True)

    @action(detail=False, methods=['post'])
    def substitute(self, request):
        req_serializer = SubstituteRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        entry_id = req_serializer.validated_data['entry_id']
        substitute_teacher_id = req_serializer.validated_data['substitute_teacher_id']
        start_date = req_serializer.validated_data['start_date']
        end_date = req_serializer.validated_data['end_date']
        reason = req_serializer.validated_data['reason']

        try:
            entry = ScheduleEntry.objects.get(id=entry_id)
            substitute_teacher = Teacher.objects.get(id=substitute_teacher_id)
        except (ScheduleEntry.DoesNotExist, Teacher.DoesNotExist):
            return Response(
                {'error': 'Entry or teacher not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        original_teacher = entry.teacher

        with transaction.atomic():
            Substitute.objects.create(
                semester=entry.semester,
                original_teacher=original_teacher,
                substitute_teacher=substitute_teacher,
                affected_entry=entry,
                start_date=start_date,
                end_date=end_date,
                reason=reason
            )

            entry.original_teacher = original_teacher
            entry.teacher = substitute_teacher
            entry.save()

        serializer = ScheduleEntryDetailSerializer(entry)
        return Response({'status': 'success', 'entry': serializer.data})

    @action(detail=False, methods=['get'])
    def export_pdf(self, request):
        semester_id = request.query_params.get('semester_id')
        entity_type = request.query_params.get('type')
        entity_id = request.query_params.get('id')

        try:
            semester = Semester.objects.get(id=semester_id)
        except Semester.DoesNotExist:
            return Response(
                {'error': 'Semester not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        pdf_buffer = None
        filename = 'timetable.pdf'

        try:
            if entity_type == 'class':
                class_obj = Class.objects.get(id=entity_id)
                pdf_buffer = generate_class_timetable_pdf(class_obj, semester)
                filename = f'{class_obj.name}_课表.pdf'
            elif entity_type == 'teacher':
                teacher = Teacher.objects.get(id=entity_id)
                pdf_buffer = generate_teacher_timetable_pdf(teacher, semester)
                filename = f'{teacher.name}_课表.pdf'
            elif entity_type == 'classroom':
                classroom = Classroom.objects.get(id=entity_id)
                pdf_buffer = generate_classroom_timetable_pdf(classroom, semester)
                filename = f'{classroom.name}_课表.pdf'
            else:
                return Response(
                    {'error': 'Invalid type. Must be class, teacher, or classroom'},
                    status=status.HTTP_400_BAD_REQUEST
                )
        except (Class.DoesNotExist, Teacher.DoesNotExist, Classroom.DoesNotExist):
            return Response(
                {'error': 'Entity not found'},
                status=status.HTTP_404_NOT_FOUND
            )

        response = HttpResponse(pdf_buffer, content_type='application/pdf')
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response


class ConflictViewSet(viewsets.ModelViewSet):
    queryset = Conflict.objects.all().select_related('semester')
    serializer_class = ConflictSerializer
    permission_classes = [AllowAny]


class SwapRequestViewSet(viewsets.ModelViewSet):
    queryset = SwapRequest.objects.all().select_related(
        'semester', 'requesting_teacher', 'target_teacher'
    )
    serializer_class = SwapRequestSerializer
    permission_classes = [AllowAny]


class SubstituteViewSet(viewsets.ModelViewSet):
    queryset = Substitute.objects.all().select_related(
        'semester', 'original_teacher', 'substitute_teacher'
    )
    serializer_class = SubstituteSerializer
    permission_classes = [AllowAny]
