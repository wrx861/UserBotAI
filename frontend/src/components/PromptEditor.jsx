import { useState, useEffect } from "react";
import { Brain, Save, Loader2, RotateCcw, ChevronDown } from "lucide-react";

export default function PromptEditor({ apiUrl, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [prompt, setPrompt] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/bot/settings/prompt`)
      .then(r => r.json())
      .then(data => {
        setPrompt(data.prompt || "");
        setDefaultPrompt(data.default_prompt || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [apiUrl]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${apiUrl}/bot/settings/prompt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    } catch {}
    setSaving(false);
  };

  const handleReset = () => {
    setPrompt("");
  };

  if (!loaded) return null;

  return (
    <div
      data-testid="prompt-editor"
      className="border border-white/[0.06]"
      style={{ background: "#0A0A0A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Промт для ИИ
          </span>
          {prompt && (
            <span className="text-[10px] font-mono text-neutral-600">{prompt.length} симв.</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="prompt-reset-btn"
            onClick={(e) => { e.stopPropagation(); handleReset(); }}
            className="text-neutral-600 hover:text-amber-400 transition-colors"
            title="Сбросить к стандартному"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
        </div>
      </div>

      {isOpen && <div className="p-4 space-y-3 border-t border-white/[0.06]">
        <p className="font-mono text-[10px] text-neutral-600 leading-relaxed">
          Пустое поле = стандартный промт. Напишите свой текст для кастомизации поведения ИИ.
          Медиа-шаблоны добавляются автоматически в конец.
        </p>

        <textarea
          data-testid="prompt-textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={defaultPrompt}
          rows={12}
          className="w-full font-mono text-xs px-3 py-2 bg-black/50 border border-white/[0.06]
            focus:border-purple-500/40 outline-none text-neutral-300 placeholder:text-neutral-700
            resize-y leading-relaxed"
        />

        <div className="flex items-center justify-between text-[10px] font-mono text-neutral-600">
          <span>{prompt ? "Кастомный промт" : "Стандартный промт"}</span>
          <span>{prompt.length} симв.</span>
        </div>

        <button
          data-testid="prompt-save-btn"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 text-xs font-bold uppercase tracking-widest
            bg-purple-500 text-white hover:bg-purple-400 transition-colors
            disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Сохранение..." : "Сохранить промт"}
        </button>
      </div>}
    </div>
  );
}
