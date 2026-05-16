// Web デモ用インメモリ DB（localStorage に自動保存）
import { Class, Student, AttendanceStatus, Timetable, TimetableSlot } from "../types";

const STORE_KEY = 'attendance_demo';

interface Store {
  classes: { id: number; name: string; grade: string; timetable_id: number | null }[];
  students: { id: number; class_id: number; name: string; student_number: number | null }[];
  attendance: { id: number; student_id: number; date: string; status: string }[];
  timetables: { id: number; name: string }[];
  timetable_slots: { id: number; timetable_id: number; day_of_week: number; period: number; subject: string }[];
  subject_attendance: { id: number; student_id: number; date: string; slot_id: number }[];
  date_timetable: { date: string; timetable_id: number }[];
  seq: Record<string, number>;
}

function defaultStore(): Store {
  return {
    classes: [], students: [], attendance: [], timetables: [],
    timetable_slots: [], subject_attendance: [], date_timetable: [],
    seq: { classes: 1, students: 1, attendance: 1, timetables: 1, timetable_slots: 1, subject_attendance: 1 },
  };
}

let store: Store;
try {
  const raw = localStorage.getItem(STORE_KEY);
  store = raw ? JSON.parse(raw) : defaultStore();
} catch {
  store = defaultStore();
}

function save() { localStorage.setItem(STORE_KEY, JSON.stringify(store)); }
function nextId(t: string): number { const id = store.seq[t] ?? 1; store.seq[t] = id + 1; return id; }

// ── getDB (no-op) ─────────────────────────────────────────────────────────────
export async function getDB() { return {}; }

// ── Classes ───────────────────────────────────────────────────────────────────
export async function getClasses(): Promise<Class[]> {
  return [...store.classes].sort((a, b) => a.grade.localeCompare(b.grade) || a.name.localeCompare(b.name));
}
export async function addClass(name: string, grade: string): Promise<void> {
  store.classes.push({ id: nextId('classes'), name, grade, timetable_id: null }); save();
}
export async function updateClass(id: number, name: string, grade: string): Promise<void> {
  const c = store.classes.find(c => c.id === id); if (c) { c.name = name; c.grade = grade; save(); }
}
export async function deleteClass(id: number): Promise<void> {
  const sids = store.students.filter(s => s.class_id === id).map(s => s.id);
  store.attendance = store.attendance.filter(a => !sids.includes(a.student_id));
  store.subject_attendance = store.subject_attendance.filter(a => !sids.includes(a.student_id));
  store.students = store.students.filter(s => s.class_id !== id);
  store.classes = store.classes.filter(c => c.id !== id); save();
}
export async function setClassTimetable(classId: number, timetableId: number | null): Promise<void> {
  const c = store.classes.find(c => c.id === classId); if (c) { c.timetable_id = timetableId; save(); }
}

// ── Students ──────────────────────────────────────────────────────────────────
export async function getStudents(classId: number): Promise<Student[]> {
  return store.students
    .filter(s => s.class_id === classId)
    .sort((a, b) => (a.student_number ?? 999) - (b.student_number ?? 999));
}
export async function addStudent(classId: number, name: string, studentNumber: number | null): Promise<void> {
  store.students.push({ id: nextId('students'), class_id: classId, name, student_number: studentNumber }); save();
}
export async function updateStudent(id: number, name: string, studentNumber: number | null): Promise<void> {
  const s = store.students.find(s => s.id === id); if (s) { s.name = name; s.student_number = studentNumber; save(); }
}
export async function deleteStudent(id: number): Promise<void> {
  store.attendance = store.attendance.filter(a => a.student_id !== id);
  store.subject_attendance = store.subject_attendance.filter(a => a.student_id !== id);
  store.students = store.students.filter(s => s.id !== id); save();
}

