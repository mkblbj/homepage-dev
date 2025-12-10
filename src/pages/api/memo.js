import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

import { CONF_DIR } from "utils/config/config";

const MEMO_FILE = join(CONF_DIR, "memo.json");

function readMemos() {
  try {
    if (!existsSync(MEMO_FILE)) {
      return { notes: [] };
    }
    const data = readFileSync(MEMO_FILE, "utf8");
    return JSON.parse(data);
  } catch (e) {
    return { notes: [] };
  }
}

function writeMemos(data) {
  writeFileSync(MEMO_FILE, JSON.stringify(data, null, 2), "utf8");
}

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export default async function handler(req, res) {
  const { method } = req;

  switch (method) {
    case "GET": {
      const data = readMemos();
      // 按创建时间倒序
      data.notes.sort((a, b) => b.createdAt - a.createdAt);
      return res.status(200).json(data);
    }

    case "POST": {
      const { content } = req.body;
      if (!content?.trim()) {
        return res.status(400).json({ error: "Content is required" });
      }

      const data = readMemos();
      const note = {
        id: generateId(),
        content: content.trim(),
        createdAt: Date.now(),
        updatedAt: Date.now(),
        readBy: [], // 已读用户列表
      };

      data.notes.push(note);
      writeMemos(data);

      return res.status(201).json(note);
    }

    case "PUT": {
      const { id, content } = req.body;
      if (!id || !content?.trim()) {
        return res.status(400).json({ error: "ID and content are required" });
      }

      const data = readMemos();
      const noteIndex = data.notes.findIndex((n) => n.id === id);

      if (noteIndex === -1) {
        return res.status(404).json({ error: "Note not found" });
      }

      data.notes[noteIndex].content = content.trim();
      data.notes[noteIndex].updatedAt = Date.now();
      // 内容更新后，重置已读状态（可选）
      data.notes[noteIndex].readBy = [];
      writeMemos(data);

      return res.status(200).json(data.notes[noteIndex]);
    }

    case "PATCH": {
      // 标记已读/未读
      const { id, viewerId, action } = req.body;
      if (!id || !viewerId) {
        return res.status(400).json({ error: "ID and viewerId are required" });
      }

      const data = readMemos();
      const noteIndex = data.notes.findIndex((n) => n.id === id);

      if (noteIndex === -1) {
        return res.status(404).json({ error: "Note not found" });
      }

      const note = data.notes[noteIndex];
      if (!note.readBy) note.readBy = [];

      if (action === "unread") {
        // 标记未读
        note.readBy = note.readBy.filter((v) => v !== viewerId);
      } else {
        // 标记已读
        if (!note.readBy.includes(viewerId)) {
          note.readBy.push(viewerId);
        }
      }

      writeMemos(data);
      return res.status(200).json(note);
    }

    case "DELETE": {
      const { id } = req.body;
      if (!id) {
        return res.status(400).json({ error: "ID is required" });
      }

      const data = readMemos();
      const noteIndex = data.notes.findIndex((n) => n.id === id);

      if (noteIndex === -1) {
        return res.status(404).json({ error: "Note not found" });
      }

      const deleted = data.notes.splice(noteIndex, 1)[0];
      writeMemos(data);

      return res.status(200).json(deleted);
    }

    default:
      res.setHeader("Allow", ["GET", "POST", "PUT", "PATCH", "DELETE"]);
      return res.status(405).end(`Method ${method} Not Allowed`);
  }
}
