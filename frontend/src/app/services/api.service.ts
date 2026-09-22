import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import type {
  Classroom, Teacher, Class, Course, Semester,
  ClassCourse, ScheduleEntry, Conflict, SwapRequest, Substitute
} from '../types';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private baseUrl = environment.apiUrl;

  constructor(private http: HttpClient) {}

  getClassrooms(): Observable<Classroom[]> {
    return this.http.get<Classroom[]>(`${this.baseUrl}/classrooms/`);
  }

  createClassroom(data: Partial<Classroom>): Observable<Classroom> {
    return this.http.post<Classroom>(`${this.baseUrl}/classrooms/`, data);
  }

  updateClassroom(id: number, data: Partial<Classroom>): Observable<Classroom> {
    return this.http.put<Classroom>(`${this.baseUrl}/classrooms/${id}/`, data);
  }

  deleteClassroom(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/classrooms/${id}/`);
  }

  getTeachers(): Observable<Teacher[]> {
    return this.http.get<Teacher[]>(`${this.baseUrl}/teachers/`);
  }

  createTeacher(data: Partial<Teacher>): Observable<Teacher> {
    return this.http.post<Teacher>(`${this.baseUrl}/teachers/`, data);
  }

  updateTeacher(id: number, data: Partial<Teacher>): Observable<Teacher> {
    return this.http.put<Teacher>(`${this.baseUrl}/teachers/${id}/`, data);
  }

  deleteTeacher(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/teachers/${id}/`);
  }

  getClasses(): Observable<Class[]> {
    return this.http.get<Class[]>(`${this.baseUrl}/classes/`);
  }

  createClass(data: Partial<Class>): Observable<Class> {
    return this.http.post<Class>(`${this.baseUrl}/classes/`, data);
  }

  updateClass(id: number, data: Partial<Class>): Observable<Class> {
    return this.http.put<Class>(`${this.baseUrl}/classes/${id}/`, data);
  }

  deleteClass(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/classes/${id}/`);
  }

  getCourses(): Observable<Course[]> {
    return this.http.get<Course[]>(`${this.baseUrl}/courses/`);
  }

  createCourse(data: Partial<Course>): Observable<Course> {
    return this.http.post<Course>(`${this.baseUrl}/courses/`, data);
  }

  updateCourse(id: number, data: Partial<Course>): Observable<Course> {
    return this.http.put<Course>(`${this.baseUrl}/courses/${id}/`, data);
  }

  deleteCourse(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/courses/${id}/`);
  }

  getSemesters(): Observable<Semester[]> {
    return this.http.get<Semester[]>(`${this.baseUrl}/semesters/`);
  }

  createSemester(data: Partial<Semester>): Observable<Semester> {
    return this.http.post<Semester>(`${this.baseUrl}/semesters/`, data);
  }

  updateSemester(id: number, data: Partial<Semester>): Observable<Semester> {
    return this.http.put<Semester>(`${this.baseUrl}/semesters/${id}/`, data);
  }

  deleteSemester(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/semesters/${id}/`);
  }

  getClassCourses(semesterId?: number): Observable<ClassCourse[]> {
    let params = new HttpParams();
    if (semesterId) params = params.set('semester', semesterId.toString());
    return this.http.get<ClassCourse[]>(`${this.baseUrl}/class-courses/`, { params });
  }

  createClassCourse(data: Partial<ClassCourse>): Observable<ClassCourse> {
    return this.http.post<ClassCourse>(`${this.baseUrl}/class-courses/`, data);
  }

  deleteClassCourse(id: number): Observable<void> {
    return this.http.delete<void>(`${this.baseUrl}/class-courses/${id}/`);
  }

  getSchedulesBySemester(semesterId: number): Observable<ScheduleEntry[]> {
    const params = new HttpParams().set('semester_id', semesterId.toString());
    return this.http.get<ScheduleEntry[]>(`${this.baseUrl}/schedules/by_semester/`, { params });
  }

  getSchedulesByClass(semesterId: number, classId: number): Observable<ScheduleEntry[]> {
    const params = new HttpParams()
      .set('semester_id', semesterId.toString())
      .set('class_id', classId.toString());
    return this.http.get<ScheduleEntry[]>(`${this.baseUrl}/schedules/by_class/`, { params });
  }

  getSchedulesByTeacher(semesterId: number, teacherId: number): Observable<ScheduleEntry[]> {
    const params = new HttpParams()
      .set('semester_id', semesterId.toString())
      .set('teacher_id', teacherId.toString());
    return this.http.get<ScheduleEntry[]>(`${this.baseUrl}/schedules/by_teacher/`, { params });
  }

  getSchedulesByClassroom(semesterId: number, classroomId: number): Observable<ScheduleEntry[]> {
    const params = new HttpParams()
      .set('semester_id', semesterId.toString())
      .set('classroom_id', classroomId.toString());
    return this.http.get<ScheduleEntry[]>(`${this.baseUrl}/schedules/by_classroom/`, { params });
  }

  updateScheduleEntry(id: number, data: Partial<ScheduleEntry>): Observable<ScheduleEntry> {
    return this.http.patch<ScheduleEntry>(`${this.baseUrl}/schedules/${id}/`, data);
  }

  autoSchedule(semesterId: number, respectLocked = true): Observable<any> {
    return this.http.post(`${this.baseUrl}/schedules/auto_schedule/`, {
      semester_id: semesterId,
      respect_locked: respectLocked
    });
  }

  swapEntries(entry1Id: number, entry2Id: number, reason?: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/schedules/swap/`, {
      entry1_id: entry1Id,
      entry2_id: entry2Id,
      reason
    });
  }

  assignSubstitute(entryId: number, substituteTeacherId: number, startDate: string, endDate: string, reason: string): Observable<any> {
    return this.http.post(`${this.baseUrl}/schedules/substitute/`, {
      entry_id: entryId,
      substitute_teacher_id: substituteTeacherId,
      start_date: startDate,
      end_date: endDate,
      reason
    });
  }

  getConflicts(): Observable<Conflict[]> {
    return this.http.get<Conflict[]>(`${this.baseUrl}/conflicts/`);
  }

  getSwapRequests(): Observable<SwapRequest[]> {
    return this.http.get<SwapRequest[]>(`${this.baseUrl}/swap-requests/`);
  }

  getSubstitutes(): Observable<Substitute[]> {
    return this.http.get<Substitute[]>(`${this.baseUrl}/substitutes/`);
  }

  exportPdf(semesterId: number, type: 'class' | 'teacher' | 'classroom', id: number): Observable<Blob> {
    const params = new HttpParams()
      .set('semester_id', semesterId.toString())
      .set('type', type)
      .set('id', id.toString());
    return this.http.get(`${this.baseUrl}/schedules/export_pdf/`, {
      params,
      responseType: 'blob'
    });
  }
}
