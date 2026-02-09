import { useState, useEffect, useCallback, useRef } from "react";
import { Mic, Volume2, Loader2, CheckCircle, Key, Eye, EyeOff, AlertCircle, Save, ChevronDown, Play, Square, User } from "lucide-react";

// Label translations to Russian
const LABEL_RU = {
  // Gender
  "male": "Мужской",
  "female": "Женский",
  "non-binary": "Небинарный",
  // Age
  "young": "Молодой",
  "middle aged": "Средний возраст",
  "middle-aged": "Средний возраст",
  "middle_aged": "Средний возраст",
  "old": "Пожилой",
  "young adult": "Молодой взрослый",
  // Accent
  "american": "Американский",
  "british": "Британский",
  "australian": "Австралийский",
  "irish": "Ирландский",
  "indian": "Индийский",
  "african": "Африканский",
  "swedish": "Шведский",
  "italian": "Итальянский",
  "german": "Немецкий",
  "french": "Французский",
  "spanish": "Испанский",
  "portuguese": "Португальский",
  "russian": "Русский",
  "chinese": "Китайский",
  "japanese": "Японский",
  "korean": "Корейский",
  "arabic": "Арабский",
  "turkish": "Турецкий",
  "polish": "Польский",
  "dutch": "Голландский",
  "latin": "Латинский",
  "english": "Английский",
  "transatlantic": "Трансатлантический",
  "scandinavian": "Скандинавский",
  "south_african": "Южноафриканский",
  "middle_eastern": "Ближневосточный",
  // Use case
  "narration": "Повествование",
  "narrator": "Рассказчик",
  "narrative": "Повествование",
  "narrative_story": "Рассказчик историй",
  "news": "Новости",
  "newscast": "Новостной",
  "conversational": "Разговорный",
  "conversation": "Разговорный",
  "calm": "Спокойный",
  "characters_animation": "Персонажи/Анимация",
  "animation": "Анимация",
  "characters": "Персонажи",
  "meditation": "Медитация",
  "audiobook": "Аудиокниги",
  "social media": "Соцсети",
  "social_media": "Соцсети",
  "gaming": "Игры",
  "education": "Образование",
  "podcast": "Подкасты",
  "informative": "Информативный",
  "interactive": "Интерактивный",
  "entertainment": "Развлечение",
  "entertainment_tv": "ТВ/Развлечения",
  "asmr": "АСМР",
  "children_stories": "Детские истории",
  "fitness": "Фитнес",
  "assistance": "Ассистент",
  "advertisement": "Реклама",
  "tutorial": "Обучение",
  // Descriptive
  "raspy": "Хриплый",
  "deep": "Глубокий",
  "warm": "Тёплый",
  "soft": "Мягкий",
  "strong": "Сильный",
  "friendly": "Дружелюбный",
  "confident": "Уверенный",
  "ground": "Основательный",
  "gruff": "Грубоватый",
  "authoritative": "Авторитетный",
  "casual": "Непринуждённый",
  "orotund": "Звучный",
  "witty": "Остроумный",
  "pleasant": "Приятный",
  "overhyped": "Восторженный",
  "intense": "Интенсивный",
  "seductive": "Соблазнительный",
  "thick": "Насыщенный",
  "thin": "Тонкий",
  "whispery": "Шёпотный",
  "well-rounded": "Сбалансированный",
  "crisp": "Чёткий",
  "childish": "Детский",
  "husky": "Хрипловатый",
  "anxious": "Тревожный",
  "emotional": "Эмоциональный",
  "expressive": "Выразительный",
  "clear": "Чистый",
  "gentle": "Нежный",
  "professional": "Профессиональный",
  "mature": "Зрелый",
  "classy": "Элегантный",
  "sassy": "Дерзкий",
  "hyped": "Энергичный",
  "bright": "Яркий",
  "lively": "Живой",
  "smooth": "Гладкий",
  "rich": "Насыщенный",
  "resonant": "Звучный",
  "playful": "Игривый",
  "sultry": "Томный",
  "mysterious": "Загадочный",
  "serious": "Серьёзный",
  "bold": "Смелый",
  "dynamic": "Динамичный",
  "gravelly": "Грубоватый",
  // Categories
  "premade": "Встроенный",
  "cloned": "Клонированный",
  "generated": "Сгенерированный",
  "high_quality": "Высокое качество",
  "general": "Общий",
};

function translateLabel(label) {
  if (!label) return "";
  const lower = label.toLowerCase().trim();
  return LABEL_RU[lower] || label;
}

