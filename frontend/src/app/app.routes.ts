import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard.component').then(m => m.DashboardComponent)
  },
  {
    path: 'classrooms',
    loadComponent: () => import('./pages/classrooms/classrooms.component').then(m => m.ClassroomsComponent)
  },
  {
    path: 'teachers',
    loadComponent: () => import('./pages/teachers/teachers.component').then(m => m.TeachersComponent)
  },
  {
    path: 'classes',
    loadComponent: () => import('./pages/classes/classes.component').then(m => m.ClassesComponent)
  },
  {
    path: 'courses',
    loadComponent: () => import('./pages/courses/courses.component').then(m => m.CoursesComponent)
  },
  {
    path: 'semesters',
    loadComponent: () => import('./pages/semesters/semesters.component').then(m => m.SemestersComponent)
  },
  {
    path: 'class-courses',
    loadComponent: () => import('./pages/class-courses/class-courses.component').then(m => m.ClassCoursesComponent)
  },
  {
    path: 'timetable',
    loadComponent: () => import('./pages/timetable/timetable.component').then(m => m.TimetableComponent)
  },
  {
    path: 'conflicts',
    loadComponent: () => import('./pages/conflicts/conflicts.component').then(m => m.ConflictsComponent)
  }
];
