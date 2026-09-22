from django.http import HttpResponse
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import AllowAny
from django.db import transaction, IntegrityError
from django.db.models import Q
from collections import defaultdict
from dataclasses import dataclass
from uuid import uuid4
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
from .csp_solver import CSPScheduler, ConflictDetector, SchedulingTask, TimeSlot
from .pdf_export import (
    generate_class_timetable_pdf,
    generate_teacher_timetable_pdf,
    generate_classroom_timetable_pdf
)


WEEKDAY_CN = {1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日'}


def slot_label(day_of_week, period):
    return f"周{WEEKDAY_CN.get(day_of_week, day_of_week)}第{period}节"


@dataclass
class _TrialEntry:
    """试算用的轻量条目镜像，避免污染未提交的 ScheduleEntry 实例。"""
    id: int
    teacher_id: int
    classroom_id: int
    class_id: int
    day_of_week: int
    period: int
    course_name: str
    teacher_name: str
    classroom_name: str
    class_name: str


# 三类冲突的分组字段与展示文案
_CONFLICT_SPECS = [
    ('teacher', 'teacher_id', '教师', 'teacher_name'),
    ('classroom', 'classroom_id', '教室', 'classroom_name'),
    ('class', 'class_id', '班级', 'class_name'),
]


def _entry_to_trial(entry, day_of_week, period):
    return _TrialEntry(
        id=entry.id,
        teacher_id=entry.teacher_id,
        classroom_id=entry.classroom_id,
        class_id=entry.class_id,
        day_of_week=day_of_week,
        period=period,
        course_name=entry.course.name,
        teacher_name=entry.teacher.name,
        classroom_name=entry.classroom.name,
        class_name=entry.class_id.name,
    )


def _detect_slot_conflicts(trial_entries):
    """对给定（同一时段或若干时段）的试算条目做教师/教室/班级冲突检测。

    返回冲突明细列表，结构与 Conflict 模型及前端展示保持一致。
    """
    conflicts = []
    by_slot = defaultdict(list)
    for e in trial_entries:
        by_slot[(e.day_of_week, e.period)].append(e)

    for (day, period), slot_entries in by_slot.items():
        for conflict_type, field, label_cn, name_field in _CONFLICT_SPECS:
            groups = defaultdict(list)
            for e in slot_entries:
                groups[getattr(e, field)].append(e)
            for _, involved in groups.items():
                if len(involved) <= 1:
                    continue
                conflicts.append({
                    'conflict_type': conflict_type,
                    'day_of_week': day,
                    'period': period,
                    'slot': slot_label(day, period),
                    'entity': getattr(involved[0], name_field),
                    'involved_entries': [e.id for e in involved],
                    'courses': [e.course_name for e in involved],
                    'message': (
                        f"{label_cn} {getattr(involved[0], name_field)} "
                        f"在{slot_label(day, period)}同时安排了 "
                        f"{len(involved)} 门课："
                        f"{'、'.join(e.course_name for e in involved)}"
                    ),
                })
    return conflicts


def _rebuild_slot_conflicts(semester, slots):
    """交换成功后，仅重算受影响时段的 Conflict 记录与条目冲突状态。

    slots 为 (day_of_week, period) 集合，覆盖交换双方原时段和目标时段。
    返回最新的冲突明细列表。
    """
    slot_q = Q()
    for day, period in slots:
        slot_q |= Q(day_of_week=day, period=period)

    entries = list(
        ScheduleEntry.objects.filter(semester=semester).filter(slot_q)
        .select_related('course', 'teacher', 'classroom', 'class_id')
    )
    trial_entries = [
        _entry_to_trial(e, e.day_of_week, e.period) for e in entries
    ]
    fresh_conflicts = _detect_slot_conflicts(trial_entries)

    # 删除这些时段上的旧冲突记录，按最新结果重建
    old_q = Q()
    for day, period in slots:
        old_q |= Q(day_of_week=day, period=period)
    Conflict.objects.filter(semester=semester).filter(old_q).delete()

    Conflict.objects.bulk_create([
        Conflict(
            semester=semester,
            conflict_type=c['conflict_type'],
            day_of_week=c['day_of_week'],
            period=c['period'],
            involved_entries=c['involved_entries'],
            message=c['message'],
        ) for c in fresh_conflicts
    ])

    # 同步受影响时段所有条目的冲突标记
    conflicted_ids = set()
    type_by_entry = {}
    for c in fresh_conflicts:
        for eid in c['involved_entries']:
            conflicted_ids.add(eid)
            type_by_entry.setdefault(eid, c['conflict_type'])

    touched_ids = [e.id for e in entries]
    for e in entries:
        e.is_conflict = e.id in conflicted_ids
        e.conflict_type = type_by_entry.get(e.id, '') if e.is_conflict else ''
    ScheduleEntry.objects.bulk_update(
        entries, ['is_conflict', 'conflict_type']
    )
    return fresh_conflicts, touched_ids


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

            all_entries = ScheduleEntry.objects.filter(
                semester=semester
            ).values('id', 'teacher_id', 'classroom_id', 'class_id', 'day_of_week', 'period')

            detector = ConflictDetector()
            conflicts = detector.detect_conflicts(list(all_entries))

            Conflict.objects.filter(semester=semester).delete()
            bulk_conflicts = []
            for c in conflicts:
                bulk_conflicts.append(Conflict(
                    semester=semester,
                    conflict_type=c['conflict_type'],
                    day_of_week=c['day_of_week'],
                    period=c['period'],
                    involved_entries=c['involved_entries'],
                    message=c['message']
                ))
            Conflict.objects.bulk_create(bulk_conflicts)

            for c in conflicts:
                for eid in c['involved_entries']:
                    try:
                        entry = ScheduleEntry.objects.get(id=eid)
                        entry.is_conflict = True
                        entry.conflict_type = c['conflict_type']
                        entry.save()
                    except ScheduleEntry.DoesNotExist:
                        pass

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
        entries = ScheduleEntry.objects.filter(
            semester_id=semester_id
        ).values('id', 'teacher_id', 'classroom_id', 'class_id', 'day_of_week', 'period')

        detector = ConflictDetector()
        conflicts = detector.detect_conflicts(list(entries))

        return Response({'conflicts': conflicts})

    @action(detail=False, methods=['post'])
    def swap(self, request):
        """教务员发起两节课调课（交换时段）。

        流程：先在内存中试算交换后教师/教室/班级三类占用，任一冲突则
        整笔拒绝（课表保持原样）并返回冲突时段与涉及课程；试算通过才在
        单个事务内交换时段并重算受影响时段的冲突记录与条目状态。
        同一 request_id 的重复或并发提交只生效一次。
        """
        req_serializer = SwapScheduleRequestSerializer(data=request.data)
        if not req_serializer.is_valid():
            return Response(
                {'status': 'error', 'errors': req_serializer.errors},
                status=status.HTTP_400_BAD_REQUEST
            )

        entry1_id = req_serializer.validated_data['entry1_id']
        entry2_id = req_serializer.validated_data['entry2_id']
        reason = req_serializer.validated_data.get('reason', '')
        request_id = req_serializer.validated_data.get('request_id') or None

        # 幂等：已处理过的提交（含并发的后到者）直接返回首次结果
        if request_id:
            existing = SwapRecord.objects.filter(request_id=request_id).first()
            if existing:
                return self._build_swap_record_response(existing)

        try:
            with transaction.atomic():
                # 锁定两行，阻止并发调课同时改动同一条目
                locked = list(
                    ScheduleEntry.objects.select_for_update()
                    .filter(id__in=[entry1_id, entry2_id])
                    .select_related('course', 'teacher', 'classroom', 'class_id', 'semester')
                    .order_by('id')
                )
                entry_map = {e.id: e for e in locked}
                entry1 = entry_map.get(entry1_id)
                entry2 = entry_map.get(entry2_id)

                if entry1 is None or entry2 is None:
                    return Response(
                        {'status': 'error', 'error': 'One or both entries not found'},
                        status=status.HTTP_404_NOT_FOUND
                    )

                # 拿到锁后再次确认幂等（并发提交可能在等待期间已被处理）
                if request_id:
                    existing = SwapRecord.objects.filter(
                        request_id=request_id
                    ).first()
                    if existing:
                        return self._build_swap_record_response(existing)

                if entry1.semester_id != entry2.semester_id:
                    return Response(
                        {
                            'status': 'error',
                            'error': '两门课不属于同一学期，不能调课',
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

                if entry1.is_locked or entry2.is_locked:
                    locked_names = [
                        f"{e.course.name}（{slot_label(e.day_of_week, e.period)}）"
                        for e in (entry1, entry2) if e.is_locked
                    ]
                    record = SwapRecord.objects.create(
                        request_id=request_id or f"rejected-{uuid4().hex}",
                        semester=entry1.semester,
                        entry1=entry1,
                        entry2=entry2,
                        entry1_id_snapshot=entry1_id,
                        entry2_id_snapshot=entry2_id,
                        reason=reason,
                        status='rejected',
                        conflicts=[{
                            'conflict_type': 'locked',
                            'day_of_week': None,
                            'period': None,
                            'slot': None,
                            'entity': None,
                            'involved_entries': [
                                e.id for e in (entry1, entry2) if e.is_locked
                            ],
                            'courses': locked_names,
                            'message': f"锁定课程不允许调课：{'、'.join(locked_names)}",
                        }],
                        message='调课被拒绝：存在锁定课程',
                    )
                    return self._build_swap_record_response(record)

                day1, period1 = entry1.day_of_week, entry1.period
                day2, period2 = entry2.day_of_week, entry2.period

                if (day1, period1) == (day2, period2):
                    record = SwapRecord.objects.create(
                        request_id=request_id or f"rejected-{uuid4().hex}",
                        semester=entry1.semester,
                        entry1=entry1,
                        entry2=entry2,
                        entry1_id_snapshot=entry1_id,
                        entry2_id_snapshot=entry2_id,
                        reason=reason,
                        status='rejected',
                        conflicts=[{
                            'conflict_type': 'same_slot',
                            'day_of_week': None,
                            'period': None,
                            'slot': None,
                            'entity': None,
                            'involved_entries': [entry1_id, entry2_id],
                            'courses': [],
                            'message': '两门课已在同一时段，无需调课',
                        }],
                        message='两门课已在同一时段，无需调课',
                    )
                    return self._build_swap_record_response(record)

                semester = entry1.semester

                # ---- 试算：构造交换后的占用镜像（不落库）----
                trial_entries = [
                    _entry_to_trial(entry1, day2, period2),
                    _entry_to_trial(entry2, day1, period1),
                ]
                occupants = ScheduleEntry.objects.filter(
                    semester=semester
                ).filter(
                    Q(day_of_week=day2, period=period2)
                    | Q(day_of_week=day1, period=period1)
                ).exclude(
                    id__in=[entry1_id, entry2_id]
                ).select_related('course', 'teacher', 'classroom', 'class_id')
                for o in occupants:
                    trial_entries.append(
                        _entry_to_trial(o, o.day_of_week, o.period)
                    )

                trial_conflicts = _detect_slot_conflicts(trial_entries)

                if trial_conflicts:
                    # 任一冲突：整笔拒绝，原课表不动，仅留拒绝记录
                    record = SwapRecord.objects.create(
                        request_id=request_id or f"rejected-{uuid4().hex}",
                        semester=semester,
                        entry1=entry1,
                        entry2=entry2,
                        entry1_id_snapshot=entry1_id,
                        entry2_id_snapshot=entry2_id,
                        reason=reason,
                        status='rejected',
                        conflicts=trial_conflicts,
                        message='试算未通过，调课被拒绝',
                    )
                    return self._build_swap_record_response(record)

                # ---- 试算通过：交换时段 ----
                entry1.day_of_week, entry1.period = day2, period2
                entry2.day_of_week, entry2.period = day1, period1
                entry1.save(update_fields=['day_of_week', 'period', 'updated_at'])
                entry2.save(update_fields=['day_of_week', 'period', 'updated_at'])

                # 重算双方原时段与目标时段的冲突记录和条目状态
                affected_slots = {
                    (day1, period1), (day2, period2),
                }
                fresh_conflicts, touched_ids = _rebuild_slot_conflicts(
                    semester, affected_slots
                )

                if reason:
                    SwapRequest.objects.create(
                        semester=semester,
                        requesting_teacher=entry1.teacher,
                        target_teacher=entry2.teacher,
                        entry1=entry1,
                        entry2=entry2,
                        reason=reason,
                        status='approved'
                    )

                record = SwapRecord.objects.create(
                    request_id=request_id or f"swapped-{uuid4().hex}",
                    semester=semester,
                    entry1=entry1,
                    entry2=entry2,
                    entry1_id_snapshot=entry1_id,
                    entry2_id_snapshot=entry2_id,
                    reason=reason,
                    status='swapped',
                    conflicts=fresh_conflicts,
                    message='调课成功，时段已交换',
                )

                return self._build_swap_record_response(
                    record, touched_ids=touched_ids
                )
        except IntegrityError:
            # 并发提交在 request_id 唯一约束上撞车：返回首次处理结果
            existing = SwapRecord.objects.filter(request_id=request_id).first()
            if existing:
                return self._build_swap_record_response(existing)
            raise

    @staticmethod
    def _build_swap_record_response(record, touched_ids=None):
        """根据 SwapRecord 构造统一响应；刷新后凭 request_id 也能拿到同样结果。"""
        entries = []
        for eid in (record.entry1_id, record.entry2_id):
            if eid is None:
                continue
            entry = ScheduleEntry.objects.filter(id=eid).select_related(
                'course', 'teacher', 'classroom', 'class_id', 'semester'
            ).first()
            if entry:
                entries.append(ScheduleEntryDetailSerializer(entry).data)

        if record.status == 'swapped':
            payload = {
                'status': 'success',
                'request_id': record.request_id,
                'message': record.message,
                'swap': {
                    'entry1': entries[0] if entries else None,
                    'entry2': entries[1] if len(entries) > 1 else None,
                },
                'remaining_conflicts': record.conflicts,
                'affected_entry_ids': touched_ids or sorted({
                    eid for c in record.conflicts for eid in c['involved_entries']
                }),
            }
            return Response(payload, status=status.HTTP_200_OK)

        http_status = status.HTTP_409_CONFLICT
        conflict_types = {c.get('conflict_type') for c in record.conflicts}
        if conflict_types == {'locked'}:
            http_status = status.HTTP_423_LOCKED
        elif conflict_types == {'same_slot'}:
            http_status = status.HTTP_400_BAD_REQUEST
        return Response({
            'status': 'rejected',
            'request_id': record.request_id,
            'message': record.message,
            'conflicts': record.conflicts,
            'swap': {
                'entry1': entries[0] if entries else None,
                'entry2': entries[1] if len(entries) > 1 else None,
            },
        }, status=http_status)

    @action(detail=False, methods=['get'], url_path=r'swap_status/(?P<request_id>[0-9A-Za-z_-]+)')
    def swap_status(self, request, request_id=None):
        """查询某次调课的交换结果或拒绝原因（页面刷新后恢复提示）。"""
        record = SwapRecord.objects.filter(request_id=request_id).first()
        if record is None:
            return Response(
                {'status': 'error', 'error': 'Swap record not found'},
                status=status.HTTP_404_NOT_FOUND
            )
        return self._build_swap_record_response(record)

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
