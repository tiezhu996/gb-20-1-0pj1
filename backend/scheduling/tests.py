from datetime import date
from threading import Thread

from django.db import connections
from django.test import TransactionTestCase
from rest_framework.test import APIClient

from core.models import Class, Classroom, Course, Semester, Teacher
from .models import Conflict, ScheduleEntry, SwapRecord


def make_semester():
    return Semester.objects.create(
        name='2026 春季', start_date=date(2026, 2, 16), end_date=date(2026, 7, 1),
        daily_periods=[{'name': f'第{i}节', 'order': i} for i in range(1, 8)],
        weekly_days=5,
    )


def make_entry(semester, cls, course, teacher, classroom, day, period, **kwargs):
    return ScheduleEntry.objects.create(
        semester=semester, class_id=cls, course=course, teacher=teacher,
        classroom=classroom, day_of_week=day, period=period, **kwargs
    )


class SwapAPITestCase(TransactionTestCase):
    def setUp(self):
        self.client = APIClient()
        self.semester = make_semester()

        self.t1 = Teacher.objects.create(name='张老师', subject='数学')
        self.t2 = Teacher.objects.create(name='李老师', subject='语文')
        self.t3 = Teacher.objects.create(name='王老师', subject='英语')

        self.room1 = Classroom.objects.create(name='101', capacity=40, room_type='normal')
        self.room2 = Classroom.objects.create(name='201', capacity=40, room_type='normal')
        self.room3 = Classroom.objects.create(name='实验室', capacity=40, room_type='lab')

        self.c1 = Class.objects.create(grade=7, name='1班', student_count=40)
        self.c2 = Class.objects.create(grade=7, name='2班', student_count=40)

        self.math = Course.objects.create(name='数学', weekly_hours=1, priority='high')
        self.chinese = Course.objects.create(name='语文', weekly_hours=1, priority='medium')
        self.english = Course.objects.create(name='英语', weekly_hours=1, priority='medium')

    def _swap(self, id1, id2, token=None, reason=''):
        payload = {'entry1_id': id1, 'entry2_id': id2, 'reason': reason}
        if token:
            payload['client_token'] = token
        return self.client.post('/api/schedules/swap/', payload, format='json')

    def test_successful_swap_swaps_slots_and_records(self):
        # c1 周一1节 数学(t1, room1)；c2 周二2节 语文(t2, room2) —— 交换无冲突
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)

        resp = self._swap(e1.id, e2.id, token='tok-success', reason='教师外出')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()['status'], 'success')
        self.assertFalse(resp.json()['replayed'])

        e1.refresh_from_db()
        e2.refresh_from_db()
        self.assertEqual((e1.day_of_week, e1.period), (2, 2))
        self.assertEqual((e2.day_of_week, e2.period), (1, 1))
        # 教师/教室/班级资源随条目一起移动，并未交换
        self.assertEqual(e1.teacher_id, self.t1.id)
        self.assertEqual(e1.classroom_id, self.room1.id)

        record = SwapRecord.objects.get(client_token='tok-success')
        self.assertEqual(record.status, 'success')
        self.assertEqual(record.reason, '教师外出')

    def test_teacher_conflict_rejects_and_keeps_original(self):
        # 周一1节: c1 数学 t1@room1
        # 周二2节: c2 语文 t2@room2, c1 英语 t1@room3（无冲突，c1 当天2节）
        # 若交换 e1/e2：c1 数学(t1) 移动到周二2节，与 c1 英语(t1) 教师冲突，
        # 同时 c1 周二2节出现两节 → 班级冲突。整笔应被拒绝。
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)
        make_entry(self.semester, self.c1, self.english, self.t1, self.room3, 2, 2)

        resp = self._swap(e1.id, e2.id, token='tok-teacher-conflict')
        self.assertEqual(resp.status_code, 409)
        body = resp.json()
        self.assertEqual(body['status'], 'rejected')

        conflict_types = {c['conflict_type'] for c in body['conflicts']}
        self.assertIn('teacher', conflict_types)
        self.assertIn('class', conflict_types)
        # 冲突定位到目标时段，且列出涉及课程
        teacher_conflict = next(c for c in body['conflicts'] if c['conflict_type'] == 'teacher')
        self.assertEqual((teacher_conflict['day_of_week'], teacher_conflict['period']), (2, 2))
        course_names = {d['course_name'] for d in teacher_conflict['involved_courses']}
        self.assertIn('数学', course_names)
        self.assertIn('英语', course_names)

        # 失败保留原课表
        e1.refresh_from_db()
        e2.refresh_from_db()
        self.assertEqual((e1.day_of_week, e1.period), (1, 1))
        self.assertEqual((e2.day_of_week, e2.period), (2, 2))

        # 拒绝也落库为 SwapRecord
        self.assertEqual(
            SwapRecord.objects.get(client_token='tok-teacher-conflict').status,
            'rejected'
        )
        # 拒绝不得新增冲突记录（原课表本就无冲突）
        self.assertEqual(Conflict.objects.count(), 0)

    def test_classroom_conflict_rejects(self):
        # 周二2节 room1 另有 c2 英语(t3)；e1 带 room1 移入周二2节即产生教室冲突。
        # 交换后 e2 离开周二2节，那里不再有班级冲突，故试算恰好只有教室冲突。
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)
        make_entry(self.semester, self.c2, self.english, self.t3, self.room1, 2, 2)

        resp = self._swap(e1.id, e2.id, token='tok-room-conflict')
        self.assertEqual(resp.status_code, 409)
        conflict_types = {c['conflict_type'] for c in resp.json()['conflicts']}
        self.assertEqual(conflict_types, {'classroom'})
        # 失败保留原课表
        e1.refresh_from_db()
        e2.refresh_from_db()
        self.assertEqual((e1.day_of_week, e1.period), (1, 1))
        self.assertEqual((e2.day_of_week, e2.period), (2, 2))

    def test_locked_entry_cannot_swap(self):
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1,
                        is_locked=True)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)

        resp = self._swap(e1.id, e2.id, token='tok-locked')
        self.assertEqual(resp.status_code, 400)
        self.assertIn('锁定', resp.json()['error'])
        e1.refresh_from_db()
        e2.refresh_from_db()
        self.assertEqual((e1.day_of_week, e1.period), (1, 1))
        self.assertEqual((e2.day_of_week, e2.period), (2, 2))
        self.assertEqual(SwapRecord.objects.count(), 0)

    def test_duplicate_submit_same_token_applies_once(self):
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)

        first = self._swap(e1.id, e2.id, token='dup-token')
        second = self._swap(e1.id, e2.id, token='dup-token')
        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.json()['replayed'])
        self.assertEqual(SwapRecord.objects.filter(client_token='dup-token').count(), 1)

        e1.refresh_from_db()
        e2.refresh_from_db()
        # 第二次不能再交换回去
        self.assertEqual((e1.day_of_week, e1.period), (2, 2))
        self.assertEqual((e2.day_of_week, e2.period), (1, 1))

    def test_rejected_swap_same_token_is_idempotent(self):
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)
        make_entry(self.semester, self.c1, self.english, self.t1, self.room3, 2, 2)

        first = self._swap(e1.id, e2.id, token='reject-dup')
        second = self._swap(e1.id, e2.id, token='reject-dup')
        self.assertEqual(first.status_code, 409)
        self.assertEqual(second.status_code, 409)
        self.assertTrue(second.json()['replayed'])
        self.assertEqual(SwapRecord.objects.filter(client_token='reject-dup').count(), 1)

    def test_swap_result_endpoint_replays_after_refresh(self):
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        e2 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room2, 2, 2)
        self._swap(e1.id, e2.id, token='query-me')

        resp = self.client.get('/api/schedules/swap_result/', {'client_token': 'query-me'})
        self.assertEqual(resp.status_code, 200)
        body = resp.json()
        self.assertEqual(body['status'], 'success')
        self.assertTrue(body['replayed'])
        self.assertIsNotNone(body['entry1'])
        self.assertIsNotNone(body['entry2'])

    def test_conflict_flags_rebuilt_after_swap(self):
        # 课前存在一个教师冲突：t1 周一1节有两条（分属 c1/c3）；
        # 把其中一条换到空闲的周三3节后冲突解除
        c3 = Class.objects.create(grade=7, name='3班', student_count=40)
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)
        make_entry(self.semester, c3, self.english, self.t1, self.room2, 1, 1)
        e3 = make_entry(self.semester, self.c2, self.chinese, self.t2, self.room3, 3, 3)

        from .swap_service import rebuild_semester_conflicts
        rebuild_semester_conflicts(self.semester)
        self.assertEqual(Conflict.objects.count(), 1)
        self.assertTrue(ScheduleEntry.objects.get(id=e1.id).is_conflict)

        # e1 与 e3 交换：t1 的课移到周三3节（空闲），冲突应消除
        resp = self._swap(e1.id, e3.id, token='rebuild-token')
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(Conflict.objects.count(), 0)
        self.assertFalse(ScheduleEntry.objects.get(id=e1.id).is_conflict)
        self.assertFalse(ScheduleEntry.objects.get(id=e3.id).is_conflict)

    def test_validation_errors(self):
        e1 = make_entry(self.semester, self.c1, self.math, self.t1, self.room1, 1, 1)

        # 与自身交换
        resp = self._swap(e1.id, e1.id, token='self')
        self.assertEqual(resp.status_code, 400)

        # 不存在的条目
        resp = self._swap(e1.id, 999999, token='missing')
        self.assertEqual(resp.status_code, 404)

        # 跨学期
        other = make_semester()
        e_other = make_entry(other, self.c1, self.chinese, self.t2, self.room2, 2, 2)
        resp = self._swap(e1.id, e_other.id, token='cross-semester')
        self.assertEqual(resp.status_code, 400)


