import { useState, useEffect, useRef } from "react";
import axios from "axios";
import {
  Upload, Trash2, Save, Film, ImageIcon, FileText,
  FolderOpen, Loader2, Edit3, ChevronDown
} from "lucide-react";

const MEDIA_ICONS = { VIDEO: Film, IMAGE: ImageIcon, DOCUMENT: FileText, UNKNOWN: FileText };
const MEDIA_COLORS = { VIDEO: "#EC4899", IMAGE: "#00F0FF", DOCUMENT: "#F59E0B", UNKNOWN: "#525252" };

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export default function MediaManager({ apiUrl, onRefresh, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [templates, setTemplates] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [editingTag, setEditingTag] = useState(null);
  const [editDesc, setEditDesc] = useState("");
  const [savingRule, setSavingRule] = useState(false);
  const fileInputRef = useRef(null);

  const fetchTemplates = async () => {
    try {
      const res = await axios.get(`${apiUrl}/bot/media-templates`);
      setTemplates(res.data);
    } catch {}
  };

  useEffect(() => {
    fetchTemplates();
  }, [apiUrl]);

  const handleUpload = async (e) => {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      try {
        await axios.post(`${apiUrl}/bot/media/upload`, formData);
      } catch {}
    }
    setUploading(false);
    fetchTemplates();
    onRefresh?.();
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (tag) => {
    try {
      await axios.delete(`${apiUrl}/bot/media/${tag}`);
      fetchTemplates();
      onRefresh?.();
    } catch {}
  };

  const handleSaveRule = async (tag) => {
    setSavingRule(true);
    try {
      await axios.post(`${apiUrl}/bot/media/rules`, { tag, description: editDesc });
      setEditingTag(null);
      fetchTemplates();
    } catch {}
    setSavingRule(false);
  };

  return (
    <div
      data-testid="media-manager"
      className="border border-white/[0.06]"
      style={{ background: "#0A0A0A" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none hover:bg-white/[0.02] transition-colors"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          <FolderOpen className="h-4 w-4 text-[#00F0FF]" />
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-500">
            Медиа-менеджер
          </span>
          <span className="font-mono text-[10px] text-neutral-600">
            {templates.length} файлов
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-neutral-600 transition-transform duration-200 ${isOpen ? "rotate-0" : "-rotate-90"}`} />
      </div>

      {isOpen && <div className="p-4 space-y-3 border-t border-white/[0.06]">
        {/* Upload zone */}
        <div
          data-testid="media-upload-zone"
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-white/[0.1] p-4 text-center cursor-pointer
            hover:border-[#00F0FF]/30 transition-colors group"
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*,.pdf,.doc,.docx,.txt,.zip"
            onChange={handleUpload}
            className="hidden"
          />
          {uploading ? (
            <div className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 text-[#00F0FF] animate-spin" />
              <span className="font-mono text-xs text-neutral-500">Загрузка...</span>
            </div>
          ) : (
            <>
              <Upload className="h-5 w-5 mx-auto mb-2 text-neutral-600 group-hover:text-[#00F0FF] transition-colors" />
              <p className="font-mono text-xs text-neutral-500">
                Нажмите для загрузки файлов
              </p>
              <p className="font-mono text-[10px] text-neutral-700 mt-1">
                Видео, фото, документы
              </p>
            </>
          )}
        </div>

        {/* Files list */}
        {templates.length === 0 ? (
          <div data-testid="media-manager-empty" className="py-4 text-center">
            <p className="font-mono text-xs text-neutral-600">Нет загруженных файлов</p>
          </div>
        ) : (
          <div className="space-y-1">
            {templates.map((t) => {
              const Icon = MEDIA_ICONS[t.media_type] || FileText;
              const color = MEDIA_COLORS[t.media_type] || "#525252";
              const isEditing = editingTag === t.tag;

              return (
                <div
                  key={t.tag}
                  data-testid={`media-item-${t.tag}`}
                  className="border border-white/[0.04] hover:border-white/[0.08] transition-colors"
                >
                  <div className="flex items-center gap-3 px-3 py-2">
                    <Icon className="h-3.5 w-3.5 shrink-0" style={{ color }} />
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-neutral-300 truncate">
                        {t.filename}
                      </div>
                      <div className="font-mono text-[10px] text-neutral-600">
                        [SEND_{t.media_type}:{t.tag}] · {formatSize(t.size_bytes)}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        data-testid={`media-edit-${t.tag}`}
                        onClick={() => {
                          if (isEditing) {
                            setEditingTag(null);
                          } else {
                            setEditingTag(t.tag);
                            setEditDesc(t.description || "");
                          }
                        }}
                        className="p-1 text-neutral-600 hover:text-[#00F0FF] transition-colors"
                        title="Правила отправки"
                      >
                        <Edit3 className="h-3 w-3" />
                      </button>
                      <button
                        data-testid={`media-delete-${t.tag}`}
                        onClick={() => handleDelete(t.tag)}
                        className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
                        title="Удалить"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>

                  {/* Description / Rules */}
                  {!isEditing && t.description && (
                    <div className="px-3 pb-2">
                      <p className="font-mono text-[10px] text-amber-400/80 leading-relaxed">
                        Когда: {t.description}
                      </p>
                    </div>
                  )}

                  {isEditing && (
                    <div className="px-3 pb-3 space-y-2">
                      <label className="text-[10px] uppercase tracking-widest text-neutral-500">
                        Когда отправлять этот файл:
                      </label>
                      <textarea
                        data-testid={`media-rule-input-${t.tag}`}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder="Например: Когда пользователь спрашивает как настроить VPN на iOS"
                        rows={2}
                        className="w-full font-mono text-xs px-2 py-1.5 bg-black/50 border border-white/[0.06]
                          focus:border-amber-500/40 outline-none text-neutral-300 placeholder:text-neutral-700
                          resize-none leading-relaxed"
                      />
                      <button
                        data-testid={`media-rule-save-${t.tag}`}
                        onClick={() => handleSaveRule(t.tag)}
                        disabled={savingRule}
                        className="w-full py-1.5 text-[10px] font-bold uppercase tracking-widest
                          bg-amber-500 text-black hover:bg-amber-400 transition-colors
                          disabled:opacity-30 flex items-center justify-center gap-1"
                      >
                        {savingRule ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                        Сохранить правило
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>}
    </div>
  );
}