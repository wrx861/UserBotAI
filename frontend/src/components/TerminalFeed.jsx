import { useEffect, useRef } from "react";
import { Activity } from "lucide-react";

const EVENT_COLORS = {
  message_received: "#00F0FF",
  response_sent: "#10B981",
  silence_activated: "#F59E0B",
  image_analyzed: "#A78BFA",
  media_sent: "#EC4899",
  bot_started: "#10B981",
  bot_stopped: "#EF4444",
  test_response: "#00F0FF",
};

const EVENT_LABELS = {
  message_received: "ВХОД",
  response_sent: "ОТВЕТ",
  silence_activated: "ТИШИНА",
  image_analyzed: "ФОТО AI",
  media_sent: "МЕДИА",
  bot_started: "СТАРТ",
  bot_stopped: "СТОП",
  test_response: "ТЕСТ",
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function TerminalFeed({ logs }) {
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div
      data-testid="terminal-feed"
      className="border border-white/[0.06] flex flex-col h-full"
      style={{ background: "#0A0A0A" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Лента активности
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500 beacon-active" />
          <span className="text-[10px] font-mono text-neutral-500">LIVE</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-1"
        style={{ maxHeight: "calc(100vh - 200px)" }}
      >
        {(!logs || logs.length === 0) ? (
          <div
            data-testid="terminal-empty"
            className="flex flex-col items-center justify-center py-16 text-neutral-600"
          >
            <Activity className="h-8 w-8 mb-3 opacity-30" />
            <p className="font-mono text-xs">Ожидание событий...</p>
            <span className="inline-block w-2 h-4 bg-[#00F0FF]/60 ml-1 cursor-blink" />
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={log.id || i}
              data-testid={`activity-log-${i}`}
              className="flex items-start gap-2 font-mono text-xs leading-relaxed animate-fade-in opacity-0 hover:bg-white/[0.02] px-2 py-1 transition-colors"
              style={{ animationDelay: `${i * 20}ms` }}
            >
              <span className="text-neutral-600 shrink-0">
                {formatTime(log.timestamp)}
              </span>
              <span
                className="shrink-0 font-semibold w-14 text-right"
                style={{ color: EVENT_COLORS[log.event_type] || "#525252" }}
              >
                {EVENT_LABELS[log.event_type] || log.event_type.toUpperCase().slice(0, 8)}
              </span>
              {log.username && (
                <span className="text-neutral-500 shrink-0">@{log.username}</span>
              )}
              <span className="text-neutral-400 truncate">{log.details}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
