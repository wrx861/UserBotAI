import { Users, VolumeX, MessageSquare } from "lucide-react";

export default function ConversationsList({ conversations }) {
  return (
    <div
      data-testid="conversations-list"
      className="border border-white/[0.06]"
      style={{ background: "#0A0A0A" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Диалоги
          </span>
        </div>
        <span className="font-mono text-[10px] text-neutral-600">
          {conversations?.length ?? 0} чатов
        </span>
      </div>

      <div className="p-2 max-h-60 overflow-y-auto">
        {(!conversations || conversations.length === 0) ? (
          <div
            data-testid="conversations-empty"
            className="flex flex-col items-center justify-center py-8 text-neutral-600"
          >
            <Users className="h-6 w-6 mb-2 opacity-30" />
            <p className="font-mono text-xs">Диалогов пока нет</p>
          </div>
        ) : (
          conversations.map((c, i) => (
            <div
              key={c.chat_id}
              data-testid={`conversation-${i}`}
              className="flex items-center justify-between px-3 py-2 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2 min-w-0">
                {c.is_silenced ? (
                  <VolumeX className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                ) : (
                  <MessageSquare className="h-3.5 w-3.5 text-neutral-600 shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="font-mono text-xs text-neutral-300 truncate">
                    {c.username ? `@${c.username}` : `Чат ${c.chat_id.slice(-6)}`}
                  </div>
                  <div className="font-mono text-[10px] text-neutral-600">
                    {c.message_count} сообщ.
                    {c.is_silenced && <span className="text-amber-500 ml-1">ТИШИНА</span>}
                  </div>
                </div>
              </div>
              {c.last_message_at && (
                <span className="font-mono text-[10px] text-neutral-700 shrink-0">
                  {new Date(c.last_message_at).toLocaleTimeString("ru-RU", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
