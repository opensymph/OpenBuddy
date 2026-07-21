import type { ExpertItem } from "@/lib/types";
import { ThumbImg } from "../shared/ThumbImg";

/** Subtitle line, mirroring WorkBuddy's `expertUsageText`: teams prefer the
 *  author (e.g. "CodeBuddy Teams"), agents use the display name; whichever is
 *  non-empty and differs from the title and the description. */
function subtitle(e: ExpertItem): string {
  const title = (e.title || e.name || "").trim();
  const desc = (e.desc || "").trim();
  const cands = e.type === "team" ? [e.author, e.name] : [e.name];
  return cands.map((s) => (s || "").trim()).find((s) => s && s !== title && s !== desc) ?? "";
}

/** Expert / team card (截图 1): square avatar, bold 职称, the 特邀专家 ribbon
 *  when present, an author/name subtitle, 2-line description, ≤3 tag chips, and
 *  a 召唤 button revealed on hover. The whole card summons the expert. */
export function ExpertCard({
  expert, onSummon,
}: {
  expert: ExpertItem;
  onSummon: (expert: ExpertItem) => void;
}) {
  const sub = subtitle(expert);
  const title = expert.title || expert.name;
  return (
    <article className="ec-card" onClick={() => onSummon(expert)} title="召唤该专家开始对话">
      <button type="button" className="ec-card-summon"
        onClick={(ev) => { ev.stopPropagation(); onSummon(expert); }}>
        召唤
      </button>
      <div className="ec-card-head">
        <ThumbImg name={expert.name} local={expert.avatarLocal} url={expert.avatarUrl}
          size={44} shape="square" />
        <div className="ec-card-titles">
          <div className="ec-card-title-row">
            <span className="ec-card-title">{title}</span>
            {expert.ribbon && (
              <span className="ec-card-ribbon" title={expert.ribbon}>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden>
                  <path d="M6 1l1.3.9 1.6-.2.6 1.5 1.4.8-.3 1.6.8 1.4-1 1.3.1 1.6-1.5.5-.9 1.3-1.6-.3L6 11l-1.5-.8-1.6.3-.9-1.3-1.5-.5.1-1.6-1-1.3.8-1.4-.3-1.6 1.4-.8.6-1.5 1.6.2z"
                    fill="var(--ec-ribbon-bg, #3d3d3d)" />
                  <path d="M5.4 7.6 4 6.2l.8-.8.6.6 1.8-1.8.8.8z" fill="#f7d18f" />
                </svg>
                <span>{expert.ribbon}</span>
              </span>
            )}
          </div>
          {sub && <div className="ec-card-sub">{sub}</div>}
        </div>
      </div>
      {expert.desc && <p className="ec-card-desc">{expert.desc}</p>}
      {expert.tags.length > 0 && (
        <div className="ec-card-tags">
          {expert.tags.slice(0, 3).map((t, i) => (
            <span key={i} className="ec-card-tag">{t}</span>
          ))}
        </div>
      )}
    </article>
  );
}
