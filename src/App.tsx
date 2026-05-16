import { useState, useEffect } from "react";
import { getDB } from "./db/database";
import ClassManager from "./components/ClassManager";
import StudentManager from "./components/StudentManager";
import TimetableManager from "./components/TimetableManager";
import AttendanceGrid from "./components/AttendanceGrid";
import "./App.css";

type Tab = "attendance" | "classes" | "students" | "timetable";

const TAB_LABELS: Record<Tab, string> = {
  attendance: "出席入力",
  classes: "クラス管理",
  students: "生徒管理",
  timetable: "時間割管理",
};

const TABS: Tab[] = ["attendance", "classes", "students", "timetable"];

function App() {
  const [activeTab, setActiveTab] = useState<Tab>("attendance");
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getDB()
      .then(() => setDbReady(true))
      .catch(e => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="loading" style={{ flexDirection: "column", gap: 8 }}>
        <strong>初期化エラー</strong>
        <code style={{ fontSize: 12, color: "#d32f2f" }}>{error}</code>
      </div>
    );
  }

  if (!dbReady) return <div className="loading">読み込み中...</div>;

  return (
    <div className="app">
      <header className="app-header">
        <h1>出席管理システム</h1>
      </header>
      <nav className="app-nav">
        {TABS.map(tab => (
          <button
            key={tab}
            className={activeTab === tab ? "active" : ""}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>
      <main className="app-main">
        {activeTab === "attendance" && <AttendanceGrid />}
        {activeTab === "classes" && <ClassManager />}
        {activeTab === "students" && <StudentManager />}
        {activeTab === "timetable" && <TimetableManager />}
      </main>
    </div>
  );
}

export default App;
