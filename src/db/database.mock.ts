// Web デモ用インメモリ DB（localStorage に自動保存）
import { Class, Student, AttendanceStatus, Timetable, TimetableSlot, Subject, EffectiveSlot } from "../types";

const STORE_KEY = 'attendance_demo';

interface Store {
  classes: { id: number; name: string; grade: string; timetable_id: number | null }[];
  students: { id: number; class_id: number; name: string; student_number: number | null }[];
  attendance: { id: number; student_id: number; date: string; status: string }[];
  timetables: { id: number; name: string }[];
  subjects: { id: number; name: string }[];
  timetable_slots: { id: number; timetable_id: number; day_of_week: number; period: number; subject_id: number }[];
  subject_attendance: { id: number; student_id: number; date: string; period: number }[];
  date_timetable: { date: string; timetable_id: number }[];
  date_class_slots: { id: number; date: string; class_id: number; period: number; subject_id: number }[];
  seq: Record<string, number>;
  seeded?: boolean;
}

function defaultStore(): Store {
  return {
    classes: [], students: [], attendance: [], timetables: [],
    subjects: [], timetable_slots: [], subject_attendance: [], date_timetable: [],
    date_class_slots: [],
    seq: { classes: 1, students: 1, attendance: 1, timetables: 1, subjects: 1, timetable_slots: 1, subject_attendance: 1, date_class_slots: 1 },
    seeded: false,
  };
}

