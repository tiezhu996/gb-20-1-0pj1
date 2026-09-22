from django.db import models


class Classroom(models.Model):
    CLASSROOM_TYPES = [
        ('normal', '普通教室'),
        ('lab', '实验室'),
        ('multimedia', '多媒体教室'),
    ]

    name = models.CharField(max_length=100)
    capacity = models.IntegerField()
    room_type = models.CharField(max_length=20, choices=CLASSROOM_TYPES, default='normal')
    equipment = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} ({self.get_room_type_display()})"


class Teacher(models.Model):
    name = models.CharField(max_length=100)
    subject = models.CharField(max_length=100)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    available_time_slots = models.JSONField(default=list, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.name} - {self.subject}"


class Class(models.Model):
    GRADES = [
        (1, '一年级'),
        (2, '二年级'),
        (3, '三年级'),
        (4, '四年级'),
        (5, '五年级'),
        (6, '六年级'),
        (7, '初一'),
        (8, '初二'),
        (9, '初三'),
        (10, '高一'),
        (11, '高二'),
        (12, '高三'),
    ]

    grade = models.IntegerField(choices=GRADES)
    name = models.CharField(max_length=50)
    student_count = models.IntegerField(default=0)
    class_teacher = models.ForeignKey(Teacher, on_delete=models.SET_NULL, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['grade', 'name']
        verbose_name_plural = 'Classes'

    def __str__(self):
        return f"{self.get_grade_display()} {self.name}"


class Course(models.Model):
    PRIORITY_CHOICES = [
        ('high', '高优先级（主科）'),
        ('medium', '中优先级'),
        ('low', '低优先级'),
    ]

    name = models.CharField(max_length=100)
    weekly_hours = models.IntegerField(help_text='每周课时数')
    preferred_room_type = models.CharField(
        max_length=20,
        choices=Classroom.CLASSROOM_TYPES,
        default='normal'
    )
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['priority', 'name']

    def __str__(self):
        return self.name


class Semester(models.Model):
    name = models.CharField(max_length=100)
    start_date = models.DateField()
    end_date = models.DateField()
    is_active = models.BooleanField(default=False)
    daily_periods = models.JSONField(default=list, help_text='每天的时间段配置')
    weekly_days = models.IntegerField(default=5, help_text='每周上课天数')
    holidays = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-start_date']

    def __str__(self):
        return self.name
