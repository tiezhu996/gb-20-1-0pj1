from django.contrib import admin
from .models import Classroom, Teacher, Class, Course, Semester

admin.site.register(Classroom)
admin.site.register(Teacher)
admin.site.register(Class)
admin.site.register(Course)
admin.site.register(Semester)
