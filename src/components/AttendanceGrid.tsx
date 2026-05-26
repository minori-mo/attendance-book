import { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import { Class, Student, AttendanceStatus, TimetableSlot, Timetable, Subject, EffectiveSlot } from "../types";
import {
  getClasses, getStudents, getAttendanceRange, upsertAttendance,
  getTimetables, getTimetableSlots, getSubjects,
  getDateTimetables, setDateTimetable,
  getDateClassSlotsRange, saveDateClassSlots, deleteDateClassSlots,
  getSubjectAttendance, getSubjectAttendanceSetForRange,
  toggleSubjectAttendance, clearSubjectAttendanceForDate, clearSubjectAttendanceForDateAndClass,
} from "../db/database";

const STATUSES: { value: AttendanceStatus; label: string; color: string; abbr: string }[] = [
  { value: '欠席', label: '欠席', color: '#ef9a9a', abbr: '欠' },
  { value: '遅刻', label: '遅刻', color: '#fff176', abbr: '遅' },
  { value: '早退', label: '早退', color: '#ffcc80', abbr: '早' },
  { value: '公欠', label: '公欠', color: '#90caf9', abbr: '公' },
  { value: '忌引', label: '忌引', color: '#ce93d8', abbr: '忌' },
];

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

type DayInfo = { date: string; year: number; month: number; day: number; dow: number };

function getDaysInRange(startMonth: string, endMonth: string): DayInfo[] {
  const [sy, sm] = startMonth.split('-').map(Number);
  const [ey, em] = endMonth.split('-').map(Number);
  const end = new Date(ey, em, 0);
  const days: DayInfo[] = [];
  const cur = new Date(sy, sm - 1, 1);
  while (cur <= end) {
    days.push({
      date: formatDate(cur.getFullYear(), cur.getMonth() + 1, cur.getDate()),
      year: cur.getFullYear(),
      month: cur.getMonth() + 1,
      day: cur.getDate(),
      dow: cur.getDay(),
    });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function getMonthGroups(days: DayInfo[]): { label: string; count: number }[] {
  const groups: { label: string; count: number }[] = [];
  for (const d of days) {
    const label = `${d.year}年${d.month}月`;
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.count++;
    else groups.push({ label, count: 1 });
  }
  return groups;
}

function stickyStyle(left: number, isHeader = false, isEven = false): React.CSSProperties {
  return {
    position: 'sticky',
    left,
    zIndex: isHeader ? 4 : 2,
    background: isHeader ? '#e3f2fd' : isEven ? '#eef1fb' : '#fff',
    boxShadow: left > 0 ? '2px 0 4px rgba(0,0,0,0.08)' : undefined,
    minWidth: left === 0 ? 44 : 100,
    textAlign: left === 0 ? 'center' : 'left',
    padding: '6px 8px',
    whiteSpace: 'nowrap',
    fontWeight: isHeader ? 'bold' : 'normal',
    color: isHeader ? '#1565c0' : undefined,
    borderBottom: '1px solid #e0e0e0',
    borderRight: '1px solid #e0e0e0',
  };
}

const STORAGE_KEY = 'attendance_grid_state';

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as { classId: number; startMonth: string; endMonth: string };
  } catch {
    return null;
  }
}

function AttendanceGrid() {
  const saved = loadSavedState();
  const [classes, setClasses] = useState<Class[]>([]);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(saved?.classId ?? null);
  const [startMonth, setStartMonth] = useState(saved?.startMonth ?? currentYearMonth());
  const [endMonth, setEndMonth] = useState(saved?.endMonth ?? currentYearMonth());
  const [students, setStudents] = useState<Student[]>([]);
  const [attendanceMap, setAttendanceMap] = useState<Map<string, AttendanceStatus[]>>(new Map());
  const [dateTimetableMap, setDateTimetableMap] = useState<Map<string, number>>(new Map());
  const [dateSlots, setDateSlots] = useState<Map<string, EffectiveSlot[]>>(new Map());
  const [dateClassSlotsMap, setDateClassSlotsMap] = useState<Map<string, EffectiveSlot[]>>(new Map());
  const [subjectAttendanceSet, setSubjectAttendanceSet] = useState<Set<string>>(new Set());
  const [showSummary, setShowSummary] = useState(true);

  const [popover, setPopover] = useState<{ studentId: number; date: string } | null>(null);
  const [currentDaySlots, setCurrentDaySlots] = useState<EffectiveSlot[]>([]);
  const [subjectAttended, setSubjectAttended] = useState<Set<number>>(new Set());
  const [headerPopover, setHeaderPopover] = useState<{ date: string; x: number; y: number } | null>(null);

  const [overrideEditor, setOverrideEditor] = useState<{ date: string } | null>(null);
  const [overrideGrid, setOverrideGrid] = useState<(number | null)[]>(Array(11).fill(null));

  const [nameCellLeft, setNameCellLeft] = useState(50);
  const [summaryColLeft, setSummaryColLeft] = useState(150);
  const [subjectColLeft, setSubjectColLeft] = useState(270);
  const numColRef = useRef<HTMLTableCellElement>(null);
  const nameColRef = useRef<HTMLTableCellElement>(null);
  const summaryColRef = useRef<HTMLTableCellElement>(null);
  const headerPopoverRef = useRef<HTMLDivElement>(null);
  const slotsCache = useRef<Map<number, Map<number, EffectiveSlot[]>>>(new Map());

  useEffect(() => {
    Promise.all([getClasses(), getTimetables(), getSubjects()]).then(([cls, tt, subs]) => {
      setClasses(cls);
      setTimetables(tt);
      setSubjects(subs);
      if (cls.length > 0 && selectedClassId === null) setSelectedClassId(cls[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedClassId !== null) {
      loadData();
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ classId: selectedClassId, startMonth, endMonth }));
    }
  }, [selectedClassId, startMonth, endMonth]);

  const getDateRange = () => {
    const [sy, sm] = startMonth.split('-').map(Number);
    const [ey, em] = endMonth.split('-').map(Number);
    const startDate = `${sy}-${String(sm).padStart(2, '0')}-01`;
    const lastDay = new Date(ey, em, 0).getDate();
    const endDate = `${ey}-${String(em).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate, endDate };
  };

  const loadData = async () => {
    if (selectedClassId === null) return;
    const { startDate, endDate } = getDateRange();

    const [studentList, aMap, dtMap, saSet, dcsMap] = await Promise.all([
      getStudents(selectedClassId),
      getAttendanceRange(selectedClassId, startDate, endDate),
      getDateTimetables(startDate, endDate),
      getSubjectAttendanceSetForRange(selectedClassId, startDate, endDate),
      getDateClassSlotsRange(selectedClassId, startDate, endDate),
    ]);
    setStudents(studentList);
    setAttendanceMap(aMap);
    setDateTimetableMap(dtMap);
    setSubjectAttendanceSet(saSet);
    setDateClassSlotsMap(dcsMap);
    slotsCache.current.clear();
  };

  useEffect(() => {
    const numW = numColRef.current?.getBoundingClientRect().width ?? 50;
    const nameW = nameColRef.current?.getBoundingClientRect().width ?? 100;
    const sumW = summaryColRef.current?.getBoundingClientRect().width ?? 120;
    setNameCellLeft(numW);
    setSummaryColLeft(numW + nameW);
    setSubjectColLeft(numW + nameW + sumW);
  }, [students, showSummary]);

  useEffect(() => {
    if (dateTimetableMap.size === 0) { setDateSlots(new Map()); return; }
    const uniqueIds = [...new Set(dateTimetableMap.values())];
    Promise.all(uniqueIds.map(id => getTimetableSlots(id).then(s => ({ id, slots: s }))))
      .then(results => {
        const byTimetable = new Map(results.map(r => [r.id, r.slots]));
        const ds = new Map<string, EffectiveSlot[]>();
        dateTimetableMap.forEach((ttId, date) => {
          const dow = new Date(date).getDay();
          ds.set(date, (byTimetable.get(ttId) ?? [])
            .filter((s: TimetableSlot) => s.day_of_week === dow)
            .map((s: TimetableSlot) => ({ period: s.period, subject: s.subject })));
        });
        setDateSlots(ds);
      });
  }, [dateTimetableMap]);

  useEffect(() => {
    if (!popover) { setCurrentDaySlots([]); setSubjectAttended(new Set()); return; }
    const overrideSlots = dateClassSlotsMap.get(popover.date);
    if (overrideSlots) {
      setCurrentDaySlots(overrideSlots);
      getSubjectAttendance(popover.studentId, popover.date).then(setSubjectAttended);
      return;
    }
    const timetableId = dateTimetableMap.get(popover.date);
    const dow = new Date(popover.date).getDay();

    const loadSlots = async () => {
      let byDay = slotsCache.current.get(timetableId!);
      if (!byDay) {
        const slots = await getTimetableSlots(timetableId!);
        byDay = new Map<number, EffectiveSlot[]>();
        slots.forEach(s => {
          if (!byDay!.has(s.day_of_week)) byDay!.set(s.day_of_week, []);
          byDay!.get(s.day_of_week)!.push({ period: s.period, subject: s.subject });
        });
        byDay.forEach(list => list.sort((a, b) => a.period - b.period));
        slotsCache.current.set(timetableId!, byDay);
      }
      setCurrentDaySlots(byDay.get(dow) ?? []);
    };

    if (timetableId) loadSlots(); else setCurrentDaySlots([]);
    getSubjectAttendance(popover.studentId, popover.date).then(setSubjectAttended);
  }, [popover?.studentId, popover?.date, dateTimetableMap, dateClassSlotsMap]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (headerPopoverRef.current && !headerPopoverRef.current.contains(e.target as Node)) setHeaderPopover(null);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (overrideEditor) { setOverrideEditor(null); return; }
      if (popover) { setPopover(null); return; }
      setHeaderPopover(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overrideEditor, popover]);

  const getEffectiveSlots = (date: string): EffectiveSlot[] =>
    dateClassSlotsMap.get(date) ?? dateSlots.get(date) ?? [];

  const handleCellClick = (e: React.MouseEvent, studentId: number, date: string) => {
    e.stopPropagation();
    if (popover?.studentId === studentId && popover?.date === date) { setPopover(null); return; }
    setHeaderPopover(null);
    setPopover({ studentId, date });
  };

  const handleHeaderClick = (e: React.MouseEvent, date: string) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (headerPopover?.date === date) { setHeaderPopover(null); return; }
    setPopover(null);
    setHeaderPopover({ date, x: rect.left, y: rect.bottom + 4 });
  };

  const handleDateTimetableChange = async (date: string, timetableId: number | null) => {
    await Promise.all([setDateTimetable(date, timetableId), clearSubjectAttendanceForDate(date)]);
    setDateTimetableMap(prev => {
      const next = new Map(prev);
      if (timetableId === null) next.delete(date); else next.set(date, timetableId);
      return next;
    });
    slotsCache.current.clear();
  };

  const handleOpenOverrideEditor = (date: string) => {
    const subjectIdByName = new Map(subjects.map(s => [s.name, s.id]));
    const existingOverride = dateClassSlotsMap.get(date);
    const source = existingOverride ?? dateSlots.get(date) ?? [];
    const grid: (number | null)[] = Array(11).fill(null);
    source.forEach(slot => { grid[slot.period] = subjectIdByName.get(slot.subject) ?? null; });
    setOverrideGrid(grid);
    setHeaderPopover(null);
    setOverrideEditor({ date });
  };

  const handleSaveOverride = async () => {
    if (!overrideEditor || selectedClassId === null) return;
    const slots = overrideGrid
      .map((subjectId, period) => ({ period, subjectId }))
      .filter((s): s is { period: number; subjectId: number } => s.subjectId !== null);
    await saveDateClassSlots(overrideEditor.date, selectedClassId, slots);
    const { startDate, endDate } = getDateRange();
    const newMap = await getDateClassSlotsRange(selectedClassId, startDate, endDate);
    setDateClassSlotsMap(newMap);
    setOverrideEditor(null);
  };

  const handleDeleteOverride = async () => {
    if (!overrideEditor || selectedClassId === null) return;
    await deleteDateClassSlots(overrideEditor.date, selectedClassId);
    await clearSubjectAttendanceForDateAndClass(overrideEditor.date, selectedClassId);
    const { startDate, endDate } = getDateRange();
    const [newMap, saSet] = await Promise.all([
      getDateClassSlotsRange(selectedClassId, startDate, endDate),
      getSubjectAttendanceSetForRange(selectedClassId, startDate, endDate),
    ]);
    setDateClassSlotsMap(newMap);
    setSubjectAttendanceSet(saSet);
    setOverrideEditor(null);
  };

  const toggleStatus = async (status: AttendanceStatus) => {
    if (!popover) return;
    const key = `${popover.studentId}_${popover.date}`;
    const current = attendanceMap.get(key) ?? [];
    const newStatuses = current.includes(status) ? current.filter(s => s !== status) : [...current, status];
    setAttendanceMap(prev => { const n = new Map(prev); n.set(key, newStatuses); return n; });
    await upsertAttendance(popover.studentId, popover.date, newStatuses);
  };

  const toggleSubjectAttended = async (slot: EffectiveSlot) => {
    if (!popover) return;
    const wasAttended = subjectAttended.has(slot.period);
    const next = new Set(subjectAttended);
    wasAttended ? next.delete(slot.period) : next.add(slot.period);
    setSubjectAttended(next);
    const rangeKey = `${popover.studentId}_${popover.date}_${slot.period}`;
    setSubjectAttendanceSet(prev => { const n = new Set(prev); wasAttended ? n.delete(rangeKey) : n.add(rangeKey); return n; });
    await toggleSubjectAttendance(popover.studentId, popover.date, slot.period, !wasAttended);
  };

  const handleExportExcel = async () => {
    if (selectedClassId === null) return;
    const cls = classes.find(c => c.id === selectedClassId);
    if (!cls) return;
    const { startDate, endDate } = getDateRange();
    const studentList = await getStudents(selectedClassId);
    const aMap = await getAttendanceRange(selectedClassId, startDate, endDate);
    const allDays = getDaysInRange(startMonth, endMonth);
    const header = ['番号', '氏名', ...allDays.map(d => `${d.month}/${d.day}`)];
    const rows = studentList.map(student => {
      const row: (string | number)[] = [student.student_number ?? '', student.name];
      allDays.forEach(d => {
        const statuses = aMap.get(`${student.id}_${d.date}`) ?? [];
        row.push(statuses.length > 0 ? statuses.join('/') : '');
      });
      return row;
    });
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
    ws['!cols'] = [{ wch: 6 }, { wch: 14 }, ...allDays.map(() => ({ wch: 6 }))];
    XLSX.utils.book_append_sheet(wb, ws, `${cls.grade}${cls.name}`);

    const allSubjects = [...new Set(allDays.flatMap(d => getEffectiveSlots(d.date).map(s => s.subject)))].sort();
    const summaryHeader = ['番号', '氏名', ...STATUSES.map(s => s.label), ...allSubjects];
    const summaryRows = studentList.map(student => {
      const { counts, missedBySubject } = getStudentSummary(student.id);
      return [
        student.student_number ?? '',
        student.name,
        ...STATUSES.map(s => counts[s.value] || ''),
        ...allSubjects.map(sub => missedBySubject.get(sub) || ''),
      ];
    });
    const ws2 = XLSX.utils.aoa_to_sheet([summaryHeader, ...summaryRows]);
    ws2['!cols'] = [{ wch: 6 }, { wch: 14 }, ...STATUSES.map(() => ({ wch: 6 })), ...allSubjects.map(() => ({ wch: 8 }))];
    XLSX.utils.book_append_sheet(wb, ws2, '集計');

    XLSX.writeFile(wb, `出席簿_${cls.grade}${cls.name}_${startDate}_${endDate}.xlsx`);
  };

  const getStudentSummary = (studentId: number) => {
    const counts = Object.fromEntries(STATUSES.map(s => [s.value, 0])) as Record<AttendanceStatus, number>;
    const missedBySubject = new Map<string, number>();
    days.forEach(d => {
      const statuses = attendanceMap.get(`${studentId}_${d.date}`) ?? [];
      statuses.forEach(s => counts[s]++);
      if (statuses.length > 0) {
        getEffectiveSlots(d.date).forEach(slot => {
          if (!subjectAttendanceSet.has(`${studentId}_${d.date}_${slot.period}`)) {
            missedBySubject.set(slot.subject, (missedBySubject.get(slot.subject) ?? 0) + 1);
          }
        });
      }
    });
    return { counts, missedBySubject };
  };

  const handleStartMonthChange = (value: string) => {
    setStartMonth(value); if (value > endMonth) setEndMonth(value);
    setPopover(null); setHeaderPopover(null);
  };
  const handleEndMonthChange = (value: string) => {
    setEndMonth(value); if (value < startMonth) setStartMonth(value);
    setPopover(null); setHeaderPopover(null);
  };

  const today = new Date();
  const todayStr = formatDate(today.getFullYear(), today.getMonth() + 1, today.getDate());
  const days = getDaysInRange(startMonth, endMonth);
  const monthGroups = getMonthGroups(days);
  const getStatuses = (studentId: number, date: string) => attendanceMap.get(`${studentId}_${date}`) ?? [];
  const popoverStatuses = popover ? (attendanceMap.get(`${popover.studentId}_${popover.date}`) ?? []) : [];

  return (
    <div className="attendance">
      <h2>出席入力</h2>

      <div className="controls">
        <div className="control-row">
          <label>クラス：</label>
          <select
            value={selectedClassId ?? ""}
            onChange={e => { setSelectedClassId(Number(e.target.value)); setPopover(null); setHeaderPopover(null); }}
          >
            {classes.map(cls => (
              <option key={cls.id} value={cls.id}>{cls.grade} {cls.name}</option>
            ))}
          </select>
        </div>
        <div className="control-row">
          <label>表示範囲：</label>
          <input type="month" value={startMonth} onChange={e => handleStartMonthChange(e.target.value)} />
          <span>〜</span>
          <input type="month" value={endMonth} onChange={e => handleEndMonthChange(e.target.value)} />
          <button onClick={handleExportExcel} disabled={selectedClassId === null}>Excel出力</button>
          <button className="secondary" onClick={() => setShowSummary(v => !v)}>
            {showSummary ? '集計を隠す' : '集計を表示'}
          </button>
        </div>
      </div>

      <div className="legend">
        {STATUSES.map(s => (
          <span key={s.value} className="legend-item">
            <span className="status-badge" style={{ background: s.color }}>{s.abbr}</span>
            {s.label}
          </span>
        ))}
        <span className="legend-hint">※ セルをクリックして出欠入力 / 日付ヘッダーをクリックして時間割設定</span>
      </div>

      {classes.length === 0 && <p className="empty">先にクラス管理でクラスを登録してください。</p>}
      {classes.length > 0 && students.length === 0 && <p className="empty">生徒が登録されていません。先に生徒管理で登録してください。</p>}

      {students.length > 0 && (
        <div className="calendar-scroll">
          <table className="calendar-table">
            <thead>
              <tr>
                <th ref={numColRef} rowSpan={2} style={stickyStyle(0, true)}>番号</th>
                <th ref={nameColRef} rowSpan={2} style={stickyStyle(nameCellLeft, true)}>氏名</th>
                {showSummary && <>
                  <th ref={summaryColRef} rowSpan={2} style={{ ...stickyStyle(summaryColLeft, true), minWidth: 120 }}>欠席理由</th>
                  <th rowSpan={2} style={{ ...stickyStyle(subjectColLeft, true), minWidth: 120 }}>欠席授業</th>
                </>}
                {monthGroups.map(g => (
                  <th key={g.label} colSpan={g.count} className="col-month-label">{g.label}</th>
                ))}
              </tr>
              <tr>
                {days.map(d => {
                  const hasTimetable = dateTimetableMap.has(d.date);
                  const hasOverride = dateClassSlotsMap.has(d.date);
                  const ttName = hasTimetable ? timetables.find(t => t.id === dateTimetableMap.get(d.date))?.name ?? '' : '';
                  return (
                    <th
                      key={d.date}
                      className={`col-day clickable${d.date === todayStr ? ' today' : ''}${d.dow === 0 ? ' sunday' : ''}${d.dow === 6 ? ' saturday' : ''}`}
                      onClick={e => handleHeaderClick(e, d.date)}
                      title={hasOverride ? '時間割を手動で設定済み' : hasTimetable ? `時間割: ${ttName}` : '時間割を設定'}
                    >
                      <div>{d.day}</div>
                      <div className="dow">{WEEKDAYS[d.dow]}</div>
                      {hasTimetable && !hasOverride && <div className="timetable-dot" />}
                      {hasOverride && <div className="timetable-dot override-dot" />}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {students.map((student, idx) => (
                <tr key={student.id}>
                  <td style={stickyStyle(0, false, idx % 2 === 1)}>{student.student_number ?? '-'}</td>
                  <td style={stickyStyle(nameCellLeft, false, idx % 2 === 1)} className="name-cell">{student.name}</td>
                  {showSummary && (() => {
                    const { counts, missedBySubject } = getStudentSummary(student.id);
                    return (
                      <>
                        <td style={{ ...stickyStyle(summaryColLeft, false, idx % 2 === 1), minWidth: 120 }}>
                          <div className="summary-badges">
                            {STATUSES.filter(s => counts[s.value] > 0).map(s => (
                              <span key={s.value} className="summary-badge" style={{ background: s.color }}>
                                {s.abbr}{counts[s.value]}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td style={{ ...stickyStyle(subjectColLeft, false, idx % 2 === 1), minWidth: 120 }}>
                          <div className="summary-badges">
                            {[...missedBySubject.entries()].map(([subject, count]) => (
                              <span key={subject} className="summary-badge" style={{ background: '#ffcccc' }}>
                                {subject}{count}
                              </span>
                            ))}
                          </div>
                        </td>
                      </>
                    );
                  })()}
                  {days.map(d => {
                    const statuses = getStatuses(student.id, d.date);
                    const isSelected = popover?.studentId === student.id && popover?.date === d.date;
                    return (
                      <td
                        key={d.date}
                        className={`day-cell${isSelected ? ' selected' : ''}${d.date === todayStr ? ' today' : ''}${d.dow === 0 ? ' sunday' : ''}${d.dow === 6 ? ' saturday' : ''}`}
                        onClick={e => handleCellClick(e, student.id, d.date)}
                      >
                        <div className="status-badges">
                          {statuses.map(s => {
                            const info = STATUSES.find(st => st.value === s)!;
                            return (
                              <span key={s} className="status-badge" style={{ background: info.color }}>
                                {info.abbr}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {headerPopover && (
        <div ref={headerPopoverRef} className="status-popover" style={{ left: headerPopover.x, top: headerPopover.y, minWidth: 200 }}>
          <div className="popover-section-title">{headerPopover.date} の時間割</div>
          <select
            style={{ width: '100%', marginTop: 6 }}
            value={dateTimetableMap.get(headerPopover.date) ?? ''}
            onChange={e => handleDateTimetableChange(headerPopover.date, e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">なし</option>
            {timetables.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <button
            className="override-open-btn"
            onClick={() => handleOpenOverrideEditor(headerPopover.date)}
          >
            時間割を手動で設定
          </button>
        </div>
      )}

      {popover && (() => {
        const student = students.find(s => s.id === popover.studentId);
        return (
          <div
            className="modal-overlay"
            onMouseDown={e => { if (e.target === e.currentTarget) setPopover(null); }}
          >
            <div className="attendance-modal">
              <div className="attendance-modal-header">
                <div>
                  <div className="attendance-modal-name">{student?.name}</div>
                  <div className="attendance-modal-date">{popover.date}</div>
                </div>
                <button className="help-close-btn" onClick={() => setPopover(null)}>×</button>
              </div>
              <div className="attendance-modal-body">
                <div className="popover-columns">
                  <div className="popover-col">
                    <div className="popover-section-title">出欠</div>
                    {STATUSES.map(s => (
                      <label key={s.value} className="popover-item">
                        <input type="checkbox" checked={popoverStatuses.includes(s.value)} onChange={() => toggleStatus(s.value)} />
                        <span className="status-badge" style={{ background: s.color }}>{s.abbr}</span>
                        {s.label}
                      </label>
                    ))}
                  </div>
                  {popoverStatuses.length > 0 && !dateTimetableMap.has(popover.date) && !dateClassSlotsMap.has(popover.date) && (
                    <>
                      <div className="popover-col-divider" />
                      <div className="popover-col">
                        <p className="popover-no-timetable">時間割を設定すると<br />出席した授業を選べます</p>
                      </div>
                    </>
                  )}
                  {currentDaySlots.length > 0 && popoverStatuses.length > 0 && (
                    <>
                      <div className="popover-col-divider" />
                      <div className="popover-col">
                        <div className="popover-section-title">授業出席</div>
                        {currentDaySlots.map(slot => (
                          <label key={slot.period} className="popover-item">
                            <input type="checkbox" checked={subjectAttended.has(slot.period)} onChange={() => toggleSubjectAttended(slot)} />
                            <span className="popover-period">{slot.period}限</span>
                            {slot.subject}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {overrideEditor && (
        <div
          className="modal-overlay"
          onMouseDown={e => { if (e.target === e.currentTarget) setOverrideEditor(null); }}
        >
          <div className="override-editor">
            <div className="override-editor-header">
              <h3>{overrideEditor.date} の時間割を手動で設定</h3>
              <button className="help-close-btn" onClick={() => setOverrideEditor(null)}>×</button>
            </div>
            <div className="override-editor-body">
              <p className="override-editor-hint">この日の時間割を手動で設定します。「なし」にした時限は集計に含まれません。</p>
              {Array.from({ length: 11 }, (_, p) => (
                <div key={p} className="override-editor-row">
                  <span className="override-period-label">{p}限</span>
                  <select
                    value={overrideGrid[p] ?? ''}
                    onChange={e => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setOverrideGrid(prev => { const next = [...prev]; next[p] = val; return next; });
                    }}
                  >
                    <option value="">なし</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="override-editor-footer">
              <button onClick={handleSaveOverride}>保存</button>
              {dateClassSlotsMap.has(overrideEditor.date) && (
                <button className="danger" onClick={handleDeleteOverride}>手動設定を削除</button>
              )}
              <button className="secondary" onClick={() => setOverrideEditor(null)}>キャンセル</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AttendanceGrid;