class SwapConcurrencyTestCase(TransactionTestCase):
    """并发提交相同令牌时，只有一笔真正执行。

    依赖数据库行锁（SELECT ... FOR UPDATE）串行化并发事务，
    SQLite 不支持行锁，故该用例只在 PostgreSQL 上运行。
    """

    databases = '__all__'

    def setUp(self):
        self.client = APIClient()
        self.semester = make_semester()
        self.t1 = Teacher.objects.create(name='张老师', subject='数学')
        self.t2 = Teacher.objects.create(name='李老师', subject='语文')
        self.room1 = Classroom.objects.create(name='101', capacity=40)
        self.room2 = Classroom.objects.create(name='201', capacity=40)
        self.c1 = Class.objects.create(grade=7, name='1班', student_count=40)
        self.c2 = Class.objects.create(grade=7, name='2班', student_count=40)
        self.course1 = Course.objects.create(name='数学', weekly_hours=1)
        self.course2 = Course.objects.create(name='语文', weekly_hours=1)
        self.e1 = make_entry(self.semester, self.c1, self.course1, self.t1, self.room1, 1, 1)
        self.e2 = make_entry(self.semester, self.c2, self.course2, self.t2, self.room2, 2, 2)

    def test_concurrent_requests_same_token_only_one_swap(self):
        from django.db import connection
        if connection.vendor != 'postgresql':
            self.skipTest('并发调课用例依赖 PostgreSQL 行锁')

        results = []
        errors = []

        def fire(barrier):
            # 每个线程使用独立数据库连接（事务隔离）
            client = APIClient()
            try:
                barrier.wait()
                resp = client.post('/api/schedules/swap/', {
                    'entry1_id': self.e1.id,
                    'entry2_id': self.e2.id,
                    'client_token': 'concurrent-token',
                }, format='json')
                results.append((resp.status_code, resp.json()))
            except Exception as exc:  # noqa: BLE001 - 测试中需要收集线程异常
                errors.append(exc)
            finally:
                connections.close_all()

        import threading
        barrier = threading.Barrier(2)
        threads = [Thread(target=fire, args=(barrier,)) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()

        self.assertFalse(errors, f'并发请求出现异常: {errors}')
        statuses = sorted(r[0] for r in results)
        self.assertEqual(statuses, [200, 200])
        replayed_count = sum(1 for _, body in results if body['replayed'])
        self.assertEqual(replayed_count, 1)
        self.assertEqual(
            SwapRecord.objects.filter(client_token='concurrent-token').count(), 1
        )

        self.e1.refresh_from_db()
        self.e2.refresh_from_db()
        self.assertEqual((self.e1.day_of_week, self.e1.period), (2, 2))
        self.assertEqual((self.e2.day_of_week, self.e2.period), (1, 1))
