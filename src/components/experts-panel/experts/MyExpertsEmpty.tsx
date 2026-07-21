/** Empty state for the 我的专家 sub-page (截图 2). */
export function MyExpertsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="ec-myempty">
      <div className="ec-myempty-icon" aria-hidden>
        <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M22 10 12 5 2 10l10 5 10-5Z" />
          <path d="M6 12v5c0 1 2.5 2.5 6 2.5s6-1.5 6-2.5v-5" />
          <path d="M22 10v5" />
        </svg>
      </div>
      <div className="ec-myempty-title">还没有创建任何专家</div>
      <p className="ec-myempty-hint">创建属于你的专家，分享专业知识</p>
      <button type="button" className="ec-myempty-btn" onClick={onCreate}>+ 创建专家</button>
    </div>
  );
}
