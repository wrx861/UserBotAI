import { Film, ImageIcon, FileText, FolderOpen } from "lucide-react";

const MEDIA_ICONS = { VIDEO: Film, IMAGE: ImageIcon, DOCUMENT: FileText, UNKNOWN: FileText };
const MEDIA_COLORS = { VIDEO: "#EC4899", IMAGE: "#00F0FF", DOCUMENT: "#F59E0B", UNKNOWN: "#525252" };

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function MediaGallery({ templates }) {
  return (
    <div
      data-testid="media-gallery"
      className="border border-white/[0.06]"
      style={{ background: "#0A0A0A" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Медиа-шаблоны
          </span>
        </div>
        <span className="font-mono text-[10px] text-neutral-600">
          {templates?.length ?? 0} файлов
        </span>
      </div>

      <div className="p-3">
        {(!templates || templates.length === 0) ? (
          <div
            data-testid="media-empty"
            className="flex flex-col items-center justify-center py-8 text-neutral-600"
          >
            <FolderOpen className="h-6 w-6 mb-2 opacity-30" />
            <p className="font-mono text-xs">Нет медиа-файлов</p>
            <p className="font-mono text-[10px] text-neutral-700 mt-1">
              Добавьте файлы в папку /media
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {templates.map((t, i) => {
              const Icon = MEDIA_ICONS[t.media_type] || FileText;
              const color = MEDIA_COLORS[t.media_type] || "#525252";
              return (
                <div
                  key={t.tag + i}
                  data-testid={`media-template-${t.tag}`}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-white/[0.02] transition-colors"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs text-neutral-300 truncate">{t.filename}</div>
                    <div className="font-mono text-[10px] text-neutral-600">
                      [SEND_{t.media_type}:{t.tag}]
                    </div>
                  </div>
                  <span className="font-mono text-[10px] text-neutral-600 shrink-0">
                    {formatSize(t.size_bytes)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
