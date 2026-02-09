import {
  MessageSquare,
  Users,
  Image,
  Send,
  VolumeX,
  Clock,
} from "lucide-react";

const cards = [
  { id: "total-messages", label: "Сообщения", icon: MessageSquare, key: "total_messages", color: "#00F0FF" },
  { id: "active-chats", label: "Активные чаты", icon: Users, key: "active_chats", color: "#10B981" },
  { id: "images-analyzed", label: "Изображений", icon: Image, key: "total_images_analyzed", color: "#F59E0B" },
  { id: "media-sent", label: "Медиа отправлено", icon: Send, key: "total_media_sent", color: "#A78BFA" },
  { id: "silenced-chats", label: "Заглушено", icon: VolumeX, key: "silenced_chats", color: "#EF4444" },
];

export default function StatusCards({ status }) {
  return (
    <div className="space-y-3">
      <h2
        data-testid="stats-heading"
        className="text-xs font-medium uppercase tracking-widest text-neutral-500 px-1"
      >
        Статистика
      </h2>

      <div className="space-y-2">
        {cards.map((card, i) => {
          const Icon = card.icon;
          const value = status?.[card.key] ?? 0;
          return (
            <div
              key={card.id}
              data-testid={`stat-card-${card.id}`}
              className={`border border-white/[0.06] p-4 flex items-center justify-between
                hover:border-white/[0.12] transition-colors
                animate-fade-in stagger-${i + 1} opacity-0`}
              style={{ background: "#0A0A0A" }}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-4 w-4" style={{ color: card.color }} />
                <span className="text-xs uppercase tracking-wider text-neutral-400">
                  {card.label}
                </span>
              </div>
              <span className="font-mono text-lg tracking-tight" style={{ color: card.color }}>
                {value}
              </span>
            </div>
          );
        })}

        {status?.started_at && (
          <div
            data-testid="stat-card-uptime"
            className="border border-white/[0.06] p-4 flex items-center justify-between animate-fade-in stagger-6 opacity-0"
            style={{ background: "#0A0A0A" }}
          >
            <div className="flex items-center gap-3">
              <Clock className="h-4 w-4 text-neutral-500" />
              <span className="text-xs uppercase tracking-wider text-neutral-400">Запущен</span>
            </div>
            <span className="font-mono text-xs text-neutral-400">
              {new Date(status.started_at).toLocaleString("ru-RU")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
