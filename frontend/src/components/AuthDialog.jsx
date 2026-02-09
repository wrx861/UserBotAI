import { useState } from "react";
import axios from "axios";
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
      await axios.post(`${API}/bot/auth/send-code`, { phone_number: phoneNumber });
      setStep("code_sent");
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Ошибка отправки кода");
    }
    setLoading(false);
  };

  const verifyCode = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await axios.post(`${API}/bot/auth/verify-code`, { phone_number: phoneNumber, code });
      if (res.data.status === "2fa_required") {
        setStep("2fa");
      } else {
        setStep("success");
        setTimeout(() => onComplete?.(), 2000);
      }
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Неверный код");
    }
    setLoading(false);
  };

  const verify2FA = async () => {
    setLoading(true);
    setError("");
    try {
      await axios.post(`${API}/bot/auth/verify-2fa`, { password });
      setStep("success");
      setTimeout(() => onComplete?.(), 2000);
    } catch (e) {
      setError(e.response?.data?.detail || e.message || "Ошибка 2FA");
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
          <KeyRound className="h-4 w-4 text-amber-400" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Авторизация Telegram
          </span>
          {statusLabel && (
            <span className="text-[10px] font-mono text-neutral-600">{statusLabel}</span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
      </div>

      {isOpen && (
        <div className="p-4 space-y-4 border-t border-white/[0.06]">
          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 font-mono">
              {error}
            </div>
          )}

          {step === "success" ? (
            <div className="flex items-center gap-3 py-4 justify-center">
              <CheckCircle className="h-6 w-6 text-emerald-400" />
              <span className="text-sm text-emerald-400 font-mono">Авторизация успешна!</span>
            </div>
          ) : step === "2fa" ? (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400 font-mono">Введите пароль двухфакторной аутентификации:</p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Пароль 2FA"
                    className="w-full bg-neutral-900/50 border border-white/[0.06] text-white text-sm font-mono
                      placeholder:text-neutral-700 pl-10 pr-4 py-2.5 focus:outline-none focus:border-amber-500/40"
                    onKeyDown={(e) => e.key === "Enter" && verify2FA()}
                  />
                </div>
                <button
                  onClick={verify2FA}
                  disabled={loading || !password}
                  className="px-4 py-2.5 bg-amber-500 text-black text-xs font-bold uppercase
                    hover:bg-amber-400 disabled:opacity-30 flex items-center gap-1"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
                  Подтвердить
                </button>
              </div>
            </div>
          ) : step === "code_sent" ? (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400 font-mono">
                Код отправлен в Telegram на номер{" "}
                <span className="text-cyan-400">{phoneNumber}</span>
              </p>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Hash className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-600" />
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="12345"
                    maxLength={6}
                    className="w-full bg-neutral-900/50 border border-white/[0.06] text-white text-sm font-mono
                      placeholder:text-neutral-700 pl-10 pr-4 py-2.5 focus:outline-none focus:border-amber-500/40 tracking-[0.5em]"
                    onKeyDown={(e) => e.key === "Enter" && verifyCode()}
                  />
                </div>
                <button
                  onClick={verifyCode}
                  disabled={loading || code.length < 4}
                  className="px-4 py-2.5 bg-amber-500 text-black text-xs font-bold uppercase
                    hover:bg-amber-400 disabled:opacity-30 flex items-center gap-1"
                >
                  {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Проверить
                </button>
              </div>
              <button
                onClick={sendCode}
                disabled={loading}
                className="text-[10px] font-mono text-neutral-600 hover:text-neutral-400 flex items-center gap-1"
              >
                <RefreshCw className="h-3 w-3" />
                Отправить код повторно
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-neutral-400 font-mono">
                Отправим код авторизации на номер{" "}
                <span className="text-cyan-400">{phoneNumber || "не указан"}</span>
              </p>
              <button
                onClick={sendCode}
                disabled={loading || !phoneNumber}
                className="w-full py-2.5 bg-amber-500 text-black text-xs font-bold uppercase tracking-widest
                  hover:bg-amber-400 disabled:opacity-30 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                Отправить код
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
