import { useState } from "react";
import { KeyRound, Phone, Hash, Lock, Loader2, CheckCircle, RefreshCw, ChevronDown } from "lucide-react";

export default function AuthDialog({ phoneNumber, onComplete, initialStep = "idle", defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [step, setStep] = useState(initialStep);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

  const sendCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/bot/auth/send-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber }),
      });
      let data;
      try {
        data = await res.clone().json();
      } catch {
        const text = await res.text();
        throw new Error(text || `Ошибка сервера (${res.status})`);
      }
      if (!res.ok) throw new Error(data.detail || "Ошибка отправки кода");
      setStep("code_sent");
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/bot/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone_number: phoneNumber, code }),
      });
      let data;
      try {
        data = await res.clone().json();
      } catch {
        const text = await res.text();
        throw new Error(text || `Ошибка сервера (${res.status})`);
      }
      if (!res.ok) throw new Error(data.detail || "Неверный код");
      if (data.status === "2fa_required") {
        setStep("2fa");
      } else {
        setStep("success");
        setTimeout(() => onComplete?.(), 2000);
      }
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const verify2FA = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API}/bot/auth/verify-2fa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      let data;
      try {
        data = await res.clone().json();
      } catch {
        const text = await res.text();
        throw new Error(text || `Ошибка сервера (${res.status})`);
      }
      if (!res.ok) throw new Error(data.detail || "Неверный пароль");
      setStep("success");
      setTimeout(() => onComplete?.(), 2000);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  const statusLabel = step === "success" ? "✓" : step === "code_sent" ? "ожидание кода" : step === "2fa" ? "2FA" : "";

  return (
    <div
      data-testid="auth-dialog"
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
            Авторизация Telegram
          </span>
          {statusLabel && (
            <span className="text-[10px] font-mono text-emerald-500">{statusLabel}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
      </div>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-white/[0.06]">
          {step === "success" ? (
            <div
              data-testid="auth-success"
              className="flex flex-col items-center py-6 gap-3"
            >
              <CheckCircle className="h-8 w-8 text-emerald-500" />
              <p className="font-mono text-sm text-emerald-400">Авторизация успешна!</p>
              <p className="font-mono text-xs text-neutral-500">Бот запускается...</p>
            </div>
          ) : step === "idle" || step === "sending" ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs uppercase tracking-wider text-neutral-400">
                    Номер телефона
                  </span>
                </div>
                <div
                  data-testid="auth-phone-display"
                  className="font-mono text-sm px-3 py-2.5 border border-white/[0.06] text-[#00F0FF]"
                  style={{ background: "rgba(0,0,0,0.4)" }}
                >
                  {phoneNumber || "Не указан — заполните в настройках Telegram"}
                </div>
              </div>
              <p className="font-mono text-xs text-neutral-500">
                Код подтверждения будет отправлен в Telegram на этот номер.
              </p>
              <button
                data-testid="auth-send-code-btn"
                onClick={sendCode}
                disabled={loading || !phoneNumber}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-widest
                  bg-[#00F0FF] text-black hover:bg-white transition-colors
                  disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Отправить код"
                )}
              </button>
            </>
          ) : step === "code_sent" || step === "verifying" ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Hash className="h-3.5 w-3.5 text-neutral-500" />
                  <span className="text-xs uppercase tracking-wider text-neutral-400">
                    Код из Telegram
                  </span>
                </div>
                <input
                  data-testid="auth-code-input"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                  placeholder="12345"
                  className="w-full font-mono text-lg px-3 py-2.5 bg-black/50 border border-white/[0.06]
                    focus:border-[#00F0FF]/40 outline-none text-center text-[#00F0FF]
                    placeholder:text-neutral-700 tracking-[0.5em]"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <p className="font-mono text-xs text-neutral-500">
                Введите код, который пришёл в Telegram.
              </p>
              <div className="flex gap-2">
                <button
                  data-testid="auth-verify-code-btn"
                  onClick={verifyCode}
                  disabled={loading || code.length < 4}
                  className="flex-1 py-2.5 text-xs font-bold uppercase tracking-widest
                    bg-[#00F0FF] text-black hover:bg-white transition-colors
                    disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Подтвердить"
                  )}
                </button>
                <button
                  data-testid="auth-resend-btn"
                  onClick={() => { setCode(""); setError(""); sendCode(); }}
                  disabled={loading}
                  className="px-3 py-2.5 text-xs font-mono uppercase tracking-widest
                    border border-white/[0.06] text-neutral-500 hover:text-[#00F0FF]
                    hover:border-[#00F0FF]/30 transition-colors disabled:opacity-50"
                  title="Отправить код повторно"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </>
          ) : step === "2fa" ? (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className="h-3.5 w-3.5 text-amber-500" />
                  <span className="text-xs uppercase tracking-wider text-neutral-400">
                    Двухфакторная аутентификация
                  </span>
                </div>
                <input
                  data-testid="auth-2fa-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && verify2FA()}
                  placeholder="Пароль 2FA"
                  className="w-full font-mono text-sm px-3 py-2.5 bg-black/50 border border-white/[0.06]
                    focus:border-amber-500/40 outline-none text-amber-400
                    placeholder:text-neutral-700"
                  autoFocus
                />
              </div>
              <button
                data-testid="auth-verify-2fa-btn"
                onClick={verify2FA}
                disabled={loading || !password}
                className="w-full py-2.5 text-xs font-bold uppercase tracking-widest
                  bg-amber-500 text-black hover:bg-amber-400 transition-colors
                  disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Войти"
                )}
              </button>
            </>
          ) : null}

          {error && (
            <div
              data-testid="auth-error"
              className="font-mono text-xs text-red-400 px-3 py-2 border border-red-500/20 bg-red-500/5"
            >
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
