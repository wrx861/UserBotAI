import { useState, useEffect } from "react";
import { GraduationCap, Scan, Loader2, Trash2, CheckCircle, AlertCircle, MessageSquare, Brain, ToggleLeft, ToggleRight, ChevronDown } from "lucide-react";
import { Slider } from "../components/ui/slider";

export default function TrainingPanel({ apiUrl, botRunning, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [status, setStatus] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [maxChats, setMaxChats] = useState(50);
  const [msgsPerChat, setMsgsPerChat] = useState(100);
  const [scanResult, setScanResult] = useState(null);
  const [showExamples, setShowExamples] = useState(false);
  const [toggling, setToggling] = useState(false);

  const fetchStatus = () => {
    fetch(`${apiUrl}/bot/training/status`)
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => {});
  };

  useEffect(() => {
    fetchStatus();
  }, [apiUrl]);

  const handleScan = async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch(`${apiUrl}/bot/training/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_chats: maxChats,
          messages_per_chat: msgsPerChat,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Ошибка");
      }
      const data = await res.json();
      setScanResult(data);
      fetchStatus();
    } catch (e) {
      setScanResult({ error: e.message });
    }
    setScanning(false);
  };

  const handleReset = async () => {
    await fetch(`${apiUrl}/bot/training/reset`, { method: "DELETE" });
    setScanResult(null);
    setShowExamples(false);
    fetchStatus();
  };

  const handleToggle = async () => {
    setToggling(true);
    try {
      const res = await fetch(`${apiUrl}/bot/training/toggle`, { method: "POST" });
      const data = await res.json();
      setStatus((prev) => prev ? { ...prev, training_enabled: data.training_enabled } : prev);
    } catch (e) {
      console.error("Toggle error:", e);
    }
    setToggling(false);
  };

  return (
    <div
      data-testid="training-panel"
      className="border border-white/[0.06]"
      style={{ background: "#0A0A0A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <GraduationCap className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Обучение по переписке
          </span>
          {status?.has_training_data && (
            <span className="text-[10px] font-mono text-emerald-600">{status.examples_count || ""} примеров</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status?.has_training_data && (
            <button
              data-testid="training-reset-btn"
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="text-neutral-600 hover:text-red-400 transition-colors"
              title="Сбросить обучение"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
        </div>
      </div>

      {isOpen && <div className="p-4 space-y-4 border-t border-white/[0.06]">
        <p className="font-mono text-[10px] text-neutral-600 leading-relaxed">
          Бот просканирует все <span className="text-neutral-400">личные</span> диалоги в аккаунте Telegram,
          использует AI для анализа стиля ваших ответов и будет подражать им при общении с пользователями.
          Группы и каналы не сканируются.
        </p>

        {/* Current training status */}
        {status?.has_training_data && (
          <div
            data-testid="training-status"
            className="space-y-2"
          >
            <div className="flex items-start gap-2 px-3 py-2 border border-emerald-500/20 bg-emerald-500/5">
              <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="font-mono text-[10px] text-emerald-400 leading-relaxed">
                <p>Обучено на {status.total_examples} примерах из {status.scanned_chats} личных чатов</p>
                {status.few_shot_count > 0 && (
                  <p className="text-emerald-500/70">{status.few_shot_count} лучших примеров в промпте</p>
                )}
                {status.scanned_at && (
                  <p className="text-neutral-600 mt-0.5">
                    Последнее сканирование: {new Date(status.scanned_at).toLocaleString("ru-RU")}
                  </p>
                )}
              </div>
            </div>

            {/* Toggle training on/off */}
            <div className="flex items-center justify-between px-3 py-2 border border-white/[0.06]">
              <div className="flex items-center gap-2">
                {status.training_enabled ? (
                  <ToggleRight className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <ToggleLeft className="h-3.5 w-3.5 text-neutral-500" />
                )}
                <span className="text-[10px] uppercase tracking-widest text-neutral-400">
                  Использовать обученный стиль
                </span>
              </div>
              <button
                data-testid="training-toggle"
                onClick={handleToggle}
                disabled={toggling}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  status.training_enabled ? "bg-emerald-500" : "bg-neutral-700"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    status.training_enabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
            {!status.training_enabled && (
              <div className="font-mono text-[10px] text-amber-500/70 px-3">
                Обученный контекст выключен — бот использует только базовый промпт
              </div>
            )}

            {/* Few-shot examples preview */}
            {status?.few_shot_examples?.length > 0 && (
              <div>
                <button
                  onClick={() => setShowExamples(!showExamples)}
                  className="flex items-center gap-1.5 text-[10px] font-mono text-neutral-500 hover:text-[#00F0FF] transition-colors"
                >
                  <MessageSquare className="h-3 w-3" />
                  {showExamples ? "Скрыть примеры" : `Показать примеры диалогов (${status.few_shot_examples.length})`}
                </button>
                {showExamples && (
                  <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                    {status.few_shot_examples.map((ex, i) => (
                      <div
                        key={i}
                        className="px-3 py-2 border border-white/[0.04] font-mono text-[10px]"
                        style={{ background: "rgba(0,0,0,0.3)" }}
                      >
                        <p className="text-neutral-500">
                          <span className="text-neutral-600">Клиент:</span> {ex.user?.substring(0, 120)}{ex.user?.length > 120 ? "..." : ""}
                        </p>
                        <p className="text-emerald-500/70 mt-1">
                          <span className="text-neutral-600">Оператор:</span> {ex.admin?.substring(0, 120)}{ex.admin?.length > 120 ? "..." : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Scan settings */}
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Макс. чатов
              </span>
              <span className="font-mono text-xs text-[#00F0FF]">{maxChats}</span>
            </div>
            <Slider
              value={[maxChats]}
              onValueChange={([v]) => setMaxChats(v)}
              min={10}
              max={200}
              step={10}
              className="w-full"
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Сообщений на чат
              </span>
              <span className="font-mono text-xs text-[#00F0FF]">{msgsPerChat}</span>
            </div>
            <Slider
              value={[msgsPerChat]}
              onValueChange={([v]) => setMsgsPerChat(v)}
              min={20}
              max={500}
              step={20}
              className="w-full"
            />
          </div>
        </div>

        {/* Scan button */}
        <button
          data-testid="training-scan-btn"
          onClick={handleScan}
          disabled={scanning || !botRunning}
          className="w-full py-2.5 text-xs font-bold uppercase tracking-widest
            bg-emerald-500 text-black hover:bg-emerald-400 transition-colors
            disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {scanning ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Сканирование + AI анализ...
            </>
          ) : (
            <>
              <Scan className="h-3.5 w-3.5" />
              {status?.has_training_data ? "Пересканировать" : "Сканировать диалоги"}
            </>
          )}
        </button>

        {!botRunning && (
          <div className="flex items-center gap-2 text-[10px] font-mono text-amber-500">
            <AlertCircle className="h-3 w-3" />
            Бот должен быть запущен для сканирования
          </div>
        )}

        {/* Scan result */}
        {scanResult && !scanResult.error && (
          <div
            data-testid="scan-result"
            className="space-y-2 px-3 py-2 border border-emerald-500/20 bg-emerald-500/5"
          >
            <div className="flex items-center gap-2">
              <Brain className="h-3.5 w-3.5 text-emerald-400" />
              <p className="font-mono text-xs text-emerald-400">Сканирование и AI-анализ завершены!</p>
            </div>
            <div className="font-mono text-[10px] text-neutral-400 space-y-0.5">
              <p>Личных чатов: {scanResult.scanned_chats}</p>
              <p>Пар сообщений: {scanResult.total_pairs}</p>
              <p>Всего сообщений: {scanResult.total_messages}</p>
              {scanResult.skipped_non_private > 0 && (
                <p className="text-neutral-600">Пропущено (не личные): {scanResult.skipped_non_private}</p>
              )}
              {scanResult.few_shot_count > 0 && (
                <p className="text-emerald-500/70">Примеров в промпте: {scanResult.few_shot_count}</p>
              )}
            </div>
          </div>
        )}

        {scanResult?.error && (
          <div className="flex items-center gap-2 px-3 py-2 border border-red-500/20 bg-red-500/5">
            <AlertCircle className="h-3 w-3 text-red-400" />
            <span className="font-mono text-[10px] text-red-400">{scanResult.error}</span>
          </div>
        )}

        {/* Style profile preview */}
        {status?.style_profile && (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Brain className="h-3 w-3 text-[#00F0FF]" />
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                AI-профиль стиля
              </span>
            </div>
            <div
              data-testid="style-profile"
              className="font-mono text-[10px] text-neutral-500 leading-relaxed px-3 py-2
                border border-white/[0.04] max-h-48 overflow-y-auto whitespace-pre-wrap"
              style={{ background: "rgba(0,0,0,0.3)" }}
            >
              {status.style_profile}
            </div>
          </div>
        )}
      </div>}
    </div>
  );
}