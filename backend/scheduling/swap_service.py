"""调课（交换两条排课时段）领域服务。

- simulate_swap：在不落库的前提下，试算交换时段后的教师/教室/班级占用，
  只返回交换动作“新引入”的冲突（涉及两个目标时段），供整笔拒绝使用。
- rebuild_semester_conflicts：重算整学期冲突记录（Conflict），并同步所有
  课表条目的 is_conflict / conflict_type 状态。
"""
from typing import Dict, List

from .models import Conflict, ScheduleEntry
from .csp_solver import ConflictDetector

CONFLICT_TYPE_LABELS = {
    'teacher': '教师冲突',
    'classroom': '教室冲突',
    'class': '班级冲突',
}

DAY_LABELS = {1: '一', 2: '二', 3: '三', 4: '四', 5: '五', 6: '六', 7: '日'}


def _slot_label(day_of_week: int, period: int) -> str:
    return f"周{DAY_LABELS.get(day_of_week, day_of_week)}第{period}节"


def _enrich_conflicts(conflicts: List[Dict]) -> List[Dict]:
    """为检测出的冲突补充可读名称与涉及课程明细。

    ConflictDetector 产生的 message 只带资源ID（教师/教室/班级 id），
    调课拒绝时需要向教务员展示冲突时段与涉及课程，因此在这里统一丰富。
    """
    involved_ids = set()
    for c in conflicts:
        involved_ids.update(c.get('involved_entries', []))

    entries_map: Dict[int, ScheduleEntry] = {}
    if involved_ids:
        entries_map = {
            e.id: e for e in ScheduleEntry.objects.filter(
                id__in=involved_ids
            ).select_related('teacher', 'classroom', 'class_id', 'course')
        }

    enriched = []
    for c in conflicts:
        member_ids = c.get('involved_entries', [])
        members = [entries_map[eid] for eid in member_ids if eid in entries_map]

        label = CONFLICT_TYPE_LABELS.get(c['conflict_type'], c['conflict_type'])
        if c['conflict_type'] == 'teacher' and members:
            resource_name = members[0].teacher.name
        elif c['conflict_type'] == 'classroom' and members:
            resource_name = members[0].classroom.name
        elif c['conflict_type'] == 'class' and members:
            resource_name = members[0].class_id.name
        else:
            resource_name = ''

        course_details = [
            {
                'entry_id': e.id,
                'course_name': e.course.name,
                'teacher_name': e.teacher.name,
                'classroom_name': e.classroom.name,
                'class_name': e.class_id.name,
                'day_of_week': e.day_of_week,
                'period': e.period,
            }
            for e in members
        ]

        enriched.append({
            'conflict_type': c['conflict_type'],
            'conflict_type_label': label,
            'day_of_week': c['day_of_week'],
            'period': c['period'],
            'slot_label': _slot_label(c['day_of_week'], c['period']),
            'resource_name': resource_name,
            'involved_entries': member_ids,
            'involved_courses': course_details,
            'message': (
                f"{label}：{resource_name} 在{_slot_label(c['day_of_week'], c['period'])} "
                f"同时安排了 {len(members)} 门课"
                f"（{ '、'.join(d['course_name'] for d in course_details) }）"
            ),
        })
    return enriched


def detect_semester_conflicts(semester) -> List[Dict]:
    """按最新课表检测某学期冲突（不写库），返回带可读名称的冲突明细。"""
    entry_rows = list(ScheduleEntry.objects.filter(
        semester=semester
    ).values('id', 'teacher_id', 'classroom_id', 'class_id', 'day_of_week', 'period'))
    return _enrich_conflicts(ConflictDetector().detect_conflicts(entry_rows))


def rebuild_semester_conflicts(semester) -> List[Dict]:
    """重算某学期全部冲突记录，并回写相关条目的冲突状态。

    - 清除旧的 Conflict 记录后按最新课表重新检测并落库；
    - 所有条目先清空冲突标记，再按检测结果置位。
    自动排课与调课成功后均调用，保证冲突数据与课表一致。
    """
    entries_qs = ScheduleEntry.objects.filter(
        semester=semester
    ).select_related('teacher', 'classroom', 'class_id', 'course')

    conflicts = detect_semester_conflicts(semester)

    Conflict.objects.filter(semester=semester).delete()
    if conflicts:
        Conflict.objects.bulk_create([
            Conflict(
                semester=semester,
                conflict_type=c['conflict_type'],
                day_of_week=c['day_of_week'],
                period=c['period'],
                involved_entries=c['involved_entries'],
                message=c['message'],
            )
            for c in conflicts
        ])

    # 先统一清空标记，再按检测结果置位（条目不再冲突时必须清除旧标记）
    entries_qs.update(is_conflict=False, conflict_type='')
    for c in conflicts:
        entries_qs.filter(id__in=c['involved_entries']).update(
            is_conflict=True,
            conflict_type=c['conflict_type'],
        )

    return conflicts


def simulate_swap(
    entry1: ScheduleEntry,
    entry2: ScheduleEntry,
) -> List[Dict]:
    """试算交换两条条目时段后是否产生新的占用冲突。

    以学期内全部条目为基础构造“假设已交换”的快照，再用统一的
    ConflictDetector 检测，最后只保留与两个目标时段相关的冲突——
    这样既不会漏掉交换动作引入的任何教师/教室/班级冲突，
    也不会被课表中既有的、与本次调课无关的历史冲突干扰。
    """
    target_slots = {
        (entry2.day_of_week, entry2.period),
        (entry1.day_of_week, entry1.period),
    }

    simulated: List[Dict] = []
    for e in ScheduleEntry.objects.filter(
        semester_id=entry1.semester_id
    ).values('id', 'teacher_id', 'classroom_id', 'class_id', 'day_of_week', 'period'):
        row = dict(e)
        if e['id'] == entry1.id:
            row['day_of_week'], row['period'] = entry2.day_of_week, entry2.period
        elif e['id'] == entry2.id:
            row['day_of_week'], row['period'] = entry1.day_of_week, entry1.period
        simulated.append(row)

    raw_conflicts = ConflictDetector().detect_conflicts(simulated)
    introduced = [
        c for c in raw_conflicts
        if (c['day_of_week'], c['period']) in target_slots
    ]
    return _enrich_conflicts(introduced)
