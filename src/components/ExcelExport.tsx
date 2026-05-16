import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { Class } from "../types";
import { getClasses, getStudents, getAttendanceRange } from "../db/database";

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function allDatesBetween(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start);
  const last = new Date(end);
  while (cur <= last) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

function ExcelExport() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState(firstOfMonth());
  const [endDate, setEndDate] = useState(todayString());
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    getClasses().then(cls => {
      setClasses(cls);
      if (cls.length > 0) setSelectedClassId(cls[0].id);
    });
  }, []);

  const handleExport = async () => {
    if (selectedClassId === null) return;
    setExporting(true);

    try {
      const selectedClass = classes.find(c => c.id === selectedClassId)!;
      const students = await getStudents(selectedClassId);
      const attendanceMap = await getAttendanceRange(selectedClassId, startDate, endDate);
      const dates = allDatesBetween(startDate, endDate);

      const header = ['番号', '氏名', ...dates.map(d => d.slice(5).replace('-', '/'))];
      const rows = students.map(student => {
        const row: (string | number)[] = [student.student_number ?? '', student.name];
        dates.forEach(date => {
          const statuses = attendanceMap.get(`${student.id}_${date}`) ?? [];
          row.push(statuses.length > 0 ? statuses.join('/') : '出席');
        });
        return row;
      });

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([header, ...rows]);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 14 },
        ...dates.map(() => ({ wch: 6 })),
      ];

      const sheetName = `${selectedClass.grade}${selectedClass.name}`;
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      const filename = `出席簿_${sheetName}_${startDate}_${endDate}.xlsx`;
      XLSX.writeFile(wb, filename);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="manager">
      <h2>Excel出力</h2>

      <div className="form-row">
        <label>クラス：</label>
        <select
          value={selectedClassId ?? ""}
          onChange={e => setSelectedClassId(Number(e.target.value))}
        >
          {classes.map(cls => (
            <option key={cls.id} value={cls.id}>{cls.grade} {cls.name}</option>
          ))}
        </select>
      </div>

      <div className="form-row">
        <label>期間：</label>
        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
        <span>〜</span>
        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
      </div>

      <div className="form-row">
        <button
          className="save-btn"
          onClick={handleExport}
          disabled={exporting || selectedClassId === null}
        >
          {exporting ? "出力中..." : "Excelに出力"}
        </button>
      </div>

      <p className="hint">※ 出席記録のない日は「出席」、複数ある場合は「遅刻/早退」のように表示されます。</p>
    </div>
  );
}

export default ExcelExport;
