import { useState, useEffect } from "react";
import { Class, Student } from "../types";
import { getClasses, getStudents, addStudent, updateStudent, deleteStudent } from "../db/database";

function StudentManager() {
  const [classes, setClasses] = useState<Class[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<number | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [newName, setNewName] = useState("");
  const [newNumber, setNewNumber] = useState("");
  const [editing, setEditing] = useState<Student | null>(null);

  useEffect(() => {
    getClasses().then(cls => {
      setClasses(cls);
      if (cls.length > 0) setSelectedClassId(cls[0].id);
    });
  }, []);

  useEffect(() => {
    if (selectedClassId !== null) loadStudents();
  }, [selectedClassId]);

  const loadStudents = async () => {
    if (selectedClassId === null) return;
    setStudents(await getStudents(selectedClassId));
  };

  const handleAdd = async () => {
    if (!newName.trim() || selectedClassId === null) return;
    await addStudent(selectedClassId, newName.trim(), newNumber ? parseInt(newNumber) : null);
    setNewName("");
    setNewNumber("");
    loadStudents();
  };

  const handleUpdate = async () => {
    if (!editing) return;
    await updateStudent(editing.id, editing.name, editing.student_number);
    setEditing(null);
    loadStudents();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("この生徒を削除しますか？\n※ 出席データも削除されます。")) return;
    await deleteStudent(id);
    loadStudents();
  };

  return (
    <div className="manager">
      <h2>生徒管理</h2>

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

      {classes.length === 0 && (
        <p className="empty">先にクラス管理でクラスを登録してください。</p>
      )}

      {selectedClassId !== null && classes.length > 0 && (
        <>
          <div className="form-row">
            <input
              type="number"
              value={newNumber}
              onChange={e => setNewNumber(e.target.value)}
              placeholder="出席番号"
              style={{ width: 90 }}
            />
            <input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="生徒氏名"
              onKeyDown={e => e.key === "Enter" && handleAdd()}
            />
            <button onClick={handleAdd}>追加</button>
          </div>

          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>出席番号</th>
                <th>氏名</th>
                <th style={{ width: 160 }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {students.length === 0 && (
                <tr><td colSpan={3} className="empty-cell">生徒が登録されていません</td></tr>
              )}
              {students.map(student => (
                <tr key={student.id}>
                  {editing?.id === student.id ? (
                    <>
                      <td>
                        <input
                          type="number"
                          value={editing.student_number ?? ""}
                          onChange={e => setEditing({
                            ...editing,
                            student_number: e.target.value ? parseInt(e.target.value) : null
                          })}
                          style={{ width: 70 }}
                        />
                      </td>
                      <td>
                        <input
                          value={editing.name}
                          onChange={e => setEditing({ ...editing, name: e.target.value })}
                        />
                      </td>
                      <td className="actions">
                        <button onClick={handleUpdate}>保存</button>
                        <button className="secondary" onClick={() => setEditing(null)}>キャンセル</button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{student.student_number ?? "-"}</td>
                      <td>{student.name}</td>
                      <td className="actions">
                        <button className="secondary" onClick={() => setEditing(student)}>編集</button>
                        <button className="danger" onClick={() => handleDelete(student.id)}>削除</button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export default StudentManager;
