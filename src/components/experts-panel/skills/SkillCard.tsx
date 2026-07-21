import type { SkillCatalogItem } from "@/lib/types";
import { AddIcon, CheckIcon } from "@/foundation/components/Icon/icons";
import { LetterAvatar } from "../shared/LetterAvatar";

/** Skill catalog card (截图 3): colored glyph + name + 2-line desc + a "+"
 *  install button (check mark once installed). */
export function SkillCard({
  item, installed, onAdd,
}: {
  item: SkillCatalogItem;
  installed?: boolean;
  onAdd: (item: SkillCatalogItem) => void;
}) {
  return (
    <article className={`sk-card${installed ? " sk-card--installed" : ""}`}>
      <div className="sk-card-head">
        <LetterAvatar name={item.name} color={item.color} size={32} shape="square" />
        <div className="sk-card-name">{item.name}</div>
        <button type="button"
          className={`sk-add${installed ? " sk-add--done" : ""}`}
          title={installed ? "已安装" : "安装 / 导入"}
          onClick={() => !installed && onAdd(item)}
          disabled={installed}>
          {installed ? <CheckIcon size="sm" /> : <AddIcon size="sm" />}
        </button>
      </div>
      {item.reason && <div className="sk-card-reason">{item.reason}</div>}
      <p className="sk-card-desc">{item.desc}</p>
    </article>
  );
}
