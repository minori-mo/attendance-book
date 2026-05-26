import { useState, useEffect } from "react";
import { Timetable, Subject } from "../types";
import {
  getTimetables, addTimetable, renameTimetable, deleteTimetable,
  getTimetableSlots, saveTimetableGrid,
  getSubjects, addSubject, updateSubject, deleteSubject,
} from "../db/database";

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];
const PERIODS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

// day_of_week → grid column index
const DOW_TO_COL: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };

function emptyGrid(): (number | null)[][] {
  return Array.from({ length: 11 }, () => Array(7).fill(null));
}

function slotsToGrid(slots: { day_of_week: number; period: number; subject_id: number }[]): (number | null)[][] {
  const grid = emptyGrid();
  slots.forEach(s => {
    const col = DOW_TO_COL[s.day_of_week];
    if (col !== undefined && s.period >= 0 && s.period <= 10) {
      grid[s.period][col] = s.subject_id;
    }
  });
  return grid;
}

function TimetableManager() {
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [grid, setGrid] = useState<(number | null)[][]>(emptyGrid());
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [newSubjectName, setNewSubjectName] = useState('');
  const [subjectNameError, setSubjectNameError] = useState('');
  const [editingSubjectId, setEditingSubjectId] = useState<number | null>(null);
  const [editingSubjectName, setEditingSubjectName] = useState('');

  const loadSubjects = async () => {
    setSubjects(await getSubjects());
  };

  const load = async () => {
    const list = await getTimetables();
    setTimetables(list);
    return list;
  };

  useEffect(() => {
    Promise.all([load(), loadSubjects()]).then(([list]) => {
      if (list.length > 0) handleSelect(list[0].id, list[0].name);
    });
  }, []);

  const handleSelect = async (id: number, name: string) => {
    setSelectedId(id);
    setEditName(name);
    const slots = await getTimetableSlots(id);
    setGrid(slotsToGrid(slots));
    setSaved(false);
    setSaveError('');
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

  const handleCellChange = (period: number, col: number, value: string) => {
    setGrid(prev => {
      const next = prev.map(row => [...row]);
      next[period][col] = value === '' ? null : Number(value);
      return next;
    });
    setSaved(false);
    setSaveError('');
  };

  const handleSave = async () => {
    if (selectedId === null) return;
    try {
      await saveTimetableGrid(selectedId, grid);
      setSaved(true);
      setSaveError('');
    } catch (e) {
      setSaveError('保存に失敗しました: ' + String(e));
    }
  };

  const handleAddSubject = async () => {
    const name = newSubjectName.trim();
    if (!name) return;
    if (subjects.some(s => s.name === name)) {
      setSubjectNameError('同じ名前の授業が既に登録されています');
      return;
    }
    try {
      await addSubject(name);
      setNewSubjectName('');
      setSubjectNameError('');
      loadSubjects();
    } catch {
      setSubjectNameError('同じ名前の授業が既に登録されています');
    }
  };

  const handleDeleteSubject = async (id: number) => {
    if (!confirm('この授業を削除しますか？時間割から削除されます。')) return;
    try {
      await deleteSubject(id);
    } catch (e) {
      alert('削除に失敗しました: ' + String(e));
      return;
    }
    await loadSubjects();
    if (selectedId !== null) {
      const slots = await getTimetableSlots(selectedId);
      setGrid(slotsToGrid(slots));
    }
  };

  const handleSubjectEditStart = (id: number, name: string) => {
    setEditingSubjectId(id);
    setEditingSubjectName(name);
  };

  const handleSubjectEditSave = async () => {
    if (editingSubjectId === null || !editingSubjectName.trim()) return;
    await updateSubject(editingSubjectId, editingSubjectName.trim());
    setEditingSubjectId(null);
    loadSubjects();
  };

  return (
    <div className="manager">
      <h2>時間割管理</h2>

      <div className="timetable-layout">
        {/* 左：時間割一覧 + 授業登録 */}
        <div className="timetable-left-panel">
          {/* 時間割一覧 */}
          <div className="timetable-list">
            <div className="panel-section-title">時間割</div>
            <button onClick={handleAdd} style={{ width: '100%', marginBottom: 8 }}>＋ 追加</button>
            {timetables.length === 0 && <p className="empty">時間割がありません</p>}
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

          {/* 授業登録 */}
          <div className="subject-list" style={{ marginTop: 24 }}>
            <div className="panel-section-title">授業登録</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: subjectNameError ? 4 : 8 }}>
              <input
                value={newSubjectName}
                onChange={e => { setNewSubjectName(e.target.value); setSubjectNameError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleAddSubject()}
                placeholder="授業名"
                style={{ flex: 1, minWidth: 0, borderColor: subjectNameError ? '#d32f2f' : undefined }}
              />
              <button onClick={handleAddSubject} style={{ padding: '6px 10px' }}>＋</button>
            </div>
            {subjectNameError && (
              <p style={{ fontSize: 11, color: '#d32f2f', marginBottom: 8 }}>{subjectNameError}</p>
            )}
            {subjects.length === 0 && <p className="empty">授業がありません</p>}
            {subjects.map(s => (
              <div key={s.id} className="subject-list-item">
                {editingSubjectId === s.id ? (
                  <>
                    <input
                      value={editingSubjectName}
                      onChange={e => setEditingSubjectName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSubjectEditSave(); if (e.key === 'Escape') setEditingSubjectId(null); }}
                      autoFocus
                      style={{ flex: 1, minWidth: 0, fontSize: 13 }}
                    />
                    <button style={{ padding: '2px 8px', fontSize: 12 }} onClick={handleSubjectEditSave}>保存</button>
                    <button className="secondary" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => setEditingSubjectId(null)}>×</button>
                  </>
                ) : (
                  <>
                    <span className="subject-list-name" onDoubleClick={() => handleSubjectEditStart(s.id, s.name)}>{s.name}</span>
                    <button className="secondary" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => handleSubjectEditStart(s.id, s.name)}>編集</button>
                    <button className="danger" style={{ padding: '2px 6px', fontSize: 12 }} onClick={() => handleDeleteSubject(s.id)}>削除</button>
                  </>
                )}
              </div>
            ))}
          </div>
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

            {subjects.length === 0 && (
              <p className="hint" style={{ marginBottom: 12 }}>先に左の「授業登録」で授業を追加してください。</p>
            )}

            <table className="timetable-grid">
              <thead>
                <tr>
                  <th className="tg-corner"></th>
                  {DAYS.map(d => (
                    <th key={d} className={`tg-day${d === '日' ? ' tg-day-sun' : d === '土' ? ' tg-day-sat' : ''}`}>{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {PERIODS.map(p => (
                  <tr key={p}>
                    <td className="tg-period">{p}時限</td>
                    {DAYS.map((d, col) => (
                      <td key={col} className={`tg-cell${d === '日' ? ' tg-cell-sun' : d === '土' ? ' tg-cell-sat' : ''}`}>
                        <select
                          value={grid[p][col] ?? ''}
                          onChange={e => handleCellChange(p, col, e.target.value)}
                          disabled={subjects.length === 0}
                        >
                          <option value="">―</option>
                          {subjects.map(s => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="save-row">
              <button className="save-btn" onClick={handleSave} disabled={subjects.length === 0}>保存</button>
              {saved && <span className="saved-msg">✓ 保存しました</span>}
              {saveError && <span style={{ color: '#d32f2f', fontSize: 13 }}>{saveError}</span>}
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
