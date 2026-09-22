from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    ClassroomViewSet, TeacherViewSet,
    ClassViewSet, CourseViewSet, SemesterViewSet
)

router = DefaultRouter()
router.register(r'classrooms', ClassroomViewSet)
router.register(r'teachers', TeacherViewSet)
router.register(r'classes', ClassViewSet)
router.register(r'courses', CourseViewSet)
router.register(r'semesters', SemesterViewSet)

urlpatterns = [
    path('', include(router.urls)),
]