function buildVoiceDescription(voice) {
  const parts = [];
  const labels = voice.labels || {};

  // Gender
  if (labels.gender) parts.push(translateLabel(labels.gender));
  // Age
  if (labels.age) parts.push(translateLabel(labels.age));
  // Descriptive (e.g. "classy", "sassy", "professional")
  if (labels.descriptive) parts.push(translateLabel(labels.descriptive));
  // Accent
  if (labels.accent) parts.push("акцент: " + translateLabel(labels.accent));
  // Use case
  if (labels.use_case) parts.push(translateLabel(labels.use_case));
  // Description label (sometimes a separate field)
  if (labels.description && labels.description !== labels.descriptive) {
    parts.push(translateLabel(labels.description));
  }

  return parts.join(" · ");
}


function VoicePreviewButton({ previewUrl, voiceName, voiceId, apiUrl }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = (e) => {
    e.stopPropagation();
    if (!voiceId) return;

    if (playing) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      setPlaying(false);
      return;
    }

    setLoading(true);

    // Use Russian preview from backend (cached TTS)
    const ruPreviewUrl = `${apiUrl}/bot/voice/preview/${voiceId}`;
    const audio = new Audio(ruPreviewUrl);
    audioRef.current = audio;

    audio.oncanplaythrough = () => {
      setLoading(false);
      setPlaying(true);
      audio.play();
    };

    audio.onended = () => {
      setPlaying(false);
    };

    audio.onerror = () => {
      // Fallback to English preview if Russian generation fails
      if (previewUrl) {
        const fallback = new Audio(previewUrl);
        audioRef.current = fallback;
        fallback.oncanplaythrough = () => {
          setLoading(false);
          setPlaying(true);
          fallback.play();
        };
        fallback.onended = () => setPlaying(false);
        fallback.onerror = () => { setLoading(false); setPlaying(false); };
        fallback.load();
      } else {
        setLoading(false);
        setPlaying(false);
      }
    };

    audio.load();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  return (
    <button
      onClick={handleToggle}
      title={playing ? "Стоп" : `Прослушать ${voiceName}`}
      className={`shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-all duration-200 ${
        playing
          ? "bg-purple-500/30 text-purple-300 ring-1 ring-purple-500/50"
          : "bg-white/[0.04] text-neutral-500 hover:bg-purple-500/20 hover:text-purple-400"
      }`}
    >
      {loading ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : playing ? (
        <Square className="h-2.5 w-2.5 fill-current" />
      ) : (
        <Play className="h-3 w-3 ml-0.5 fill-current" />
      )}
    </button>
  );
}


