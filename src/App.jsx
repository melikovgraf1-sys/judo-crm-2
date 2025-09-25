import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Topbar from "./components/Topbar";
import Tabs from "./components/Tabs";
import Dashboard from "./components/Dashboard";
import AnalyticsTab from "./components/AnalyticsTab";
import ClientsTab from "./components/ClientsTab";
import GroupsTab from "./components/GroupsTab";
import AttendanceTab from "./components/AttendanceTab";
import PerformanceTab from "./components/PerformanceTab";
import TasksTab from "./components/TasksTab";
import ScheduleTab from "./components/ScheduleTab";
import LeadsTab from "./components/LeadsTab";
import SettingsTab from "./components/SettingsTab";
import AppealsTab from "./components/AppealsTab";
import QuickAddModal from "./components/QuickAddModal";
import Toasts from "./components/Toasts";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAppState, can, LOCAL_ONLY_MESSAGE } from "./state/appState";

export default function App() {
  /** @type {import("./state/appState").AppState} */
  const appState = useAppState();

  const {
    db,
    setDB,
    ui,
    setUI,
    roles,
    toasts,
    isLocalOnly,
    quickOpen,
    onQuickAdd,
    setQuickOpen,
    addQuickClient,
    addQuickLead,
    addQuickTask,
  } = appState;

  const [hideLocalOnly, setHideLocalOnly] = useState(false);

  useEffect(() => {
    if (!isLocalOnly) {
      setHideLocalOnly(false);
    }
  }, [isLocalOnly]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-sky-50 text-slate-900 dark:from-slate-900 dark:to-slate-950 dark:text-slate-100">
      <Topbar ui={ui} setUI={setUI} roleList={roles} onQuickAdd={onQuickAdd} />
      {isLocalOnly && !hideLocalOnly ? (
        <div className="bg-amber-100 border-y border-amber-200 text-amber-900 dark:bg-amber-900/70 dark:border-amber-800 dark:text-amber-100">
          <div className="max-w-7xl mx-auto flex items-start gap-3 px-3 py-2 text-sm font-medium" role="alert">
            <span className="grow">{LOCAL_ONLY_MESSAGE}</span>
            <button
              type="button"
              className="rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold uppercase tracking-wide hover:bg-amber-200/60 dark:border-amber-600 dark:hover:bg-amber-800/40"
              onClick={() => setHideLocalOnly(true)}
            >
              Скрыть
            </button>
          </div>
        </div>
      ) : null}
      <Tabs role={ui.role} />

      <main className="max-w-7xl mx-auto p-3 space-y-3">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard db={db} ui={ui} />} />
            <Route
              path="/analytics"
              element={
                can(ui.role, "analytics") ? (
                  <AnalyticsTab db={db} setDB={setDB} currency={ui.currency} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/groups"
              element={
                can(ui.role, "manage_clients") ? (
                  <GroupsTab db={db} setDB={setDB} ui={ui} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/clients"
              element={
                can(ui.role, "manage_clients") ? (
                  <ClientsTab db={db} setDB={setDB} ui={ui} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/attendance"
              element={
                can(ui.role, "attendance") ? (
                  <AttendanceTab db={db} setDB={setDB} currency={ui.currency} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/performance"
              element={
                can(ui.role, "performance") ? (
                  <PerformanceTab db={db} setDB={setDB} currency={ui.currency} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/tasks"
              element={
                can(ui.role, "tasks") ? (
                  <TasksTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/schedule"
              element={
                can(ui.role, "schedule") ? (
                  <ScheduleTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/leads"
              element={
                can(ui.role, "leads") ? (
                  <LeadsTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/appeals"
              element={
                can(ui.role, "appeals") ? (
                  <AppealsTab />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route
              path="/settings"
              element={
                can(ui.role, "settings") ? (
                  <SettingsTab db={db} setDB={setDB} />
                ) : (
                  <Navigate to="/dashboard" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </ErrorBoundary>
      </main>

      <QuickAddModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        onAddClient={addQuickClient}
        onAddLead={addQuickLead}
        onAddTask={addQuickTask}
      />
      <Toasts toasts={toasts} />

      <footer className="text-xs text-slate-500 text-center py-6">
        Каркас CRM · Следующие шаги: SW/Manifest/PWA, офлайн-синхронизация, push, CSV/печать
      </footer>
    </div>
  );
}