// ── Attendance ────────────────────────────────────────────────────────────────
export async function getAttendanceRange(classId: number, startDate: string, endDate: string): Promise<Map<string, AttendanceStatus[]>> {
  const sids = new Set(store.students.filter(s => s.class_id === classId).map(s => s.id));
  const map = new Map<string, AttendanceStatus[]>();
  store.attendance
    .filter(a => sids.has(a.student_id) && a.date >= startDate && a.date <= endDate)
    .forEach(a => {
      map.set(`${a.student_id}_${a.date}`, a.status.split(',').filter(s => s && s !== '出席') as AttendanceStatus[]);
    });
  return map;
}
export async function upsertAttendance(studentId: number, date: string, statuses: AttendanceStatus[]): Promise<void> {
  const existing = store.attendance.find(a => a.student_id === studentId && a.date === date);
  if (existing) existing.status = statuses.join(',');
  else store.attendance.push({ id: nextId('attendance'), student_id: studentId, date, status: statuses.join(',') });
  save();
}

// ── Timetables ────────────────────────────────────────────────────────────────
export async function getTimetables(): Promise<Timetable[]> {
  return [...store.timetables].sort((a, b) => a.name.localeCompare(b.name));
}
export async function addTimetable(name: string): Promise<number> {
  const id = nextId('timetables'); store.timetables.push({ id, name }); save(); return id;
}
export async function renameTimetable(id: number, name: string): Promise<void> {
  const t = store.timetables.find(t => t.id === id); if (t) { t.name = name; save(); }
}
export async function deleteTimetable(id: number): Promise<void> {
  store.timetable_slots = store.timetable_slots.filter(s => s.timetable_id !== id);
  store.timetables = store.timetables.filter(t => t.id !== id); save();
}

// ── Timetable Slots ───────────────────────────────────────────────────────────
export async function getTimetableSlots(timetableId: number): Promise<TimetableSlot[]> {
  return store.timetable_slots
    .filter(s => s.timetable_id === timetableId)
    .sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period);
}
export async function saveTimetableGrid(timetableId: number, grid: string[][]): Promise<void> {
  store.timetable_slots = store.timetable_slots.filter(s => s.timetable_id !== timetableId);
  for (let p = 0; p <= 10; p++) {
    for (let day = 0; day < 6; day++) {
      const subject = grid[p][day].trim();
      if (subject) store.timetable_slots.push({ id: nextId('timetable_slots'), timetable_id: timetableId, day_of_week: day + 1, period: p, subject });
    }
  }
  save();
}

// ── Date Timetable ────────────────────────────────────────────────────────────
export async function getDateTimetables(startDate: string, endDate: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  store.date_timetable.filter(d => d.date >= startDate && d.date <= endDate).forEach(d => map.set(d.date, d.timetable_id));
  return map;
}
export async function setDateTimetable(date: string, timetableId: number | null): Promise<void> {
  store.date_timetable = store.date_timetable.filter(d => d.date !== date);
  if (timetableId !== null) store.date_timetable.push({ date, timetable_id: timetableId });
  save();
}

// ── Subject Attendance ────────────────────────────────────────────────────────
export async function getSubjectAttendance(studentId: number, date: string): Promise<Set<number>> {
  const validSlotIds = new Set(store.timetable_slots.map(s => s.id));
  return new Set(store.subject_attendance.filter(a => a.student_id === studentId && a.date === date && validSlotIds.has(a.slot_id)).map(a => a.slot_id));
}
export async function getSubjectAttendanceSetForRange(classId: number, startDate: string, endDate: string): Promise<Set<string>> {
  const sids = new Set(store.students.filter(s => s.class_id === classId).map(s => s.id));
  const validSlotIds = new Set(store.timetable_slots.map(s => s.id));
  const set = new Set<string>();
  store.subject_attendance
    .filter(a => sids.has(a.student_id) && a.date >= startDate && a.date <= endDate && validSlotIds.has(a.slot_id))
    .forEach(a => set.add(`${a.student_id}_${a.date}_${a.slot_id}`));
  return set;
}
export async function toggleSubjectAttendance(studentId: number, date: string, slotId: number, attended: boolean): Promise<void> {
  store.subject_attendance = store.subject_attendance.filter(a => !(a.student_id === studentId && a.date === date && a.slot_id === slotId));
  if (attended) store.subject_attendance.push({ id: nextId('subject_attendance'), student_id: studentId, date, slot_id: slotId });
  save();
}
export async function clearSubjectAttendanceForDate(date: string): Promise<void> {
  store.subject_attendance = store.subject_attendance.filter(a => a.date !== date); save();
}
