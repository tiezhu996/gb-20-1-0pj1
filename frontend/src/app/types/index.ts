export interface Classroom {
  id: number;
  name: string;
  capacity: number;
  room_type: 'normal' | 'lab' | 'multimedia';
  equipment: string[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Teacher {
  id: number;
  name: string;
  subject: string;
  phone?: string;
  email?: string;
  available_time_slots: { day: number; period: number }[];
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Class {
  id: number;
  grade: number;
  name: string;
  student_count: number;
  class_teacher?: number;
  class_teacher_name?: string;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Course {
  id: number;
  name: string;
  weekly_hours: number;
  preferred_room_type: 'normal' | 'lab' | 'multimedia';
  priority: 'high' | 'medium' | 'low';
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Semester {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  daily_periods: { name: string; order: number; start_time?: string; end_time?: string }[];
  weekly_days: number;
  holidays: string[];
  created_at?: string;
  updated_at?: string;
}

export interface ClassCourse {
  id: number;
  class_id: number;
  course: number;
  teacher: number;
  semester: number;
  course_name?: string;
  teacher_name?: string;
  class_name?: string;
  weekly_hours?: number;
}

export interface ScheduleEntry {
  id: number;
  semester: number;
  class_id: number;
  course: number;
  teacher: number;
  classroom: number;
  day_of_week: number;
  period: number;
  is_locked: boolean;
  is_conflict: boolean;
  conflict_type?: string;
  original_teacher?: number;
  original_teacher_name?: string;
  course_name?: string;
  teacher_name?: string;
  classroom_name?: string;
  class_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Conflict {
  id: number;
  semester: number;
  conflict_type: 'teacher' | 'classroom' | 'class';
  day_of_week: number;
  period: number;
  involved_entries: number[];
  message: string;
  resolved: boolean;
  created_at?: string;
}

export interface SwapRequest {
  id: number;
  semester: number;
  requesting_teacher: number;
  target_teacher: number;
  entry1: number;
  entry2: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  requesting_teacher_name?: string;
  target_teacher_name?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Substitute {
  id: number;
  semester: number;
  original_teacher: number;
  substitute_teacher: number;
  affected_entry: number;
  start_date: string;
  end_date: string;
  reason: string;
  is_active: boolean;
  original_teacher_name?: string;
  substitute_teacher_name?: string;
  created_at?: string;
  updated_at?: string;
}
