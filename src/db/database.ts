import Database from "@tauri-apps/plugin-sql";
import { Class, Student, AttendanceStatus, Timetable, TimetableSlot } from "../types";

let db: Database | null = null;

export async function getDB(): Promise<Database> {
  if (!db) {
    db = await Database.load("sqlite:attendance.db");
    await initDB(db);
  }
  return db;
}

async function initDB(db: Database): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      grade TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      student_number INTEGER,
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      UNIQUE(student_id, date),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS timetable_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timetable_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject TEXT NOT NULL,
      UNIQUE(timetable_id, day_of_week, period),
      FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subject_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      slot_id INTEGER NOT NULL,
      UNIQUE(student_id, date, slot_id),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS date_timetable (
      date TEXT PRIMARY KEY,
      timetable_id INTEGER NOT NULL,
      FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE
    )
  `);

  // migrations
  await db.execute(`UPDATE attendance SET status = '' WHERE status = '出席'`);
  try {
    await db.execute(`ALTER TABLE classes ADD COLUMN timetable_id INTEGER`);
  } catch { /* already exists */ }
}

function parseStatuses(raw: string): AttendanceStatus[] {
  return raw.split(',').filter(s => s && s !== '出席') as AttendanceStatus[];
}

// ── Classes ──────────────────────────────────────────────────────────────────

export async function getClasses(): Promise<Class[]> {
  const d = await getDB();
  return await d.select<Class[]>("SELECT * FROM classes ORDER BY grade, name");
}

export async function addClass(name: string, grade: string): Promise<void> {
  const d = await getDB();
  await d.execute("INSERT INTO classes (name, grade) VALUES (?, ?)", [name, grade]);
}

export async function updateClass(id: number, name: string, grade: string): Promise<void> {
  const d = await getDB();
  await d.execute("UPDATE classes SET name = ?, grade = ? WHERE id = ?", [name, grade, id]);
}

export async function deleteClass(id: number): Promise<void> {
  const d = await getDB();
  await d.execute("DELETE FROM classes WHERE id = ?", [id]);
}

export async function setClassTimetable(classId: number, timetableId: number | null): Promise<void> {
  const d = await getDB();
  await d.execute("UPDATE classes SET timetable_id = ? WHERE id = ?", [timetableId, classId]);
}

// ── Students ─────────────────────────────────────────────────────────────────

export async function getStudents(classId: number): Promise<Student[]> {
  const d = await getDB();
  return await d.select<Student[]>(
    "SELECT * FROM students WHERE class_id = ? ORDER BY student_number, name",
    [classId]
  );
}

export async function addStudent(classId: number, name: string, studentNumber: number | null): Promise<void> {
  const d = await getDB();
  await d.execute(
    "INSERT INTO students (class_id, name, student_number) VALUES (?, ?, ?)",
    [classId, name, studentNumber]
  );
}

export async function updateStudent(id: number, name: string, studentNumber: number | null): Promise<void> {
  const d = await getDB();
  await d.execute(
    "UPDATE students SET name = ?, student_number = ? WHERE id = ?",
    [name, studentNumber, id]
  );
}

export async function deleteStudent(id: number): Promise<void> {
  const d = await getDB();
  await d.execute("DELETE FROM students WHERE id = ?", [id]);
}

// ── Attendance ────────────────────────────────────────────────────────────────

export async function getAttendanceRange(
  classId: number,
  startDate: string,
  endDate: string
): Promise<Map<string, AttendanceStatus[]>> {
  const d = await getDB();
  const records = await d.select<{ student_id: number; date: string; status: string }[]>(
    `SELECT a.student_id, a.date, a.status FROM attendance a
     JOIN students s ON a.student_id = s.id
     WHERE s.class_id = ? AND a.date >= ? AND a.date <= ?
     ORDER BY a.date`,
    [classId, startDate, endDate]
  );
  const map = new Map<string, AttendanceStatus[]>();
  records.forEach(r => map.set(`${r.student_id}_${r.date}`, parseStatuses(r.status)));
  return map;
}

export async function upsertAttendance(
  studentId: number,
  date: string,
  statuses: AttendanceStatus[]
): Promise<void> {
  const d = await getDB();
  const statusStr = statuses.join(',');
  await d.execute(
    `INSERT INTO attendance (student_id, date, status, note) VALUES (?, ?, ?, '')
     ON CONFLICT(student_id, date) DO UPDATE SET status = excluded.status`,
    [studentId, date, statusStr]
  );
}

// ── Timetables ────────────────────────────────────────────────────────────────

export async function getTimetables(): Promise<Timetable[]> {
  const d = await getDB();
  return await d.select<Timetable[]>("SELECT * FROM timetables ORDER BY name");
}

export async function addTimetable(name: string): Promise<number> {
  const d = await getDB();
  const result = await d.execute("INSERT INTO timetables (name) VALUES (?)", [name]);
  return result.lastInsertId;
}

export async function renameTimetable(id: number, name: string): Promise<void> {
  const d = await getDB();
  await d.execute("UPDATE timetables SET name = ? WHERE id = ?", [name, id]);
}

export async function deleteTimetable(id: number): Promise<void> {
  const d = await getDB();
  await d.execute("DELETE FROM timetables WHERE id = ?", [id]);
}

// ── Timetable Slots ───────────────────────────────────────────────────────────

export async function getTimetableSlots(timetableId: number): Promise<TimetableSlot[]> {
  const d = await getDB();
  return await d.select<TimetableSlot[]>(
    "SELECT * FROM timetable_slots WHERE timetable_id = ? ORDER BY day_of_week, period",
    [timetableId]
  );
}

export async function saveTimetableGrid(timetableId: number, grid: string[][]): Promise<void> {
  const d = await getDB();
  // 既存スロットを削除して再挿入（subject_attendanceはJOINで参照するので孤立レコードは自然に無視される）
  await d.execute("DELETE FROM timetable_slots WHERE timetable_id = ?", [timetableId]);
  for (let p = 0; p <= 10; p++) {
    for (let day = 0; day < 6; day++) {
      const subject = grid[p][day].trim();
      if (subject) {
        await d.execute(
          "INSERT INTO timetable_slots (timetable_id, day_of_week, period, subject) VALUES (?, ?, ?, ?)",
          [timetableId, day + 1, p, subject]
        );
      }
    }
  }
}

// ── Date Timetable ────────────────────────────────────────────────────────────

export async function getDateTimetables(startDate: string, endDate: string): Promise<Map<string, number>> {
  const d = await getDB();
  const records = await d.select<{ date: string; timetable_id: number }[]>(
    'SELECT date, timetable_id FROM date_timetable WHERE date >= ? AND date <= ?',
    [startDate, endDate]
  );
  const map = new Map<string, number>();
  records.forEach(r => map.set(r.date, r.timetable_id));
  return map;
}

export async function setDateTimetable(date: string, timetableId: number | null): Promise<void> {
  const d = await getDB();
  if (timetableId === null) {
    await d.execute('DELETE FROM date_timetable WHERE date = ?', [date]);
  } else {
    await d.execute(
      `INSERT INTO date_timetable (date, timetable_id) VALUES (?, ?)
       ON CONFLICT(date) DO UPDATE SET timetable_id = excluded.timetable_id`,
      [date, timetableId]
    );
  }
}

// ── Subject Attendance ────────────────────────────────────────────────────────

export async function getSubjectAttendance(studentId: number, date: string): Promise<Set<number>> {
  const d = await getDB();
  const records = await d.select<{ slot_id: number }[]>(
    `SELECT sa.slot_id FROM subject_attendance sa
     JOIN timetable_slots ts ON sa.slot_id = ts.id
     WHERE sa.student_id = ? AND sa.date = ?`,
    [studentId, date]
  );
  return new Set(records.map(r => r.slot_id));
}

export async function getSubjectAttendanceSetForRange(
  classId: number,
  startDate: string,
  endDate: string
): Promise<Set<string>> {
  const d = await getDB();
  const records = await d.select<{ student_id: number; date: string; slot_id: number }[]>(
    `SELECT sa.student_id, sa.date, sa.slot_id
     FROM subject_attendance sa
     JOIN students s ON sa.student_id = s.id
     JOIN timetable_slots ts ON sa.slot_id = ts.id
     WHERE s.class_id = ? AND sa.date >= ? AND sa.date <= ?`,
    [classId, startDate, endDate]
  );
  const set = new Set<string>();
  records.forEach(r => set.add(`${r.student_id}_${r.date}_${r.slot_id}`));
  return set;
}

export async function clearSubjectAttendanceForDate(date: string): Promise<void> {
  const d = await getDB();
  await d.execute('DELETE FROM subject_attendance WHERE date = ?', [date]);
}

export async function toggleSubjectAttendance(
  studentId: number,
  date: string,
  slotId: number,
  attended: boolean
): Promise<void> {
  const d = await getDB();
  if (attended) {
    await d.execute(
      `INSERT OR IGNORE INTO subject_attendance (student_id, date, slot_id) VALUES (?, ?, ?)`,
      [studentId, date, slotId]
    );
  } else {
    await d.execute(
      `DELETE FROM subject_attendance WHERE student_id = ? AND date = ? AND slot_id = ?`,
      [studentId, date, slotId]
    );
  }
}
