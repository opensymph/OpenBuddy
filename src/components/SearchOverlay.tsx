import { useCallback, useEffect, useRef, useState } from "react";
import { Search, X, Clock, FileText } from "lucide-react";
import { useSessionsStore } from "@/stores/sessions-store";
import { sessionSearch } from "@/lib/grok-client";
import type { SearchHit, SessionSummary } from "@/lib/types";

/**
 * Session search overlay — now powered by grok's FTS5 full-text index.
 *
 * Two modes:
 *  - Empty / short query: filter the current workspace's session list by
 *    title (instant, local).
 *  - Query ≥ 2 chars: fire `x.ai/session/search` against grok's full-text
 *    index (cross-workspace, matches message content + titles). Results show
 *    a snippet of the matched content.
 *
 * Selecting a hit: if it's a local title match we have the sessionId directly;
 * if it's a remote FTS hit we still call onSelect(sessionId) — the parent
 * decides whether to switch workspaces first.
 */
export function SearchOverlay({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (sessionId: string, cwd?: string) => void;
}) {
  const sessions = useSessionsStore((s) => s.sessions);
  const [query, setQuery] = useState("");
  const [remoteHits, setRemoteHits] = useState<SearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setRemoteHits([]);
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced remote search. Only kicks in for queries ≥ 2 chars.
  const runRemoteSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setRemoteHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const hits = await sessionSearch(q.trim(), undefined, 30);
      setRemoteHits(hits);
    } catch {
      // grok FTS not available / index empty — fall back to local-only.
      setRemoteHits([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runRemoteSearch(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, runRemoteSearch]);

  // Local title matches (always computed, instant).
  const localMatches: SessionSummary[] = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter((s) => s.title.toLowerCase().includes(q));
  })();

  // Dedupe: remote hits whose sessionId already appears in localMatches are
  // shown only once (in the remote section, which has the snippet).
  const localIds = new Set(localMatches.map((s) => s.sessionId));
  const remoteOnly = remoteHits.filter((h) => !localIds.has(h.sessionId));

  if (!open) return null;

  return (
    <div
      className="conversation-search-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-label="搜索会话"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="conversation-search-modal">
        <div className="conversation-search-modal__input-wrapper">
          <Search size={16} strokeWidth={1.75} className="conversation-search-modal__icon" />
          <input
            ref={inputRef}
            className="conversation-search-modal__input"
            placeholder="搜索会话标题或内容…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && (
            <span className="conversation-search-modal__spinner">搜索中…</span>
          )}
          <button
            className="conversation-search-modal__close"
            onClick={onClose}
            aria-label="关闭"
            type="button"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>

        <div className="conversation-search-modal__body">
          {localMatches.length > 0 && (
            <>
              <div className="conversation-search-modal__count">
                当前工作空间 ({localMatches.length})
              </div>
              <ul className="conversation-search-modal__list">
                {localMatches.slice(0, 30).map((s) => (
                  <li key={s.sessionId}>
                    <button
                      type="button"
                      className="conversation-search-modal__item"
                      onClick={() => {
                        onSelect(s.sessionId, s.cwd);
                        onClose();
                      }}
                      title={s.title}
                    >
                      <Clock
                        size={14}
                        strokeWidth={1.75}
                        className="conversation-search-modal__item-icon"
                      />
                      <span className="conversation-search-modal__item-title">
                        {s.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {remoteOnly.length > 0 && (
            <>
              <div className="conversation-search-modal__count">
                全文检索结果 ({remoteOnly.length})
              </div>
              <ul className="conversation-search-modal__list">
                {remoteOnly.map((h) => (
                  <li key={h.sessionId}>
                    <button
                      type="button"
                      className="conversation-search-modal__item conversation-search-modal__item--remote"
                      onClick={() => {
                        onSelect(h.sessionId, h.cwd);
                        onClose();
                      }}
                      title={h.cwd ?? h.sessionId}
                    >
                      <FileText
                        size={14}
                        strokeWidth={1.75}
                        className="conversation-search-modal__item-icon"
                      />
                      <div className="conversation-search-modal__item-body">
                        <div className="conversation-search-modal__item-title">
                          {h.title || h.sessionId.slice(0, 8)}
                        </div>
                        {h.snippet && (
                          <div
                            className="conversation-search-modal__item-snippet"
                            // grok FTS5 returns plain-text snippets; safe to render.
                            dangerouslySetInnerHTML={{ __html: escapeHtml(h.snippet) }}
                          />
                        )}
                        {h.cwd && (
                          <div className="conversation-search-modal__item-cwd">
                            {h.cwd}
                          </div>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {!searching &&
            localMatches.length === 0 &&
            remoteOnly.length === 0 &&
            query.trim().length > 0 && (
              <div className="conversation-search-modal__empty">
                没有匹配的会话
              </div>
            )}
          {!searching &&
            localMatches.length === 0 &&
            remoteOnly.length === 0 &&
            query.trim().length === 0 && (
              <div className="conversation-search-modal__count">
                输入关键词搜索会话内容（grok FTS5 全文索引）
              </div>
            )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
