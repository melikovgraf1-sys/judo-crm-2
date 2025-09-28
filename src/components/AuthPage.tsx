import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { Role } from "../types";

type AuthResult = { ok: true } | { ok: false; error: string };

type RegisterPayload = { name: string; login: string; password: string; role: Role };

type AuthPageProps = {
  roles: Role[];
  onLogin: (login: string, password: string) => Promise<AuthResult>;
  onRegister: (payload: RegisterPayload) => Promise<AuthResult>;
  theme: "light" | "dark";
  onToggleTheme: () => void;
};

const CONTROL_CLASS =
  "w-full rounded-xl border border-slate-200/70 bg-white/80 px-4 py-3 text-sm text-slate-800 shadow-sm transition focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200/60 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-100 dark:focus:border-sky-500/60 dark:focus:ring-sky-500/30";

export default function AuthPage({ roles, onLogin, onRegister, theme, onToggleTheme }: AuthPageProps) {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const defaultRole = roles.includes("Менеджер") ? "Менеджер" : roles[0];
  const [registerForm, setRegisterForm] = useState({
    name: "",
    login: "",
    password: "",
    confirm: "",
    role: defaultRole,
  });

  const handleLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await onLogin(loginForm.login, loginForm.password);
      if (result.ok) {
        navigate("/dashboard", { replace: true });
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (registerForm.password.trim() !== registerForm.confirm.trim()) {
      setError("Пароли не совпадают");
      return;
    }
    setLoading(true);
    try {
      const payload: RegisterPayload = {
        name: registerForm.name,
        login: registerForm.login,
        password: registerForm.password,
        role: registerForm.role,
      };
      const result = await onRegister(payload);
      if (result.ok) {
        navigate("/dashboard", { replace: true });
      } else {
        setError(result.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMode = (nextMode: "login" | "register") => {
    setMode(nextMode);
    setError(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100/70 bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.18),_transparent_55%)] px-4 py-12 transition-colors dark:bg-slate-950 dark:bg-[radial-gradient(circle_at_top,_rgba(56,189,248,0.22),_transparent_60%)]">
      <div className="mb-8 flex w-full max-w-md items-center justify-between text-slate-600 dark:text-slate-300">
        <div>
          <div className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Judo CRM</div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Войдите, чтобы продолжить работу</p>
        </div>
        <button
          type="button"
          onClick={onToggleTheme}
          className="rounded-xl border border-slate-200/70 bg-white/80 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 shadow-sm transition hover:border-sky-400 hover:text-slate-900 dark:border-slate-700/70 dark:bg-slate-900/70 dark:text-slate-200 dark:hover:border-sky-500/60 dark:hover:text-white"
        >
          {theme === "light" ? "Ночь" : "День"}
        </button>
      </div>

      <div className="w-full max-w-md rounded-3xl border border-slate-200/70 bg-white/80 p-8 shadow-xl shadow-sky-500/10 transition dark:border-slate-800/60 dark:bg-slate-950/80">
        <div className="mb-6 flex rounded-2xl bg-slate-100/80 p-1 text-sm font-semibold text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
          <button
            type="button"
            onClick={() => toggleMode("login")}
            className={`flex-1 rounded-2xl px-4 py-2 transition ${
              mode === "login"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                : "hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Вход
          </button>
          <button
            type="button"
            onClick={() => toggleMode("register")}
            className={`flex-1 rounded-2xl px-4 py-2 transition ${
              mode === "register"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-slate-100"
                : "hover:text-slate-700 dark:hover:text-slate-200"
            }`}
          >
            Регистрация
          </button>
        </div>

        {error ? (
          <div className="mb-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {mode === "login" ? (
          <form className="space-y-4" onSubmit={handleLogin}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="login">
                Логин
              </label>
              <input
                id="login"
                type="text"
                autoComplete="username"
                className={CONTROL_CLASS}
                value={loginForm.login}
                onChange={event => setLoginForm(prev => ({ ...prev, login: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="password">
                Пароль
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                className={CONTROL_CLASS}
                value={loginForm.password}
                onChange={event => setLoginForm(prev => ({ ...prev, password: event.target.value }))}
              />
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-sky-500 via-blue-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-sky-500/30 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-sky-300/60 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-sky-500/40"
              disabled={loading}
            >
              {loading ? "Вход..." : "Войти"}
            </button>
            <div className="rounded-xl border border-slate-200/60 bg-slate-50/80 px-4 py-3 text-xs text-slate-500 dark:border-slate-800/60 dark:bg-slate-900/70 dark:text-slate-400">
              <p className="font-semibold text-slate-600 dark:text-slate-200">Доступы администратора:</p>
              <ul className="mt-2 space-y-1">
                <li>
                  <span className="font-medium text-slate-700 dark:text-slate-300">admin1</span> / admin1
                </li>
                <li>
                  <span className="font-medium text-slate-700 dark:text-slate-300">admin2</span> / admin2
                </li>
                <li>
                  <span className="font-medium text-slate-700 dark:text-slate-300">admin3</span> / admin3
                </li>
              </ul>
            </div>
          </form>
        ) : (
          <form className="space-y-4" onSubmit={handleRegister}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="register-name">
                Имя пользователя
              </label>
              <input
                id="register-name"
                type="text"
                autoComplete="name"
                className={CONTROL_CLASS}
                value={registerForm.name}
                onChange={event => setRegisterForm(prev => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="register-login">
                Логин
              </label>
              <input
                id="register-login"
                type="text"
                autoComplete="username"
                className={CONTROL_CLASS}
                value={registerForm.login}
                onChange={event => setRegisterForm(prev => ({ ...prev, login: event.target.value }))}
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="register-role">
                Роль
              </label>
              <select
                id="register-role"
                className={CONTROL_CLASS}
                value={registerForm.role}
                onChange={event => setRegisterForm(prev => ({ ...prev, role: event.target.value as Role }))}
              >
                {roles.map(role => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="register-password">
                  Пароль
                </label>
                <input
                  id="register-password"
                  type="password"
                  autoComplete="new-password"
                  className={CONTROL_CLASS}
                  value={registerForm.password}
                  onChange={event => setRegisterForm(prev => ({ ...prev, password: event.target.value }))}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-slate-600 dark:text-slate-300" htmlFor="register-confirm">
                  Повторите пароль
                </label>
                <input
                  id="register-confirm"
                  type="password"
                  autoComplete="new-password"
                  className={CONTROL_CLASS}
                  value={registerForm.confirm}
                  onChange={event => setRegisterForm(prev => ({ ...prev, confirm: event.target.value }))}
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full rounded-xl bg-gradient-to-r from-emerald-500 via-green-500 to-teal-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-500/30 transition hover:-translate-y-[1px] hover:shadow-xl focus:outline-none focus:ring-2 focus:ring-emerald-300/60 disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-emerald-500/40"
              disabled={loading}
            >
              {loading ? "Создание..." : "Зарегистрироваться"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
