import { useState, useEffect } from "react";
import axios from "axios";
import { KeyRound, Save, Loader2, Trash2, RotateCcw, ChevronDown } from "lucide-react";

export default function TelegramSettings({ apiUrl, defaultOpen = true }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [creds, setCreds] = useState({
    api_id: "", api_hash: "", phone_number: "", admin_user_id: ""
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    axios.get(`${apiUrl}/bot/settings/telegram`)
      .then(res => { setCreds(res.data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [apiUrl]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.post(`${apiUrl}/bot/settings/telegram`, creds);
    } catch {}
    setSaving(false);
  };

  const handleClear = () => {
    setCreds({ api_id: "", api_hash: "", phone_number: "", admin_user_id: "" });
  };

  if (!loaded) return null;

  const fields = [
    { key: "api_id", label: "API ID", placeholder: "12345678", type: "text" },
    { key: "api_hash", label: "API Hash", placeholder: "abcdef1234567890", type: "text" },
    { key: "phone_number", label: "Номер телефона", placeholder: "+79991234567", type: "text" },
    { key: "admin_user_id", label: "Admin User ID", placeholder: "123456789 (необязательно)", type: "text" },
  ];

  return (
    <div
      data-testid="telegram-settings"
      className="border border-white/[0.06]"
      style={{ background: "#0A0A0A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Аккаунт Telegram
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            data-testid="tg-clear-btn"
            onClick={(e) => { e.stopPropagation(); handleClear(); }}
            className="text-neutral-600 hover:text-red-400 transition-colors"
            title="Очистить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
          <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
        </div>
      </div>

      {isOpen && <div className="p-4 space-y-3 border-t border-white/[0.06]">
        <p className="font-mono text-[10px] text-neutral-600 leading-relaxed">
          Получить API ID и Hash: my.telegram.org &rarr; API development tools
        </p>

        {fields.map((f) => (
          <div key={f.key} className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">
              {f.label}
            </label>
            <input
              data-testid={`tg-input-${f.key}`}
              type={f.type}
              value={creds[f.key] || ""}
              onChange={(e) => setCreds(prev => ({ ...prev, [f.key]: e.target.value }))}
              placeholder={f.placeholder}
              className="w-full font-mono text-xs px-3 py-2 bg-black/50 border border-white/[0.06]
                focus:border-[#00F0FF]/40 outline-none text-neutral-300 placeholder:text-neutral-700"
            />
          </div>
        ))}

        <button
          data-testid="tg-save-btn"
          onClick={handleSave}
          disabled={saving || !creds.api_id || !creds.api_hash}
          className="w-full py-2 text-xs font-bold uppercase tracking-widest
            bg-[#00F0FF] text-black hover:bg-white transition-colors
            disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>}
    </div>
  );
}
