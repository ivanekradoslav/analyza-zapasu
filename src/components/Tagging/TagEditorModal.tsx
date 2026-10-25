import { useEffect, useState } from "react";
import { db } from "@/lib/db/db";
import { addTagType, deleteTagType, updateTagType } from "@/lib/db/operations";
import { CATEGORY_LABELS } from "@/lib/db/defaultTags";
import type { TagCategory } from "@/types";
import Modal from "@/components/common/Modal";

const COLORS = ["#ef4444", "#3b82f6", "#eab308", "#22c55e", "#a855f7", "#f97316", "#06b6d4", "#64748b", "#ec4899"];

export default function TagEditorModal({
  projectId,
  tagId,
  onClose,
}: {
  projectId: string;
  tagId: string | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [category, setCategory] = useState<TagCategory>("custom");
  const [color, setColor] = useState(COLORS[0]);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (!tagId) return;
    db.tagTypes.get(tagId).then((t) => {
      if (!t) return;
      setName(t.name);
      setShortcut(t.shortcut);
      setCategory(t.category);
      setColor(t.color);
      setIsDefault(t.isDefault);
    });
  }, [tagId]);

  async function handleSave() {
    if (!name.trim() || !shortcut.trim()) return;
    if (tagId) {
      await updateTagType(tagId, { name: name.trim(), shortcut: shortcut.trim().toLowerCase(), category, color });
    } else {
      await addTagType(projectId, { name: name.trim(), shortcut: shortcut.trim().toLowerCase(), category, color });
    }
    onClose();
  }

  async function handleDelete() {
    if (!tagId) return;
    if (confirm("Odstrániť tag? Všetky jeho záznamy vo videu sa tiež zmažú.")) {
      await deleteTagType(tagId);
      onClose();
    }
  }

  return (
    <Modal title={tagId ? "Upraviť tag" : "Nový vlastný tag"} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">Názov</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="napr. Rohový kop" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Klávesová skratka</label>
            <input
              className="input"
              value={shortcut}
              maxLength={1}
              onChange={(e) => setShortcut(e.target.value)}
              placeholder="napr. k"
            />
          </div>
          <div>
            <label className="label">Kategória</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value as TagCategory)}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Farba</label>
          <div className="flex gap-1.5 flex-wrap">
            {COLORS.map((c) => (
              <button
                key={c}
                className="h-7 w-7 rounded-full border-2"
                style={{ backgroundColor: c, borderColor: color === c ? "#fff" : "transparent" }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-between pt-2">
          {tagId && !isDefault ? (
            <button className="btn-danger" onClick={handleDelete}>Odstrániť tag</button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={onClose}>Zrušiť</button>
            <button className="btn-primary" onClick={handleSave}>Uložiť</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
