export type AttendanceStatus = '欠席' | '遅刻' | '早退' | '公欠' | '忌引';

export interface Class {
  id: number;
  name: string;
  grade: string;
  timetable_id: number | null;
}

export interface Student {
  id: number;
  class_id: number;
  name: string;
  student_number: number | null;
}

export interface AttendanceRecord {
  id?: number;
  student_id: number;
  date: string;
  statuses: AttendanceStatus[];
}

export interface Timetable {
  id: number;
  name: string;
}

export interface TimetableSlot {
  id: number;
  timetable_id: number;
  day_of_week: number; // 1=月 2=火 3=水 4=木 5=金 6=土
  period: number;      // 1〜6
  subject: string;
}
