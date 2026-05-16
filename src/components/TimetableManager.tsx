import { useState, useEffect } from "react";
import { Timetable } from "../types";
import {
  getTimetables, addTimetable, renameTimetable, deleteTimetable,
  getTimetableSlots, saveTimetableGrid,
} from "../db/database";

const DAYS = ['月', '火', '水', '木', '金', '土'];
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

function emptyGrid(): string[][] {
  return Array.from({ length: 11 }, () => Array(6).fill(''));
}

function slotsToGrid(slots: { day_of_week: number; period: number; subject: string }[]): string[][] {
  const grid = emptyGrid();
  slots.forEach(s => {
    if (s.period >= 0 && s.period <= 10 && s.day_of_week >= 1 && s.day_of_week <= 6) {
      grid[s.period][s.day_of_week - 1] = s.subject;
    }
  });
  return grid;
}

function TimetableManager() {
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [grid, setGrid] = useState<string[][]>(emptyGrid());
  const [saved, setSaved] = useState(false);

  const load = async () => {
    const list = await getTimetables();
    setTimetables(list);
    return list;
  };

  useEffect(() => {
    load().then(list => {
      if (list.length > 0) handleSelect(list[0].id, list[0].name);
    });
  }, []);

  const handleSelect = async (id: number, name: string) => {
    setSelectedId(id);
    setEditName(name);
    const slots = await getTimetableSlots(id);
    setGrid(slotsToGrid(slots));
    setSaved(false);
  };

  const handleAdd = async () => {
    const name = '新しい時間割';
    const id = await addTimetable(name);
    const list = await load();
    const created = list.find(t => t.id === id);
    if (created) handleSelect(created.id, created.name);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('この時間割を削除しますか？')) return;
    await deleteTimetable(id);
    setSelectedId(null);
    setGrid(emptyGrid());
    load();
  };

  const handleNameBlur = async () => {
    if (selectedId === null || !editName.trim()) return;
    await renameTimetable(selectedId, editName.trim());
    load();
  };

  const handleCellChange = (period: number, day: number, value: string) => {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[period][day] = value;
      return next;
    });
    setSaved(false);
  };

  const handleSave = async () => {
    if (selectedId === null) return;
    await saveTimetableGrid(selectedId, grid);
    setSaved(true);
  };

  return (
    <div className="manager">
      <h2>時間割管理</h2>

      <div className="timetable-layout">
        {/* 左：時間割一覧 */}
        <div className="timetable-list">
          <button onClick={handleAdd} style={{ width: '100%', marginBottom: 8 }}>＋ 追加</button>
          {timetables.length === 0 && (
            <p className="empty">時間割がありません</p>
          )}
          {timetables.map(t => (
            <div
              key={t.id}
              className={`timetable-list-item${selectedId === t.id ? ' selected' : ''}`}
              onClick={() => handleSelect(t.id, t.name)}
            >
              <span className="timetable-list-name">{t.name}</span>
              <button
                className="danger"
                style={{ padding: '2px 8px', fontSize: 12 }}
                onClick={e => { e.stopPropagation(); handleDelete(t.id); }}
              >削除</button>
            </div>
          ))}
        </div>

        {/* 右：グリッドエディタ */}
        {selectedId !== null ? (
          <div className="timetable-editor">
            <div className="form-row" style={{ marginBottom: 16 }}>
              <label>時間割名：</label>
              <input
                value={editName}
                onChange={e => setEditName(e.target.value)}
                onBlur={handleNameBlur}
                style={{ fontSize: 15, fontWeight: 'bold', width: 240 }}
              />
            </div>

            <table className="timetable-grid">
              <thead>
                <tr>
                  <th className="tg-corner"></th>
                  {DAYS.map(d => <th key={d} className="tg-day">{d}</th>)}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(p => (
                  <tr key={p}>
                    <td className="tg-period">{p}時限</td>
                    {DAYS.map((_, di) => (
                      <td key={di} className="tg-cell">
                        <input
                          value={grid[p][di]}
                          onChange={e => handleCellChange(p, di, e.target.value)}
                          placeholder="授業名"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="save-row">
              <button className="save-btn" onClick={handleSave}>保存</button>
              {saved && <span className="saved-msg">✓ 保存しました</span>}
            </div>
          </div>
        ) : (
          <div className="timetable-editor">
            <p className="empty">左の一覧から時間割を選択してください。</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default TimetableManager;
