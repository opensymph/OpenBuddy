import { useEffect, useRef, useState } from "react";
import { expertsThumbnail } from "@/lib/grok-client";
import { LetterAvatar } from "./LetterAvatar";

/** path -> resolved data URL. Survives across cards / remounts so scrolling back
 *  is instant and each avatar is decoded at most once per session. */
const cache = new Map<string, string>();
/** path -> in-flight promise, so concurrent cards for the same avatar share one
 *  invoke instead of stampeding the backend. */
const inflight = new Map<string, Promise<string>>();

function cached(path: string): string | undefined {
  return cache.get(path);
}

function loadThumb(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit) return Promise.resolve(hit);
  let p = inflight.get(path);
  if (!p) {
    p = expertsThumbnail(path)
      .then((b64) => {
        const url = b64 ? `data:image/jpeg;base64,${b64}` : "";
        if (url) cache.set(path, url);
        return url;
      })
      .catch(() => "")
      .finally(() => {
        inflight.delete(path);
      });
    inflight.set(path, p);
  }
  return p;
}

interface ThumbImgProps {
  /** Absolute local avatar path (preferred; thumbnailed lazily). */
  local?: string;
  /** Remote fallback URL (used if there is no local file or thumb fails). */
  url?: string;
  name: string;
  size?: number;
  shape?: "circle" | "square";
  color?: string;
  className?: string;
}

/** Avatar that prefers a local file (loaded as a tiny cached JPEG, only when the
 *  element scrolls near the viewport) and falls back to a remote URL, then to a
 *  colored letter. This keeps the ~100 MB of full-res source avatars from ever
 *  loading wholesale — only the visible cards decode. */
export function ThumbImg({
  local, url, name, size = 40, shape = "square", color, className,
}: ThumbImgProps) {
  const [src, setSrc] = useState<string | undefined>(() =>
    local ? cached(local) : url,
  );
  const wrapRef = useRef<HTMLSpanElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    startedRef.current = false;
    if (!local) {
      setSrc(url);
      return;
    }
    const hit = cached(local);
    if (hit) {
      setSrc(hit);
      return;
    }
    setSrc(undefined); // letter until the thumbnail is ready
    const start = () => {
      if (startedRef.current) return;
      startedRef.current = true;
      loadThumb(local).then((u) => setSrc(u || url));
    };
    const el = wrapRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      start();
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            start();
            io.disconnect();
          }
        }
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [local, url]);

  // The observed wrapper must have a box, so it carries the avatar's footprint
  // (inline-flex keeps it inline like a bare avatar would be).
  return (
    <span ref={wrapRef} className="um-thumb-wrap"
      style={{ width: size, height: size, display: "inline-flex" }}>
      <LetterAvatar name={name} src={src} size={size} shape={shape}
        color={color} className={className} />
    </span>
  );
}
