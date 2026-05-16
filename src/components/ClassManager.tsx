import { useState, useEffect } from "react";
import { Class } from "../types";
import { getClasses, addClass, updateClass, deleteClass } from "../db/database";

function ClassManager() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [newName, setNewName] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [editing, setEditing] = useState<Class | null>(null);

  const load = async () => setClasses(await getClasses());

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!newName.trim() || !newGrade.trim()) return;
    await addClass(newName.trim(), newGrade.trim());
    setNewName(""); setNewGrade("");
    load();
  };

  const handleUpdate = async () => {
    if (!editing || !editing.name.trim() || !editing.grade.trim()) return;
    await updateClass(editing.id, editing.name.trim(), editing.grade.trim());
    setEditing(null);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("このクラスを削除しますか？\n※ 所属する生徒・出席データも削除されます。")) return;
    await deleteClass(id);
    load();
  };

  return (
    <div className="manager">
      <h2>クラス管理</h2>

      <div className="form-row">
        <input value={newGrade} onChange={e => setNewGrade(e.target.value)} placeholder="学年（例：1年）" />
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          placeholder="クラス名（例：A組）"
          onKeyDown={e => e.key === "Enter" && handleAdd()}
        />
        <button onClick={handleAdd}>追加</button>
      </div>

      <table>
        <thead>
          <tr>
            <th>学年</th>
            <th>クラス名</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {classes.length === 0 && (
            <tr><td colSpan={3} className="empty-cell">クラスが登録されていません</td></tr>
          )}
          {classes.map(cls => (
            <tr key={cls.id}>
              {editing?.id === cls.id ? (
                <>
                  <td><input value={editing.grade} onChange={e => setEditing({ ...editing, grade: e.target.value })} /></td>
                  <td><input value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} /></td>
                  <td className="actions">
                    <button onClick={handleUpdate}>保存</button>
                    <button className="secondary" onClick={() => setEditing(null)}>キャンセル</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{cls.grade}</td>
                  <td>{cls.name}</td>
                  <td className="actions">
                    <button className="secondary" onClick={() => setEditing(cls)}>編集</button>
                    <button className="danger" onClick={() => handleDelete(cls.id)}>削除</button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ClassManager;
