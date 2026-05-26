import Database from "@tauri-apps/plugin-sql";
import { Class, Student, AttendanceStatus, Timetable, TimetableSlot, Subject, EffectiveSlot } from "../types";

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
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    )
  `);
  // timetable_slots は migration 後に CREATE TABLE IF NOT EXISTS で保証する（後述）
  await db.execute(`
    CREATE TABLE IF NOT EXISTS date_timetable (
      date TEXT PRIMARY KEY,
      timetable_id INTEGER NOT NULL,
      FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE
    )
  `);
  await db.execute(`
    CREATE TABLE IF NOT EXISTS date_class_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      class_id INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      UNIQUE(date, class_id, period),
      FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )
  `);

  // ── migrations ────────────────────────────────────────────────────────────
  await db.execute(`UPDATE attendance SET status = '' WHERE status = '出席'`);
  try {
    await db.execute(`ALTER TABLE classes ADD COLUMN timetable_id INTEGER`);
  } catch { /* already exists */ }

  // timetable_slots: 旧スキーマ(subject TEXT NOT NULL) → 新スキーマ(subject_id FK)
  try {
    const cols = await db.select<{ name: string }[]>(`PRAGMA table_info(timetable_slots)`);
    if (cols.some(c => c.name === 'subject')) {
      const oldData = await db.select<{ subject: string }[]>(
        `SELECT DISTINCT subject FROM timetable_slots WHERE subject != '' AND subject IS NOT NULL`
      );
      for (const row of oldData) {
        await db.execute(`INSERT OR IGNORE INTO subjects (name) VALUES (?)`, [row.subject]);
      }
      await db.execute(`DROP TABLE IF EXISTS timetable_slots_new`);
      await db.execute(`
        CREATE TABLE timetable_slots_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timetable_id INTEGER NOT NULL,
          day_of_week INTEGER NOT NULL,
          period INTEGER NOT NULL,
          subject_id INTEGER NOT NULL,
          UNIQUE(timetable_id, day_of_week, period),
          FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE,
          FOREIGN KEY (subject_id) REFERENCES subjects(id)
        )
      `);
      await db.execute(`
        INSERT OR IGNORE INTO timetable_slots_new (id, timetable_id, day_of_week, period, subject_id)
        SELECT ts.id, ts.timetable_id, ts.day_of_week, ts.period, s.id
        FROM timetable_slots ts
        JOIN subjects s ON s.name = ts.subject
        WHERE ts.subject != '' AND ts.subject IS NOT NULL
      `);
      await db.execute(`DROP TABLE timetable_slots`);
      await db.execute(`ALTER TABLE timetable_slots_new RENAME TO timetable_slots`);
    }
  } catch { /* migration failed or already on new schema */ }

  // timetable_slots_new の残骸があれば名前を戻す
  try {
    const rows = await db.select<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='timetable_slots_new'`
    );
    if (rows.length > 0) {
      await db.execute(`ALTER TABLE timetable_slots_new RENAME TO timetable_slots`);
    }
  } catch { /* ignore */ }

  // 安全網
  await db.execute(`
    CREATE TABLE IF NOT EXISTS timetable_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timetable_id INTEGER NOT NULL,
      day_of_week INTEGER NOT NULL,
      period INTEGER NOT NULL,
      subject_id INTEGER NOT NULL,
      UNIQUE(timetable_id, day_of_week, period),
      FOREIGN KEY (timetable_id) REFERENCES timetables(id) ON DELETE CASCADE,
      FOREIGN KEY (subject_id) REFERENCES subjects(id)
    )
  `);

  // subject_attendance: 旧スキーマ(slot_id FK) → 新スキーマ(period INTEGER)
  try {
    const cols = await db.select<{ name: string }[]>(`PRAGMA table_info(subject_attendance)`);
    if (cols.some(c => c.name === 'slot_id')) {
      await db.execute(`DROP TABLE IF EXISTS subject_attendance_new`);
      await db.execute(`
        CREATE TABLE subject_attendance_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          date TEXT NOT NULL,
          period INTEGER NOT NULL,
          UNIQUE(student_id, date, period),
          FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
        )
      `);
      await db.execute(`
        INSERT OR IGNORE INTO subject_attendance_new (student_id, date, period)
        SELECT sa.student_id, sa.date, ts.period
        FROM subject_attendance sa
        JOIN timetable_slots ts ON sa.slot_id = ts.id
      `);
      await db.execute(`DROP TABLE subject_attendance`);
      await db.execute(`ALTER TABLE subject_attendance_new RENAME TO subject_attendance`);
    }
  } catch { /* migration failed or already on new schema */ }

  // subject_attendance_new の残骸があれば名前を戻す
  try {
    const rows = await db.select<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='subject_attendance_new'`
    );
    if (rows.length > 0) {
      await db.execute(`ALTER TABLE subject_attendance_new RENAME TO subject_attendance`);
    }
  } catch { /* ignore */ }

  // 安全網
  await db.execute(`
    CREATE TABLE IF NOT EXISTS subject_attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      period INTEGER NOT NULL,
      UNIQUE(student_id, date, period),
      FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
    )
  `);
}

function parseStatuses(raw: string): AttendanceStatus[] {
  return raw.split(',').filter(s => s && s !== '出席') as AttendanceStatus[];
}

// Grid column index → day_of_week value (0=日, 1=月 … 6=土)
const COL_TO_DOW = [1, 2, 3, 4, 5, 6, 0]; // Mon=col0 … Sat=col5, Sun=col6

// ── Classes ───────────────────────────────────────────────────────────────────

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

// ── Students ──────────────────────────────────────────────────────────────────

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
  return result.lastInsertId ?? 0;
}

export async function renameTimetable(id: number, name: string): Promise<void> {
  const d = await getDB();
  await d.execute("UPDATE timetables SET name = ? WHERE id = ?", [name, id]);
}

export async function deleteTimetable(id: number): Promise<void> {
  const d = await getDB();
  await d.execute("DELETE FROM timetables WHERE id = ?", [id]);
}

// ── Subjects ──────────────────────────────────────────────────────────────────

export async function getSubjects(): Promise<Subject[]> {
  const d = await getDB();
  return await d.select<Subject[]>("SELECT * FROM subjects ORDER BY name");
}

export async function addSubject(name: string): Promise<number> {
  const d = await getDB();
  const result = await d.execute("INSERT INTO subjects (name) VALUES (?)", [name]);
  return result.lastInsertId ?? 0;
}

export async function updateSubject(id: number, name: string): Promise<void> {
  const d = await getDB();
  await d.execute("UPDATE subjects SET name = ? WHERE id = ?", [name, id]);
}

export async function deleteSubject(id: number): Promise<void> {
  const d = await getDB();
  await d.execute("DELETE FROM timetable_slots WHERE subject_id = ?", [id]);
  await d.execute("DELETE FROM date_class_slots WHERE subject_id = ?", [id]);
  await d.execute("DELETE FROM subjects WHERE id = ?", [id]);
}

// ── Timetable Slots ───────────────────────────────────────────────────────────

export async function getTimetableSlots(timetableId: number): Promise<TimetableSlot[]> {
  const d = await getDB();
  return await d.select<TimetableSlot[]>(
    `SELECT ts.id, ts.timetable_id, ts.day_of_week, ts.period, ts.subject_id, s.name AS subject
     FROM timetable_slots ts
     JOIN subjects s ON ts.subject_id = s.id
     WHERE ts.timetable_id = ?
     ORDER BY ts.day_of_week, ts.period`,
    [timetableId]
  );
}

export async function saveTimetableGrid(timetableId: number, grid: (number | null)[][]): Promise<void> {
  const d = await getDB();
  for (let p = 0; p <= 10; p++) {
    for (let col = 0; col < 7; col++) {
      const subjectId = grid[p][col];
      const dow = COL_TO_DOW[col];
      if (subjectId !== null) {
        await d.execute(
          `INSERT INTO timetable_slots (timetable_id, day_of_week, period, subject_id) VALUES (?, ?, ?, ?)
           ON CONFLICT(timetable_id, day_of_week, period) DO UPDATE SET subject_id = excluded.subject_id`,
          [timetableId, dow, p, subjectId]
        );
      } else {
        await d.execute(
          `DELETE FROM timetable_slots WHERE timetable_id = ? AND day_of_week = ? AND period = ?`,
          [timetableId, dow, p]
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

// ── Date Class Slots (今日だけ変更) ──────────────────────────────────────────

export async function getDateClassSlotsRange(
  classId: number,
  startDate: string,
  endDate: string
): Promise<Map<string, EffectiveSlot[]>> {
  const d = await getDB();
  const records = await d.select<{ date: string; period: number; subject: string }[]>(
    `SELECT dcs.date, dcs.period, s.name AS subject
     FROM date_class_slots dcs
     JOIN subjects s ON dcs.subject_id = s.id
     WHERE dcs.class_id = ? AND dcs.date >= ? AND dcs.date <= ?
     ORDER BY dcs.date, dcs.period`,
    [classId, startDate, endDate]
  );
  const map = new Map<string, EffectiveSlot[]>();
  records.forEach(r => {
    if (!map.has(r.date)) map.set(r.date, []);
    map.get(r.date)!.push({ period: r.period, subject: r.subject });
  });
  return map;
}

export async function saveDateClassSlots(
  date: string,
  classId: number,
  slots: { period: number; subjectId: number }[]
): Promise<void> {
  const d = await getDB();
  await d.execute('DELETE FROM date_class_slots WHERE date = ? AND class_id = ?', [date, classId]);
  for (const slot of slots) {
    await d.execute(
      'INSERT INTO date_class_slots (date, class_id, period, subject_id) VALUES (?, ?, ?, ?)',
      [date, classId, slot.period, slot.subjectId]
    );
  }
}

export async function deleteDateClassSlots(date: string, classId: number): Promise<void> {
  const d = await getDB();
  await d.execute('DELETE FROM date_class_slots WHERE date = ? AND class_id = ?', [date, classId]);
}

// ── Subject Attendance ────────────────────────────────────────────────────────

export async function getSubjectAttendance(studentId: number, date: string): Promise<Set<number>> {
  const d = await getDB();
  const records = await d.select<{ period: number }[]>(
    `SELECT period FROM subject_attendance WHERE student_id = ? AND date = ?`,
    [studentId, date]
  );
  return new Set(records.map(r => r.period));
}

export async function getSubjectAttendanceSetForRange(
  classId: number,
  startDate: string,
  endDate: string
): Promise<Set<string>> {
  const d = await getDB();
  const records = await d.select<{ student_id: number; date: string; period: number }[]>(
    `SELECT sa.student_id, sa.date, sa.period
     FROM subject_attendance sa
     JOIN students s ON sa.student_id = s.id
     WHERE s.class_id = ? AND sa.date >= ? AND sa.date <= ?`,
    [classId, startDate, endDate]
  );
  const set = new Set<string>();
  records.forEach(r => set.add(`${r.student_id}_${r.date}_${r.period}`));
  return set;
}

export async function clearSubjectAttendanceForDate(date: string): Promise<void> {
  const d = await getDB();
  await d.execute('DELETE FROM subject_attendance WHERE date = ?', [date]);
}

export async function clearSubjectAttendanceForDateAndClass(date: string, classId: number): Promise<void> {
  const d = await getDB();
  await d.execute(
    `DELETE FROM subject_attendance WHERE date = ? AND student_id IN (SELECT id FROM students WHERE class_id = ?)`,
    [date, classId]
  );
}

export async function toggleSubjectAttendance(
  studentId: number,
  date: string,
  period: number,
  attended: boolean
): Promise<void> {
  const d = await getDB();
  if (attended) {
    await d.execute(
      `INSERT OR IGNORE INTO subject_attendance (student_id, date, period) VALUES (?, ?, ?)`,
      [studentId, date, period]
    );
  } else {
    await d.execute(
      `DELETE FROM subject_attendance WHERE student_id = ? AND date = ? AND period = ?`,
      [studentId, date, period]
    );
  }
}
