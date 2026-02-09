import { useState, useEffect, useCallback } from "react";
import "@/App.css";
import axios from "axios";
import { Toaster, toast } from "sonner";
import { LayoutDashboard, Settings } from "lucide-react";

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

function App() {
  const [tab, setTab] = useState("dashboard");
  const [status, setStatus] = useState(null);
  const [config, setConfig] = useState(null);
  const [logs, setLogs] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [mediaTemplates, setMediaTemplates] = useState([]);
  const [loading, setLoading] = useState(true);

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

  const needsAuth = status?.auth_status === "needs_auth";
  const authCodeSent = status?.auth_status === "code_sent";
  const sessionReady = status?.auth_status === "session_ready";
  const tgCreds = status?.telegram_configured;
  const phoneFromStatus = status?.phone_number || "";

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
