import { useState } from "react";
import { Send, Loader2, Bot, User } from "lucide-react";

export default function TestChat({ onSend }) {
  const [message, setMessage] = useState("");
  const [chatId] = useState("test_" + Math.random().toString(36).slice(2, 8));
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (!message.trim() || loading) return;
    const userMsg = message.trim();
    setMessage("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const res = await onSend(chatId, userMsg);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: res.clean_text, media_tags: res.media_tags },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "error", text: "Не удалось получить ответ ИИ" },
      ]);
    }
    setLoading(false);
  };

  return (
    <div
      data-testid="test-chat"
      className="border border-white/[0.06] flex flex-col"
      style={{ background: "#0A0A0A" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Тест-чат
          </span>
        </div>
        <span className="font-mono text-[10px] text-neutral-600">{chatId}</span>
      </div>

      <div
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ minHeight: 200, maxHeight: 300 }}
      >
        {messages.length === 0 && (
          <div
            data-testid="test-chat-empty"
            className="flex flex-col items-center justify-center py-8 text-neutral-600"
          >
            <Bot className="h-6 w-6 mb-2 opacity-30" />
            <p className="font-mono text-xs">Отправьте сообщение для теста ИИ</p>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={i}
            data-testid={`chat-message-${i}`}
            className={`flex gap-2 ${m.role === "user" ? "justify-end" : ""}`}
          >
            {m.role !== "user" && (
              <Bot
                className="h-4 w-4 shrink-0 mt-0.5"
                style={{ color: m.role === "error" ? "#EF4444" : "#00F0FF" }}
              />
            )}
            <div
              className={`font-mono text-xs px-3 py-2 max-w-[80%] ${
                m.role === "user"
                  ? "bg-[#00F0FF]/10 text-[#00F0FF] border border-[#00F0FF]/20"
                  : m.role === "error"
                  ? "bg-red-500/10 text-red-400 border border-red-500/20"
                  : "bg-white/[0.03] text-neutral-300 border border-white/[0.06]"
              }`}
            >
              <p className="whitespace-pre-wrap break-words">{m.text}</p>
              {m.media_tags?.length > 0 && (
                <div className="mt-1 pt-1 border-t border-white/[0.06]">
                  {m.media_tags.map((t, j) => (
                    <span
                      key={j}
                      className="inline-block text-[10px] px-1.5 py-0.5 bg-purple-500/20 text-purple-300 mr-1"
                    >
                      {t.type}:{t.tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {m.role === "user" && (
              <User className="h-4 w-4 shrink-0 mt-0.5 text-[#00F0FF]" />
            )}
          </div>
        ))}

        {loading && (
          <div data-testid="chat-loading" className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 text-[#00F0FF] animate-spin" />
            <span className="font-mono text-xs text-neutral-500">ИИ думает...</span>
          </div>
        )}
      </div>

      <div className="border-t border-white/[0.06] p-3 flex gap-2">
        <input
          data-testid="test-chat-input"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Введите сообщение..."
          className="flex-1 font-mono text-xs px-3 py-2 bg-black/50 border border-white/[0.06]
            focus:border-[#00F0FF]/40 outline-none text-neutral-300 placeholder:text-neutral-700"
        />
        <button
          data-testid="test-chat-send-btn"
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className="px-3 py-2 bg-[#00F0FF] text-black hover:bg-white transition-colors
            disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
