import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { LayoutDashboard, Settings, Power, PowerOff, LogOut } from "lucide-react";

import AuthGate from "./components/AuthGate";
import Header from "./components/Header";
import StatusCards from "./components/StatusCards";
import TerminalFeed from "./components/TerminalFeed";
import ConfigPanel from "./components/ConfigPanel";
import MediaGallery from "./components/MediaGallery";
import ConversationsList from "./components/ConversationsList";
import TestChat from "./components/TestChat";
import AuthDialog from "./components/AuthDialog";
import TelegramSettings from "./components/TelegramSettings";
import PromptEditor from "./components/PromptEditor";
import MediaManager from "./components/MediaManager";
import AISettings from "./components/AISettings";
import TrainingPanel from "./components/TrainingPanel";
import VoiceSettings from "./components/VoiceSettings";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

// ── Axios interceptor для JWT ──
function setupAxiosAuth(token) {
  if (token) {
    axios.defaults.headers.common["Authorization"] = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common["Authorization"];
  }
}

function App() {
  // ── Auth state ──
  const [authChecked, setAuthChecked] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authUser, setAuthUser] = useState(null);

  // ── App state ──
  const [tab, setTab] = useState("dashboard");
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [mediaTemplates, setMediaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Проверка авторизации при загрузке ──
  useEffect(() => {
    const checkAuth = async () => {
      // Восстанавливаем токен из localStorage
      const savedToken = localStorage.getItem("auth_token");
      if (savedToken) {
        setupAxiosAuth(savedToken);
      }

      try {
        const headers = savedToken ? { Authorization: `Bearer ${savedToken}` } : {};
        const res = await fetch(`${API}/auth/me`, { headers });
        const data = await res.json();

        if (!data.auth_required) {
          // Auth не настроен → показываем AuthGate с формой настройки
          setAuthRequired(false);
          setAuthenticated(false);
          setAuthChecked(true);
          return;
        }

        setAuthRequired(true);
        if (data.authenticated) {
          setAuthenticated(true);
          setAuthUser(data.user);
          setupAxiosAuth(savedToken);
        } else {
          setAuthenticated(false);
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          setupAxiosAuth(null);
        }
      } catch {
        // Если сервер не отвечает — показываем auth gate
        setAuthRequired(false);
        setAuthenticated(false);
      }
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  const handleAuth = useCallback((token, user) => {
    setupAxiosAuth(token);
    setAuthenticated(true);
    setAuthRequired(true);
    setAuthUser(user);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
    setupAxiosAuth(null);
    setAuthenticated(false);
    setAuthUser(null);
  }, []);

  // ── Axios interceptor для 401 → автоматический logout ──
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err?.response?.status === 401 && authenticated) {
          handleLogout();
          toast.error("Сессия истекла. Войдите заново.");
        }
        return Promise.reject(err);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [authenticated, handleLogout]);

  const fetchAll = useCallback(async () => {
    try {
      const [statusRes, configRes, logsRes, convosRes, mediaRes] =
        await Promise.allSettled([
          axios.get(`${API}/bot/status`),
          axios.get(`${API}/bot/config`),
          axios.get(`${API}/bot/activity`),
          axios.get(`${API}/bot/conversations`),
          axios.get(`${API}/bot/media-templates`),
        ]);

      if (statusRes.status === "fulfilled") setStatus(statusRes.value.data);
      if (configRes.status === "fulfilled") setConfig(configRes.value.data);
      if (logsRes.status === "fulfilled") setLogs(logsRes.value.data);
      if (convosRes.status === "fulfilled") setConversations(convosRes.value.data);
      if (mediaRes.status === "fulfilled") setMediaTemplates(mediaRes.value.data);
    } catch (e) {
      console.error("Ошибка загрузки:", e);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleConfigUpdate = async (newConfig) => {
    try {
      await axios.post(`${API}/bot/config`, newConfig);
      toast.success("Настройки обновлены");
      fetchAll();
    } catch {
      toast.error("Ошибка сохранения");
    }
  };

  const handleTestMessage = async (chatId, text) => {
    const res = await axios.post(`${API}/bot/test-message`, {
      chat_id: chatId,
      text,
    });
    fetchAll();
    return res.data;
  };

  const handleStartBot = async () => {
    try {
      await axios.post(`${API}/bot/start`);
      toast.success("Бот запускается...");
      setTimeout(fetchAll, 2000);
    } catch {
      toast.error("Ошибка запуска бота");
    }
  };

  const handleToggleAutoReply = async () => {
    const newValue = !(config?.auto_reply ?? true);
    try {
      await axios.post(`${API}/bot/config`, { auto_reply: newValue });
      toast.success(newValue ? "ИИ включён" : "ИИ отключён");
      fetchAll();
    } catch {
      toast.error("Ошибка переключения");
    }
  };

  const autoReplyEnabled = config?.auto_reply ?? true;

  const needsAuth = status?.auth_status === "needs_auth";
  const authCodeSent = status?.auth_status === "code_sent";
  const sessionReady = status?.auth_status === "session_ready";
  const tgCreds = status?.telegram_configured;
  const phoneFromStatus = status?.phone_number || "";

  if (!authChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#050505" }}>
        <div className="flex flex-col items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-[#00F0FF] beacon-active" />
          <span className="font-mono text-xs text-neutral-500 uppercase tracking-widest">
            Загрузка...
          </span>
        </div>
      </div>
    );
  }

  // Если не авторизован — показываем AuthGate
  if (!authenticated) {
    return <AuthGate onAuth={handleAuth} />;
  }

  if (loading) {
    return (
      <div
        data-testid="loading-screen"
        className="min-h-screen flex items-center justify-center"
        style={{ background: "#050505" }}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="h-3 w-3 rounded-full bg-[#00F0FF] beacon-active" />
          <span className="font-mono text-xs text-neutral-500 uppercase tracking-widest">
            Загрузка...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="app-root"
      className="min-h-screen flex flex-col"
      style={{ background: "#050505" }}
    >
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#0A0A0A",
            color: "#E5E5E5",
            border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: "2px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: "12px",
          },
        }}
      />

      <Header
        isRunning={status?.is_running}
        telegramConfigured={status?.telegram_configured}
        authUser={authUser}
        authRequired={authRequired}
        onLogout={handleLogout}
      />

      {/* Tab Navigation */}
      <div className="border-b border-white/[0.06] px-6" style={{ background: "#0A0A0A" }}>
        <div className="flex gap-0">
          <button
            data-testid="tab-dashboard"
            onClick={() => setTab("dashboard")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono uppercase tracking-widest
              border-b-2 transition-colors ${
              tab === "dashboard"
                ? "border-[#00F0FF] text-[#00F0FF]"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Панель
          </button>
          <button
            data-testid="tab-settings"
            onClick={() => setTab("settings")}
            className={`flex items-center gap-2 px-4 py-2.5 text-xs font-mono uppercase tracking-widest
              border-b-2 transition-colors ${
              tab === "settings"
                ? "border-[#00F0FF] text-[#00F0FF]"
                : "border-transparent text-neutral-500 hover:text-neutral-300"
            }`}
          >
            <Settings className="h-3.5 w-3.5" />
            Настройки
          </button>
        </div>
      </div>

      <main className="flex-1 p-4 lg:p-6">
        {tab === "dashboard" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-full">
            {/* Левая колонка */}
            <div className="lg:col-span-3 space-y-4">
              <StatusCards status={status} />
              <ConversationsList conversations={conversations} />
            </div>

            {/* Центральная колонка */}
            <div className="lg:col-span-6 space-y-4">
              <TerminalFeed logs={logs} />
              <TestChat onSend={handleTestMessage} />
            </div>

            {/* Правая колонка */}
            <div className="lg:col-span-3 space-y-4">
              {/* Кнопка Вкл/Выкл ИИ */}
              <div
                data-testid="ai-toggle-card"
                className="border border-white/[0.06] p-4"
                style={{ background: "#0A0A0A" }}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="font-mono text-[11px] text-neutral-500 uppercase tracking-widest">
                    Авто-ответ ИИ
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest ${
                      autoReplyEnabled ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        autoReplyEnabled ? "bg-emerald-400 beacon-active" : "bg-red-400"
                      }`}
                    />
                    {autoReplyEnabled ? "Активен" : "Отключён"}
                  </span>
                </div>
                <button
                  data-testid="ai-toggle-btn"
                  onClick={handleToggleAutoReply}
                  className={`w-full py-3 text-xs font-bold uppercase tracking-widest
                    flex items-center justify-center gap-2 transition-all duration-200 ${
                    autoReplyEnabled
                      ? "bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/50"
                      : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50"
                  }`}
                >
                  {autoReplyEnabled ? (
                    <>
                      <PowerOff className="h-4 w-4" />
                      Отключить
                    </>
                  ) : (
                    <>
                      <Power className="h-4 w-4" />
                      Включить
                    </>
                  )}
                </button>
              </div>

              {sessionReady && !status?.is_running && (
                <div
                  data-testid="start-bot-card"
                  className="border border-white/[0.06] p-4"
                  style={{ background: "#0A0A0A" }}
                >
                  <p className="font-mono text-xs text-neutral-400 mb-3">
                    Сессия готова. Запустите бота.
                  </p>
                  <button
                    data-testid="start-bot-btn"
                    onClick={handleStartBot}
                    className="w-full py-2.5 text-xs font-bold uppercase tracking-widest
                      bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
                  >
                    Запустить бота
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Settings Tab */
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl mx-auto">
            {/* Left: Telegram + AI Provider + Config */}
            <div className="space-y-4">
              <TelegramSettings apiUrl={API} />

              {(needsAuth || authCodeSent) && (
                <AuthDialog
                  phoneNumber={phoneFromStatus}
                  initialStep={authCodeSent ? "code_sent" : "idle"}
                  onComplete={() => {
                    toast.success("Авторизация успешна!");
                    fetchAll();
                  }}
                />
              )}

              {sessionReady && !status?.is_running && (
                <div
                  className="border border-white/[0.06] p-4"
                  style={{ background: "#0A0A0A" }}
                >
                  <p className="font-mono text-xs text-neutral-400 mb-3">
                    Сессия готова. Запустите бота.
                  </p>
                  <button
                    data-testid="settings-start-bot-btn"
                    onClick={handleStartBot}
                    className="w-full py-2.5 text-xs font-bold uppercase tracking-widest
                      bg-emerald-500 text-black hover:bg-emerald-400 transition-colors"
                  >
                    Запустить бота
                  </button>
                </div>
              )}

              <AISettings apiUrl={API} />
              <VoiceSettings apiUrl={API} />

              {config && (
                <ConfigPanel config={config} onUpdate={handleConfigUpdate} />
              )}
            </div>

            {/* Right: Prompt + Training + Media */}
            <div className="space-y-4">
              <PromptEditor apiUrl={API} />
              <TrainingPanel apiUrl={API} botRunning={status?.is_running} />
              <MediaManager apiUrl={API} onRefresh={fetchAll} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
