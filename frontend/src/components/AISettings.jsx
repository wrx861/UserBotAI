import { useState, useEffect } from "react";
import axios from "axios";
import { Brain, Save, Loader2, Key, ChevronDown } from "lucide-react";

export default function AISettings({ apiUrl, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [settings, setSettings] = useState(null);
  const [providers, setProviders] = useState([]);
  const [saving, setSaving] = useState(false);
  const [localProvider, setLocalProvider] = useState("");
  const [localModel, setLocalModel] = useState("");
  const [apiKeys, setApiKeys] = useState({});
  const [showKeys, setShowKeys] = useState({});

  useEffect(() => {
    axios.get(`${apiUrl}/bot/settings/ai`)
      .then((res) => {
        const data = res.data;
        setSettings(data);
        setLocalProvider(data.provider);
        setLocalModel(data.model);
        setApiKeys(data.api_keys || {});
        setProviders(data.providers_list || []);
      })
      .catch(() => {});
  }, [apiUrl]);

  const currentProviderInfo = providers.find((p) => p.id === localProvider);
  const needsKey = currentProviderInfo?.needs_key;
  const keyField = localProvider === "groq" ? "groq" : localProvider === "openai" ? "openai" : localProvider === "gemini" ? "gemini" : null;

  const handleProviderChange = (pid) => {
    setLocalProvider(pid);
    const prov = providers.find((p) => p.id === pid);
    if (prov) {
      setLocalModel(prov.default_model);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const keysToSend = {};
      if (keyField && apiKeys[keyField] && !apiKeys[keyField].startsWith("***")) {
        keysToSend[keyField] = apiKeys[keyField];
      }
      await axios.post(`${apiUrl}/bot/settings/ai`, {
        provider: localProvider,
        model: localModel,
        api_keys: Object.keys(keysToSend).length ? keysToSend : null,
      });
    } catch {}
    setSaving(false);
  };

  if (!settings) return null;

  const providerGroups = [
    { label: "Провайдеры", ids: ["gemini", "openai", "groq"] },
  ];

  return (
    <div
      data-testid="ai-settings"
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
            AI Провайдер и Модель
          </span>
          {settings && (
            <span className="text-[10px] font-mono text-neutral-600">
              {settings.provider}/{settings.model}
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
      </div>

      {isOpen && <div className="p-4 space-y-4 border-t border-white/[0.06]">
        {/* Provider Selection */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-neutral-500">
            Провайдер
          </label>
          {providerGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="text-[10px] font-mono text-neutral-600 mt-2">{group.label}</p>
              <div className="grid grid-cols-1 gap-1">
                {group.ids.map((pid) => {
                  const prov = providers.find((p) => p.id === pid);
                  if (!prov) return null;
                  const isSelected = localProvider === pid;
                  return (
                    <button
                      key={pid}
                      data-testid={`provider-btn-${pid}`}
                      onClick={() => handleProviderChange(pid)}
                      className={`text-left px-3 py-2 font-mono text-xs border transition-colors ${
                        isSelected
                          ? "border-purple-500/50 bg-purple-500/10 text-purple-300"
                          : "border-white/[0.06] text-neutral-400 hover:border-white/[0.12] hover:text-neutral-300"
                      }`}
                    >
                      {prov.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Model Selection */}
        {currentProviderInfo && (
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-widest text-neutral-500">
              Модель
            </label>
            <div className="relative">
              <select
                data-testid="model-select"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                className="w-full font-mono text-xs px-3 py-2 bg-black/50 border border-white/[0.06]
                  focus:border-purple-500/40 outline-none text-neutral-300 appearance-none cursor-pointer"
              >
                {currentProviderInfo.models.map((m) => {
                  const modelId = typeof m === "string" ? m : m.id;
                  const modelLabel = typeof m === "string" ? m : m.label || m.id;
                  const modelVision = typeof m === "object" && m.vision;
                  const modelCtx = typeof m === "object" ? m.ctx : "";
                  return (
                    <option key={modelId} value={modelId} className="bg-black text-neutral-300">
                      {modelLabel}{modelVision ? " 👁" : ""}{modelCtx ? ` [${modelCtx}]` : ""}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-600 pointer-events-none" />
            </div>
            <p className="text-[9px] font-mono text-neutral-600 mt-1">
              👁 = видит скриншоты &nbsp;|&nbsp; [1M] = размер контекста
            </p>
          </div>
        )}

        {/* API Key Input */}
        {needsKey && keyField && (
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-1">
                <Key className="h-3 w-3" />
                API Ключ ({keyField})
              </label>
              <button
                onClick={() => setShowKeys((prev) => ({ ...prev, [keyField]: !prev[keyField] }))}
                className="text-[10px] font-mono text-neutral-600 hover:text-neutral-400"
              >
                {showKeys[keyField] ? "Скрыть" : "Показать"}
              </button>
            </div>
            <input
              data-testid={`api-key-input-${keyField}`}
              type={showKeys[keyField] ? "text" : "password"}
              value={apiKeys[keyField] || ""}
              onChange={(e) => setApiKeys((prev) => ({ ...prev, [keyField]: e.target.value }))}
              placeholder={
                keyField === "openai" ? "sk-..." :
                keyField === "gemini" ? "AIza..." :
                keyField === "groq" ? "gsk_..." : "Введите ключ"
              }
              className="w-full font-mono text-xs px-3 py-2 bg-black/50 border border-white/[0.06]
                focus:border-purple-500/40 outline-none text-neutral-300 placeholder:text-neutral-700"
            />
            <p className="font-mono text-[10px] text-neutral-700">
              {keyField === "openai" && "Получить: platform.openai.com/api-keys"}
              {keyField === "gemini" && "Получить: aistudio.google.com/apikey"}
              {keyField === "groq" && "Получить: console.groq.com/keys"}
            </p>
          </div>
        )}

        {/* Current status */}
        <div className="flex items-center gap-2 px-2 py-1.5 border border-white/[0.04]">
          <div className="h-1.5 w-1.5 rounded-full bg-purple-400" />
          <span className="font-mono text-[10px] text-neutral-500">
            Текущий: {settings.provider} / {settings.model}
          </span>
        </div>

        {/* Save */}
        <button
          data-testid="ai-settings-save-btn"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-2 text-xs font-bold uppercase tracking-widest
            bg-purple-500 text-white hover:bg-purple-400 transition-colors
            disabled:opacity-30 flex items-center justify-center gap-2"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          {saving ? "Сохранение..." : "Сохранить AI настройки"}
        </button>
      </div>}
    </div>
  );
}
