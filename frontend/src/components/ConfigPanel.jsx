import { useState } from "react";
import { Settings, Timer, History, Power, ChevronDown, Thermometer } from "lucide-react";
import { Switch } from "../components/ui/switch";
import { Slider } from "../components/ui/slider";

export default function ConfigPanel({ config, onUpdate, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [localConfig, setLocalConfig] = useState(config);
  const [saving, setSaving] = useState(false);

  const handleChange = (key, value) => {
    setLocalConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(localConfig);
    setSaving(false);
  };

  const hasChanges = JSON.stringify(localConfig) !== JSON.stringify(config);

  const tempValue = localConfig?.temperature ?? 0.7;
  const tempLabel = tempValue <= 0.3 ? "Точный" : tempValue <= 0.6 ? "Сбалансированный" : tempValue <= 0.8 ? "Креативный" : "Максимум";
  const tempColor = tempValue <= 0.3 ? "text-blue-400" : tempValue <= 0.6 ? "text-emerald-400" : tempValue <= 0.8 ? "text-amber-400" : "text-red-400";

  return (
    <div
      data-testid="config-panel"
      className="border border-white/[0.06] p-0"
      style={{ background: "#0A0A0A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <Settings className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Настройки
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
      </div>

      {isOpen && <div className="p-4 space-y-5 border-t border-white/[0.06]">
        {/* Таймер тишины */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Timer className="h-3.5 w-3.5 text-amber-500" />
              <span className="text-xs uppercase tracking-wider text-neutral-400">
                Таймер тишины
              </span>
            </div>
            <span data-testid="silence-timer-value" className="font-mono text-sm text-amber-400">
              {localConfig?.silence_duration_min ?? 30} мин
            </span>
          </div>
          <Slider
            data-testid="silence-timer-slider"
            value={[localConfig?.silence_duration_min ?? 30]}
            onValueChange={([v]) => handleChange("silence_duration_min", v)}
            min={5} max={120} step={5}
            className="w-full"
          />
        </div>

        {/* Память контекста */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-3.5 w-3.5 text-[#00F0FF]" />
              <span className="text-xs uppercase tracking-wider text-neutral-400">
                Память контекста
              </span>
            </div>
            <span data-testid="history-limit-value" className="font-mono text-sm text-[#00F0FF]">
              {localConfig?.history_limit ?? 20} сообщ.
            </span>
          </div>
          <Slider
            data-testid="history-limit-slider"
            value={[localConfig?.history_limit ?? 20]}
            onValueChange={([v]) => handleChange("history_limit", v)}
            min={5} max={50} step={5}
            className="w-full"
          />
        </div>

        {/* Температура AI */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Thermometer className="h-3.5 w-3.5 text-orange-500" />
              <span className="text-xs uppercase tracking-wider text-neutral-400">
                Температура AI
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`font-mono text-[10px] ${tempColor}`}>
                {tempLabel}
              </span>
              <span data-testid="temperature-value" className="font-mono text-sm text-orange-400">
                {tempValue.toFixed(1)}
              </span>
            </div>
          </div>
          <Slider
            data-testid="temperature-slider"
            value={[tempValue * 100]}
            onValueChange={([v]) => handleChange("temperature", Math.round(v) / 100)}
            min={10} max={100} step={5}
            className="w-full"
          />
          <p className="font-mono text-[9px] text-neutral-600 px-1">
            Низкая — точные, предсказуемые ответы · Высокая — креативные, разнообразные
          </p>
        </div>

        {/* Авто-ответ */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Power className="h-3.5 w-3.5 text-emerald-500" />
            <span className="text-xs uppercase tracking-wider text-neutral-400">Авто-ответ</span>
          </div>
          <Switch
            data-testid="auto-reply-switch"
            checked={localConfig?.auto_reply ?? true}
            onCheckedChange={(v) => handleChange("auto_reply", v)}
          />
        </div>

        {hasChanges && (
          <button
            data-testid="config-save-btn"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-2 text-xs font-bold uppercase tracking-widest
              bg-[#00F0FF] text-black hover:bg-white transition-colors"
          >
            {saving ? "Сохранение..." : "Применить"}
          </button>
        )}
      </div>}
    </div>
  );
}
