import classNames from "classnames";
import Container from "components/services/widget/container";
import { useTranslation } from "next-i18next";
import { useCallback, useState } from "react";
import { FiCheck, FiEdit2, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import useSWR, { mutate } from "swr";

const fetcher = (url) => fetch(url).then((res) => res.json());

export default function Component({ service }) {
  const { t } = useTranslation();
  const { widget } = service;

  const { data, error, isLoading } = useSWR("/api/memo", fetcher, {
    refreshInterval: 30000, // 每 30 秒刷新
  });

  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState("");
  const [newNote, setNewNote] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  const maxNotes = widget?.maxNotes || 10;
  const showTimestamp = widget?.showTimestamp !== false;

  const handleAdd = useCallback(async () => {
    if (!newNote.trim()) return;

    await fetch("/api/memo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: newNote.trim() }),
    });

    setNewNote("");
    setIsAdding(false);
    mutate("/api/memo");
  }, [newNote]);

  const handleUpdate = useCallback(
    async (id) => {
      if (!editText.trim()) return;

      await fetch("/api/memo", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, content: editText.trim() }),
      });

      setEditingId(null);
      setEditText("");
      mutate("/api/memo");
    },
    [editText],
  );

  const handleDelete = useCallback(async (id) => {
    await fetch("/api/memo", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });

    mutate("/api/memo");
  }, []);

  const startEdit = useCallback((note) => {
    setEditingId(note.id);
    setEditText(note.content);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditText("");
  }, []);

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    // 小于 24 小时显示 "几小时前"
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      if (hours < 1) {
        const mins = Math.floor(diff / 60000);
        return mins < 1 ? t("memo.justNow") : t("memo.minutesAgo", { count: mins });
      }
      return t("memo.hoursAgo", { count: hours });
    }

    // 否则显示日期
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  if (error) return <Container service={service} error={error} />;

  const notes = data?.notes?.slice(0, maxNotes) || [];

  return (
    <Container service={service}>
      <div className="flex-1 min-w-0 max-w-full p-3">
        {/* 添加按钮 */}
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="w-full mb-3 py-2 px-3 rounded-lg border-2 border-dashed border-theme-500/30 hover:border-theme-500/60 
                       text-theme-500/60 hover:text-theme-500 transition-all duration-200 flex items-center justify-center gap-2
                       bg-theme-200/10 dark:bg-theme-900/10 hover:bg-theme-200/20 dark:hover:bg-theme-900/20"
          >
            <FiPlus className="w-4 h-4" />
            <span className="text-sm font-medium">{t("memo.addNote")}</span>
          </button>
        )}

        {/* 添加表单 */}
        {isAdding && (
          <div className="mb-3 p-3 rounded-lg bg-theme-200/30 dark:bg-theme-900/30 border border-theme-500/20">
            <textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder={t("memo.placeholder")}
              className="w-full bg-transparent text-theme-900 dark:text-theme-100 text-sm resize-none 
                         placeholder:text-theme-500/50 focus:outline-none min-h-[60px]"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.metaKey) handleAdd();
                if (e.key === "Escape") {
                  setIsAdding(false);
                  setNewNote("");
                }
              }}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                type="button"
                onClick={() => {
                  setIsAdding(false);
                  setNewNote("");
                }}
                className="p-1.5 rounded hover:bg-theme-500/10 text-theme-500/60 hover:text-theme-500 transition-colors"
              >
                <FiX className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleAdd}
                disabled={!newNote.trim()}
                className="p-1.5 rounded bg-theme-500/20 hover:bg-theme-500/30 text-theme-700 dark:text-theme-300 
                           disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <FiCheck className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* 笔记列表 */}
        <div className="space-y-2">
          {isLoading && notes.length === 0 && (
            <div className="text-center text-theme-500/50 text-sm py-4">{t("memo.loading")}</div>
          )}

          {!isLoading && notes.length === 0 && (
            <div className="text-center text-theme-500/50 text-sm py-4">{t("memo.empty")}</div>
          )}

          {notes.map((note) => (
            <div
              key={note.id}
              className={classNames(
                "group relative p-3 rounded-lg transition-all duration-200",
                "bg-theme-200/20 dark:bg-theme-900/20 hover:bg-theme-200/30 dark:hover:bg-theme-900/30",
                "border border-transparent hover:border-theme-500/10",
              )}
            >
              {editingId === note.id ? (
                // 编辑模式
                <div>
                  <textarea
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="w-full bg-transparent text-theme-900 dark:text-theme-100 text-sm resize-none 
                               focus:outline-none min-h-[40px]"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && e.metaKey) handleUpdate(note.id);
                      if (e.key === "Escape") cancelEdit();
                    }}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="p-1.5 rounded hover:bg-theme-500/10 text-theme-500/60 hover:text-theme-500 transition-colors"
                    >
                      <FiX className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdate(note.id)}
                      disabled={!editText.trim()}
                      className="p-1.5 rounded bg-theme-500/20 hover:bg-theme-500/30 text-theme-700 dark:text-theme-300 
                                 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <FiCheck className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                // 展示模式
                <>
                  <p className="text-sm text-theme-900 dark:text-theme-100 whitespace-pre-wrap break-words pr-14">
                    {note.content}
                  </p>
                  {showTimestamp && (
                    <span className="text-[10px] text-theme-500/50 mt-1 block">{formatTime(note.createdAt)}</span>
                  )}

                  {/* 操作按钮 */}
                  <div
                    className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 
                                  transition-opacity duration-200"
                  >
                    <button
                      type="button"
                      onClick={() => startEdit(note)}
                      className="p-1.5 rounded hover:bg-theme-500/10 text-theme-500/40 hover:text-theme-500 transition-colors"
                    >
                      <FiEdit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(note.id)}
                      className="p-1.5 rounded hover:bg-red-500/10 text-theme-500/40 hover:text-red-500 transition-colors"
                    >
                      <FiTrash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </Container>
  );
}

