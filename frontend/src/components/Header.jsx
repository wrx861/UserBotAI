import { Shield, Wifi, WifiOff, Star } from "lucide-react";

export default function Header({ isRunning, telegramConfigured }) {
  return (
    <header
      data-testid="app-header"
      className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between"
      style={{ background: "#0A0A0A" }}
    >
      <div className="flex items-center gap-3">
        <Shield className="h-6 w-6 text-[#00F0FF]" />
        <h1
          data-testid="app-title"
          className="text-xl font-bold tracking-tight text-white"
          style={{ fontFamily: "Chivo, sans-serif" }}
        >
          Support
          <span className="text-[#00F0FF] ml-1">AI</span>
          <span className="text-neutral-400 ml-1 font-normal text-base">UserBot</span>
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* GitHub Star */}
        <a
          href="https://github.com/wrx861/UserBotAI"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-2.5 py-1 border border-white/[0.08] rounded-md
            text-xs font-mono text-neutral-400 hover:text-amber-300 hover:border-amber-500/30
            hover:bg-amber-500/5 transition-all duration-200 group"
          title="Star on GitHub"
        >
          <Star className="h-3.5 w-3.5 text-amber-500/70 group-hover:text-amber-400 group-hover:fill-amber-400 transition-all duration-200" />
          <span className="hidden sm:inline">GitHub</span>
        </a>

        {telegramConfigured ? (
          <div
            data-testid="telegram-status-connected"
            className="flex items-center gap-2 text-xs font-mono"
          >
            <Wifi className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-emerald-400">TG ПОДКЛЮЧЁН</span>
          </div>
        ) : (
          <div
            data-testid="telegram-status-disconnected"
            className="flex items-center gap-2 text-xs font-mono"
          >
            <WifiOff className="h-3.5 w-3.5 text-amber-500" />
            <span className="text-amber-400">TG НЕ НАСТРОЕН</span>
          </div>
        )}

        <div className="flex items-center gap-2">
          {isRunning ? (
            <div data-testid="bot-status-online" className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-emerald-500 beacon-active" />
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">
                Онлайн
              </span>
            </div>
          ) : (
            <div data-testid="bot-status-offline" className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-neutral-600" />
              <span className="text-xs font-mono text-neutral-500 uppercase tracking-widest">
                Оффлайн
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