export default function VoiceSettings({ apiUrl, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Form state
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [voiceMode, setVoiceMode] = useState("voice_only");
  const [selectedVoice, setSelectedVoice] = useState("pNInz6obpgDQGcFmaJgB");
  const [ttsModel, setTtsModel] = useState("eleven_multilingual_v2");
  const [sttModel, setSttModel] = useState("scribe_v2");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [language, setLanguage] = useState("ru");

  const fetchSettings = useCallback(() => {
    fetch(`${apiUrl}/bot/settings/voice`)
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
        setVoiceEnabled(data.voice_enabled || false);
        setVoiceMode(data.voice_mode || "voice_only");
        setSelectedVoice(data.voice_id || "pNInz6obpgDQGcFmaJgB");
        setTtsModel(data.tts_model || "eleven_multilingual_v2");
        setSttModel(data.stt_model || "scribe_v2");
        setLanguage(data.language || "ru");
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [apiUrl]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (includeKey = false) => {
    setSaving(true);
    setSaved(false);
    try {
      const body = {
        voice_enabled: voiceEnabled,
        voice_mode: voiceMode,
        voice_id: selectedVoice,
        tts_model: ttsModel,
        stt_model: sttModel,
        language: language,
      };
      if (includeKey && apiKey) {
        body.elevenlabs_api_key = apiKey;
      }
      await fetch(`${apiUrl}/bot/settings/voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setSaved(true);
      if (includeKey) {
        setApiKey("");
        fetchSettings(); // Refresh to get new voices list
      }
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Error saving voice settings:", e);
    }
    setSaving(false);
  };

  // Auto-save on toggle/model change (not key)
  useEffect(() => {
    if (!loading && settings) {
      handleSave(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceEnabled, voiceMode, selectedVoice, ttsModel, sttModel, language]);

  if (loading) {
    return (
      <div className="border border-white/[0.06] p-4" style={{ background: "#0A0A0A" }}>
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
          <span className="text-xs text-neutral-500">Загрузка...</span>
        </div>
      </div>
    );
  }

  return (
    <div data-testid="voice-settings" className="border border-white/[0.06]" style={{ background: "#0A0A0A" }}>
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-purple-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Голосовые сообщения
          </span>
        </div>
        <div className="flex items-center gap-2">
          {settings?.has_api_key && (
            <div className="flex items-center gap-1">
              <CheckCircle className="h-3 w-3 text-emerald-500" />
              <span className="text-[10px] text-emerald-500 font-mono">ElevenLabs</span>
            </div>
          )}
          <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
        </div>
      </div>

      {isOpen && <div className="p-4 space-y-4 border-t border-white/[0.06]">
        {/* API Key section */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Key className="h-3.5 w-3.5 text-neutral-500" />
            <span className="text-[10px] uppercase tracking-widest text-neutral-400">
              ElevenLabs API ключ
            </span>
            {settings?.has_api_key && (
              <span className="text-[10px] font-mono text-neutral-600">
                ({settings.api_key_source === "env" ? "из .env" : "сохранён"}: {settings.api_key_masked})
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                data-testid="elevenlabs-api-key"
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.has_api_key ? "Новый ключ (необязательно)" : "sk_..."}
                className="w-full font-mono text-xs px-3 py-2 bg-black/50 border border-white/[0.06]
                  focus:border-purple-500/40 outline-none text-neutral-300 placeholder:text-neutral-700 pr-8"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-400"
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            {apiKey && (
              <button
                onClick={() => handleSave(true)}
                disabled={saving}
                className="px-3 py-2 text-xs font-bold uppercase tracking-widest
                  bg-purple-500 text-black hover:bg-purple-400 transition-colors
                  disabled:opacity-50 flex items-center gap-1"
              >
                <Save className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="font-mono text-[9px] text-neutral-600">
            Получить: elevenlabs.io → Developers → API Keys
          </p>
        </div>

        {!settings?.has_api_key && (
          <div className="flex items-center gap-2 px-3 py-2 border border-amber-500/20 bg-amber-500/5">
            <AlertCircle className="h-3 w-3 text-amber-400 shrink-0" />
            <span className="font-mono text-[10px] text-amber-400">
              Добавьте API ключ для работы голосовых
            </span>
          </div>
        )}

        {/* Voice reply mode */}
        <div className="space-y-2">
          <span className="text-[10px] uppercase tracking-widest text-neutral-500">
            Режим голосовых ответов
          </span>
          <div className="flex gap-1.5">
            <button
              data-testid="voice-mode-off"
              onClick={() => { setVoiceEnabled(false); setVoiceMode("off"); }}
              className={`flex-1 px-2 py-2 font-mono text-[10px] border transition-colors text-center ${
                !voiceEnabled
                  ? "border-neutral-500/50 bg-neutral-500/10 text-neutral-300"
                  : "border-white/[0.04] text-neutral-600 hover:text-neutral-400 hover:border-white/[0.08]"
              }`}
            >
              Выкл
            </button>
            <button
              data-testid="voice-mode-voice-only"
              onClick={() => { setVoiceEnabled(true); setVoiceMode("voice_only"); }}
              className={`flex-1 px-2 py-2 font-mono text-[10px] border transition-colors text-center ${
                voiceEnabled && voiceMode === "voice_only"
                  ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                  : "border-white/[0.04] text-neutral-600 hover:text-neutral-400 hover:border-white/[0.08]"
              }`}
            >
              Только на голосовые
            </button>
            <button
              data-testid="voice-mode-always"
              onClick={() => { setVoiceEnabled(true); setVoiceMode("always"); }}
              className={`flex-1 px-2 py-2 font-mono text-[10px] border transition-colors text-center ${
                voiceEnabled && voiceMode === "always"
                  ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                  : "border-white/[0.04] text-neutral-600 hover:text-neutral-400 hover:border-white/[0.08]"
              }`}
            >
              Всегда голосом
            </button>
          </div>
          <p className="font-mono text-[9px] text-neutral-600 px-1">
            {!voiceEnabled && "Бот отвечает только текстом"}
            {voiceEnabled && voiceMode === "voice_only" && "Голосовой ответ только когда пользователь отправляет голосовое"}
            {voiceEnabled && voiceMode === "always" && "Бот всегда отвечает голосовым сообщением"}
          </p>
        </div>

        {/* Language selection */}
        {settings?.languages?.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">
              Язык озвучки
            </span>
            <div className="flex gap-1.5">
              {settings.languages.map((lang) => (
                <button
                  key={lang.code}
                  onClick={() => setLanguage(lang.code)}
                  className={`flex-1 px-2 py-1.5 font-mono text-[10px] border transition-colors ${
                    language === lang.code
                      ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                      : "border-white/[0.04] text-neutral-500 hover:text-neutral-300 hover:border-white/[0.08]"
                  }`}
                >
                  {lang.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* TTS Model Selection */}
        {settings?.tts_models?.length > 0 && (
          <div className="space-y-2">
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">
              Модель озвучки (TTS)
            </span>
            <div className="space-y-1">
              {settings.tts_models.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setTtsModel(m.id)}
                  className={`w-full px-3 py-2 text-left font-mono text-[10px] border transition-colors ${
                    ttsModel === m.id
                      ? "border-purple-500/50 bg-purple-500/10 text-purple-400"
                      : "border-white/[0.04] text-neutral-500 hover:text-neutral-300 hover:border-white/[0.08]"
                  }`}
                >
                  <div className="flex justify-between items-center">
                    <span>{m.name}</span>
                    <span className="text-neutral-600">{m.languages} языков</span>
                  </div>
                  <div className="text-neutral-600 mt-0.5">{m.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice selection with preview */}
        {settings?.voices?.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Volume2 className="h-3 w-3 text-purple-400" />
              <span className="text-[10px] uppercase tracking-widest text-neutral-500">
                Голос AI ({settings.voices.length} доступно)
              </span>
            </div>
            <div className="space-y-1 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {settings.voices.map((voice) => {
                const isSelected = selectedVoice === voice.voice_id;
                const description = buildVoiceDescription(voice);
                return (
                  <div
                    key={voice.voice_id}
                    onClick={() => setSelectedVoice(voice.voice_id)}
                    className={`flex items-center gap-2.5 px-3 py-2 border cursor-pointer transition-all duration-150 group ${
                      isSelected
                        ? "border-purple-500/50 bg-purple-500/10"
                        : "border-white/[0.04] hover:border-white/[0.08] hover:bg-white/[0.02]"
                    }`}
                  >
                    {/* Play button */}
                    <VoicePreviewButton
                      previewUrl={voice.preview_url}
                      voiceName={voice.name}
                      voiceId={voice.voice_id}
                      apiUrl={apiUrl}
                    />

                    {/* Voice info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`font-mono text-[11px] font-medium truncate ${
                          isSelected ? "text-purple-300" : "text-neutral-300"
                        }`}>
                          {voice.name}
                        </span>
                        {isSelected && (
                          <CheckCircle className="h-3 w-3 text-purple-400 shrink-0" />
                        )}
                      </div>
                      {description && (
                        <div className={`font-mono text-[9px] mt-0.5 truncate ${
                          isSelected ? "text-purple-500/70" : "text-neutral-600"
                        }`}>
                          {description}
                        </div>
                      )}
                    </div>

                    {/* Category badge */}
                    {voice.category && voice.category !== "unknown" && (
                      <span className={`shrink-0 font-mono text-[8px] px-1.5 py-0.5 border ${
                        isSelected
                          ? "border-purple-500/30 text-purple-500/70"
                          : "border-white/[0.04] text-neutral-700"
                      }`}>
                        {translateLabel(voice.category)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="font-mono text-[9px] text-neutral-600 px-1">
              Нажмите ▶ для прослушивания голоса
            </p>
          </div>
        )}

        {/* STT Model */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Mic className="h-3 w-3 text-[#00F0FF]" />
            <span className="text-[10px] uppercase tracking-widest text-neutral-500">
              Распознавание голоса (STT) — всегда вкл
            </span>
          </div>
          <div className="flex gap-1.5">
            {settings?.stt_models?.map((m) => (
              <button
                key={m.id}
                onClick={() => setSttModel(m.id)}
                className={`flex-1 px-2 py-1.5 font-mono text-[10px] border transition-colors ${
                  sttModel === m.id
                    ? "border-[#00F0FF]/40 bg-[#00F0FF]/10 text-[#00F0FF]"
                    : "border-white/[0.04] text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        </div>

        {/* Save indicator */}
        {(saving || saved) && (
          <div className="flex items-center gap-2 text-[10px] font-mono">
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin text-neutral-600" />
                <span className="text-neutral-600">Сохранение...</span>
              </>
            ) : (
              <>
                <CheckCircle className="h-3 w-3 text-emerald-500" />
                <span className="text-emerald-500">Сохранено</span>
              </>
            )}
          </div>
        )}
      </div>}
    </div>
  );
}