// 過去の平日 N 日分の日付を返す
function recentWeekdays(n: number): string[] {
  const dates: string[] = [];
  const d = new Date();
  while (dates.length < n) {
    d.setDate(d.getDate() - 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) {
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }
  return dates.reverse();
}

function seedData() {
  const nid = (t: string) => { const id = store.seq[t] ?? 1; store.seq[t] = id + 1; return id; };

  // ── 授業登録 ────────────────────────────────────────────────
  const subjectNames = ['国語', '数学', '英語', '理科', '社会', '体育', '音楽', '美術'];
  const subjectMap = new Map<string, number>();
  subjectNames.forEach(name => {
    const id = nid('subjects');
    store.subjects.push({ id, name });
    subjectMap.set(name, id);
  });

  // ── クラス ────────────────────────────────────────────────
  const cls1 = { id: nid('classes'), name: 'A組', grade: '1年', timetable_id: null };
  const cls2 = { id: nid('classes'), name: 'B組', grade: '1年', timetable_id: null };
  store.classes.push(cls1, cls2);

  // ── 生徒（1年A組）────────────────────────────────────────
  const aStudents = [
    '田中 太郎', '佐藤 花子', '鈴木 一郎', '高橋 美咲', '渡辺 健太',
    '伊藤 さくら', '山本 翔', '中村 愛', '小林 龍', '加藤 奈々',
  ].map((name, i) => ({ id: nid('students'), class_id: cls1.id, name, student_number: i + 1 }));
  store.students.push(...aStudents);

  // ── 生徒（1年B組）────────────────────────────────────────
  const bStudents = [
    '松本 健一', '井上 由美', '木村 大輔', '林 あかり', '清水 拓也',
    '池田 莉子', '橋本 隼', '山田 すみれ',
  ].map((name, i) => ({ id: nid('students'), class_id: cls2.id, name, student_number: i + 1 }));
  store.students.push(...bStudents);

  // ── 時間割（前期時間割）──────────────────────────────────
  const tt = { id: nid('timetables'), name: '前期時間割' };
  store.timetables.push(tt);

  // 曜日(1=月〜6=土) × 時限(1〜6) の授業名
  const schedule: Record<number, Record<number, string>> = {
    1: { 1: '国語', 2: '数学', 3: '英語', 4: '理科', 5: '体育', 6: '音楽' },
    2: { 1: '数学', 2: '英語', 3: '社会', 4: '体育', 5: '国語', 6: '美術' },
    3: { 1: '英語', 2: '国語', 3: '数学', 4: '音楽', 5: '理科', 6: '社会' },
    4: { 1: '理科', 2: '社会', 3: '体育', 4: '国語', 5: '数学', 6: '英語' },
    5: { 1: '体育', 2: '理科', 3: '社会', 4: '英語', 5: '美術', 6: '数学' },
  };
  for (const [dow, periods] of Object.entries(schedule)) {
    for (const [period, subjectName] of Object.entries(periods)) {
      const sid = subjectMap.get(subjectName);
      if (sid !== undefined) {
        store.timetable_slots.push({
          id: nid('timetable_slots'),
          timetable_id: tt.id,
          day_of_week: Number(dow),
          period: Number(period),
          subject_id: sid,
        });
      }
    }
  }

  // ── 出席データ（直近 5 平日）────────────────────────────
  const days = recentWeekdays(5);

  // 各日に時間割を設定
  days.forEach(date => store.date_timetable.push({ date, timetable_id: tt.id }));

  // 欠席パターン（生徒インデックス → ステータス）
  const absencePatterns: { dayIdx: number; studentIdx: number; status: AttendanceStatus; attendedPeriods: number[] }[] = [
    { dayIdx: 0, studentIdx: 1, status: '欠席',  attendedPeriods: [] },
    { dayIdx: 0, studentIdx: 5, status: '遅刻',  attendedPeriods: [3, 4, 5] },
    { dayIdx: 1, studentIdx: 2, status: '欠席',  attendedPeriods: [] },
    { dayIdx: 1, studentIdx: 7, status: '早退',  attendedPeriods: [1, 2, 3] },
    { dayIdx: 2, studentIdx: 0, status: '公欠',  attendedPeriods: [1, 2, 3, 4, 5, 6] },
    { dayIdx: 2, studentIdx: 3, status: '遅刻',  attendedPeriods: [4, 5, 6] },
    { dayIdx: 3, studentIdx: 4, status: '忌引',  attendedPeriods: [] },
    { dayIdx: 3, studentIdx: 6, status: '欠席',  attendedPeriods: [] },
    { dayIdx: 4, studentIdx: 1, status: '遅刻',  attendedPeriods: [2, 3, 4, 5, 6] },
    { dayIdx: 4, studentIdx: 8, status: '早退',  attendedPeriods: [1, 2] },
  ];

  absencePatterns.forEach(({ dayIdx, studentIdx, status, attendedPeriods }) => {
    const date = days[dayIdx];
    const student = aStudents[studentIdx];
    if (!student || !date) return;

    store.attendance.push({ id: nid('attendance'), student_id: student.id, date, status });

    attendedPeriods.forEach(period => {
      store.subject_attendance.push({ id: nid('subject_attendance'), student_id: student.id, date, period });
    });
  });

  store.seeded = true;
}

let store: Store;
try {
  const raw = localStorage.getItem(STORE_KEY);
  const parsed = raw ? JSON.parse(raw) : null;
  // date_class_slots がない（旧バージョン）または subject_attendance が slot_id 形式の場合はリセット
  const isOldFormat = !parsed || !parsed.subjects || parsed.date_class_slots === undefined ||
    (parsed.subject_attendance?.length > 0 && 'slot_id' in parsed.subject_attendance[0]);
  store = isOldFormat ? defaultStore() : parsed as Store;
} catch {
  store = defaultStore();
}

if (!store.seeded) { seedData(); localStorage.setItem(STORE_KEY, JSON.stringify(store)); }

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
  store.date_class_slots = store.date_class_slots.filter(d => d.class_id !== id);
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

// ── Subjects ──────────────────────────────────────────────────────────────────
export async function getSubjects(): Promise<Subject[]> {
  return [...store.subjects].sort((a, b) => a.name.localeCompare(b.name));
}
export async function addSubject(name: string): Promise<number> {
  const id = nextId('subjects'); store.subjects.push({ id, name }); save(); return id;
}
export async function updateSubject(id: number, name: string): Promise<void> {
  const s = store.subjects.find(s => s.id === id); if (s) { s.name = name; save(); }
}
export async function deleteSubject(id: number): Promise<void> {
  store.timetable_slots = store.timetable_slots.filter(s => s.subject_id !== id);
  store.date_class_slots = store.date_class_slots.filter(d => d.subject_id !== id);
  store.subjects = store.subjects.filter(s => s.id !== id); save();
}

// Grid column index → day_of_week (Mon=col0…Sat=col5, Sun=col6)
const COL_TO_DOW = [1, 2, 3, 4, 5, 6, 0];

// ── Timetable Slots ───────────────────────────────────────────────────────────
export async function getTimetableSlots(timetableId: number): Promise<TimetableSlot[]> {
  return store.timetable_slots
    .filter(s => s.timetable_id === timetableId)
    .map(s => ({
      ...s,
      subject: store.subjects.find(sub => sub.id === s.subject_id)?.name ?? '',
    }))
    .filter(s => s.subject !== '')
    .sort((a, b) => a.day_of_week - b.day_of_week || a.period - b.period);
}
export async function saveTimetableGrid(timetableId: number, grid: (number | null)[][]): Promise<void> {
  for (let p = 0; p <= 10; p++) {
    for (let col = 0; col < 7; col++) {
      const subjectId = grid[p][col];
      const dow = COL_TO_DOW[col];
      if (subjectId !== null) {
        const existing = store.timetable_slots.find(
          s => s.timetable_id === timetableId && s.day_of_week === dow && s.period === p
        );
        if (existing) {
          existing.subject_id = subjectId;
        } else {
          store.timetable_slots.push({ id: nextId('timetable_slots'), timetable_id: timetableId, day_of_week: dow, period: p, subject_id: subjectId });
        }
      } else {
        store.timetable_slots = store.timetable_slots.filter(
          s => !(s.timetable_id === timetableId && s.day_of_week === dow && s.period === p)
        );
      }
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

// ── Date Class Slots (今日だけ変更) ──────────────────────────────────────────
export async function getDateClassSlotsRange(classId: number, startDate: string, endDate: string): Promise<Map<string, EffectiveSlot[]>> {
  const map = new Map<string, EffectiveSlot[]>();
  store.date_class_slots
    .filter(d => d.class_id === classId && d.date >= startDate && d.date <= endDate)
    .forEach(d => {
      const subject = store.subjects.find(s => s.id === d.subject_id)?.name ?? '';
      if (!subject) return;
      if (!map.has(d.date)) map.set(d.date, []);
      map.get(d.date)!.push({ period: d.period, subject });
    });
  map.forEach(slots => slots.sort((a, b) => a.period - b.period));
  return map;
}
export async function saveDateClassSlots(date: string, classId: number, slots: { period: number; subjectId: number }[]): Promise<void> {
  store.date_class_slots = store.date_class_slots.filter(d => !(d.date === date && d.class_id === classId));
  slots.forEach(slot => {
    store.date_class_slots.push({ id: nextId('date_class_slots'), date, class_id: classId, period: slot.period, subject_id: slot.subjectId });
  });
  save();
}
export async function deleteDateClassSlots(date: string, classId: number): Promise<void> {
  store.date_class_slots = store.date_class_slots.filter(d => !(d.date === date && d.class_id === classId));
  save();
}

// ── Subject Attendance ────────────────────────────────────────────────────────
export async function getSubjectAttendance(studentId: number, date: string): Promise<Set<number>> {
  return new Set(store.subject_attendance.filter(a => a.student_id === studentId && a.date === date).map(a => a.period));
}
export async function getSubjectAttendanceSetForRange(classId: number, startDate: string, endDate: string): Promise<Set<string>> {
  const sids = new Set(store.students.filter(s => s.class_id === classId).map(s => s.id));
  const set = new Set<string>();
  store.subject_attendance
    .filter(a => sids.has(a.student_id) && a.date >= startDate && a.date <= endDate)
    .forEach(a => set.add(`${a.student_id}_${a.date}_${a.period}`));
  return set;
}
export async function toggleSubjectAttendance(studentId: number, date: string, period: number, attended: boolean): Promise<void> {
  store.subject_attendance = store.subject_attendance.filter(a => !(a.student_id === studentId && a.date === date && a.period === period));
  if (attended) store.subject_attendance.push({ id: nextId('subject_attendance'), student_id: studentId, date, period });
  save();
}
export async function clearSubjectAttendanceForDate(date: string): Promise<void> {
  store.subject_attendance = store.subject_attendance.filter(a => a.date !== date); save();
}
export async function clearSubjectAttendanceForDateAndClass(date: string, classId: number): Promise<void> {
  const sids = new Set(store.students.filter(s => s.class_id === classId).map(s => s.id));
  store.subject_attendance = store.subject_attendance.filter(a => !(a.date === date && sids.has(a.student_id)));
  save();
}
