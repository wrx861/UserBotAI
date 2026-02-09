import { useState, useEffect, useCallback, useRef } from "react";
import { Shield, Key, AtSign, LogIn, Loader2, AlertCircle } from "lucide-react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/**
 * Экран авторизации через Telegram:
 * 1) Если bot не настроен → форма ввода bot_token + bot_username
 * 2) Если настроен → виджет Telegram Login
 * 3) После авторизации → вызывает onAuth с токеном
 */
export default function AuthGate({ onAuth }) {
  const [authConfig, setAuthConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [setupMode, setSetupMode] = useState(false);
  const [botToken, setBotToken] = useState("");
  const [botUsername, setBotUsername] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const widgetRef = useRef(null);

  const checkConfig = useCallback(async () => {
    try {
      const res = await fetch(`${API}/auth/config`);
      const data = await res.json();
      setAuthConfig(data);
      if (!data.configured) {
        setSetupMode(true);
      }
    } catch {
      setError("Не удалось подключиться к серверу");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkConfig();
  }, [checkConfig]);

  // Загрузка виджета Telegram Login
  useEffect(() => {
    if (!authConfig?.configured || !authConfig?.bot_username || setupMode) return;

    // Определяем глобальный callback
    window.onTelegramAuth = async (user) => {
      setVerifying(true);
      setError("");
      try {
        const res = await fetch(`${API}/auth/telegram`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(user),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.detail || "Ошибка авторизации");
          setVerifying(false);
          return;
        }
        // Сохраняем токен
        localStorage.setItem("auth_token", data.token);
        localStorage.setItem("auth_user", JSON.stringify(data.user));
        onAuth(data.token, data.user);
      } catch {
        setError("Ошибка сети");
        setVerifying(false);
      }
    };

    // Создаём скрипт виджета
    if (widgetRef.current) {
      widgetRef.current.innerHTML = "";
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-widget.js?22";
      script.setAttribute("data-telegram-login", authConfig.bot_username);
      script.setAttribute("data-size", "large");
      script.setAttribute("data-radius", "4");
      script.setAttribute("data-onauth", "onTelegramAuth(user)");
      script.setAttribute("data-request-access", "write");
      script.async = true;
      widgetRef.current.appendChild(script);
    }

    return () => {
      delete window.onTelegramAuth;
    };
  }, [authConfig, setupMode, onAuth]);

  const handleSetup = async (e) => {
    e.preventDefault();
    if (!botToken.trim() || !botUsername.trim()) {
      setError("Заполните оба поля");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(`${API}/auth/setup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bot_token: botToken.trim(),
          bot_username: botUsername.trim().replace("@", ""),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Ошибка настройки");
        setSaving(false);
        return;
      }
      setSetupMode(false);
      await checkConfig();
    } catch {
      setError("Ошибка сети");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050505" }}>
        <Loader2 className="h-8 w-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "#050505" }}>
      <div className="w-full max-w-md mx-4">
        {/* Логотип */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <Shield className="h-8 w-8 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white font-mono">
              Support <span className="text-cyan-400">AI</span> UserBot
            </h1>
          </div>
          <p className="text-neutral-500 text-sm font-mono">
            {setupMode ? "Первоначальная настройка" : "Авторизация"}
          </p>
        </div>

        {/* Карточка */}
        <div className="border border-white/[0.06] p-6" style={{ background: "#0A0A0A" }}>
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-xs font-mono bg-red-500/10 border border-red-500/20 p-3 mb-4">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {setupMode ? (
            /* ── Форма настройки ── */
            <form onSubmit={handleSetup}>
              <div className="space-y-4">
                <div className="text-xs text-neutral-400 font-mono mb-4 leading-relaxed space-y-2">
                  <p>
                    <span className="text-white">1.</span> Создайте бота через{" "}
                    <a
                      href="https://t.me/BotFather"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-cyan-400 hover:underline"
                    >
                      @BotFather
                    </a>{" "}
                    и скопируйте токен
                  </p>
                  <p>
                    <span className="text-white">2.</span> В @BotFather откройте{" "}
                    <code className="text-cyan-300">/mybots</code> → выберите бота →{" "}
                    <code className="text-cyan-300">Bot Settings</code> →{" "}
                    <code className="text-cyan-300">Domain</code> →{" "}
                    добавьте ваш домен (например <code className="text-amber-400">panel.example.com</code>)
                  </p>
                  <p className="text-neutral-500">
                    Без привязки домена виджет авторизации не будет работать
                  </p>
                </div>

                <div>
                  <label className="block text-[11px] text-neutral-500 font-mono uppercase tracking-widest mb-1.5">
                    Bot Token
                  </label>
                  <div className="relative">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" />
                    <input
                      type="password"
                      value={botToken}
                      onChange={(e) => setBotToken(e.target.value)}
                      placeholder="1234567890:ABCdef..."
                      className="w-full bg-neutral-900/50 border border-white/[0.06] text-white text-sm font-mono
                                 placeholder:text-neutral-700 pl-10 pr-4 py-3 focus:outline-none focus:border-cyan-500/40"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] text-neutral-500 font-mono uppercase tracking-widest mb-1.5">
                    Bot Username
                  </label>
                  <div className="relative">
                    <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" />
                    <input
                      type="text"
                      value={botUsername}
                      onChange={(e) => setBotUsername(e.target.value)}
                      placeholder="my_support_bot"
                      className="w-full bg-neutral-900/50 border border-white/[0.06] text-white text-sm font-mono
                                 placeholder:text-neutral-700 pl-10 pr-4 py-3 focus:outline-none focus:border-cyan-500/40"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-3 bg-cyan-400 text-black text-xs font-bold uppercase tracking-widest
                             hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed
                             flex items-center justify-center gap-2 transition-colors"
                >
                  {saving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Shield className="h-4 w-4" />
                      Настроить
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : verifying ? (
            /* ── Проверяем авторизацию ── */
            <div className="text-center py-8">
              <Loader2 className="h-8 w-8 text-cyan-400 animate-spin mx-auto mb-3" />
              <p className="text-neutral-400 text-sm font-mono">Проверяем авторизацию...</p>
            </div>
          ) : (
            /* ── Виджет Telegram Login ── */
            <div className="text-center">
              <div className="text-xs text-neutral-400 font-mono mb-6 leading-relaxed">
                Войдите через Telegram чтобы получить доступ к панели управления
              </div>

              <div ref={widgetRef} className="flex justify-center min-h-[50px] items-center">
                <Loader2 className="h-5 w-5 text-neutral-600 animate-spin" />
              </div>

              <div className="mt-6 text-[10px] text-neutral-600 font-mono">
                Первый вход = администратор панели
              </div>
            </div>
          )}
        </div>

        {/* Подпись */}
        <div className="text-center mt-4 text-[10px] text-neutral-700 font-mono">
          Защищено Telegram Login Widget
        </div>
      </div>
    </div>
  );
}
