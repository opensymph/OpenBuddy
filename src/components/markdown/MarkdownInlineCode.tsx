import { memo, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { MarkdownConfig, PathType } from "./types";
import { detectPath, truncatePathDisplay } from "./utils/path-detector";

type Props = {
  children?: ReactNode;
  className?: string;
  pathClickHandler?: MarkdownConfig["pathClickHandler"];
  resolveCode?: MarkdownConfig["resolveCode"];
  openCodeLink?: MarkdownConfig["openCodeLink"];
  requestId?: string;
  renderPathIcon?: MarkdownConfig["renderInlineCodePathIcon"];
};

const resolvedTypeCache = new Map<string, PathType>();
const resolvingPromiseCache = new Map<string, Promise<PathType>>();

function getCacheKey(requestId: string, code: string) {
  return `${requestId}:${code}`;
}

function childrenToCode(children: ReactNode): string {
  if (typeof children === "string") return children;
  if (typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(childrenToCode).join("");
  return String(children ?? "");
}

export const MarkdownInlineCode = memo(function MarkdownInlineCode({
  children,
  className = "",
  pathClickHandler,
  resolveCode,
  openCodeLink,
  requestId,
  renderPathIcon,
}: Props) {
  const code = useMemo(() => childrenToCode(children), [children]);

  const pathDetection = useMemo(() => {
    if (!pathClickHandler?.onPathClick && !resolveCode) return { isPath: false as const };
    return detectPath(code);
  }, [code, pathClickHandler, resolveCode]);

  const cacheKey = requestId ? getCacheKey(requestId, code) : "";
  const [resolvedType, setResolvedType] = useState<PathType | undefined>(() => {
    if (cacheKey) return resolvedTypeCache.get(cacheKey);
    return undefined;
  });

  useEffect(() => {
    if (!resolveCode || !requestId || !pathDetection.isPath) return;
    const key = getCacheKey(requestId, code);
    const cached = resolvedTypeCache.get(key);
    if (cached !== undefined) {
      setResolvedType(cached);
      return;
    }
    const existing = resolvingPromiseCache.get(key);
    if (existing) {
      existing.then(setResolvedType);
      return;
    }
    const promise = resolveCode(requestId, code)
      .then((result) => {
        resolvedTypeCache.set(key, result);
        resolvingPromiseCache.delete(key);
        setResolvedType(result);
        return result;
      })
      .catch(() => {
        const fallback: PathType = "unknown";
        resolvedTypeCache.set(key, fallback);
        resolvingPromiseCache.delete(key);
        setResolvedType(fallback);
        return fallback;
      });
    resolvingPromiseCache.set(key, promise);
  }, [resolveCode, requestId, code, pathDetection.isPath]);

  // Heuristic highlight when no async resolver is provided but path handler exists
  const heuristicType = pathDetection.isPath ? pathDetection.type : undefined;

  const shouldHighlight = useMemo(() => {
    if (resolveCode && requestId) {
      return (
        resolvedType === "file" ||
        resolvedType === "directory" ||
        resolvedType === "symbol"
      );
    }
    if (pathClickHandler?.onPathClick && heuristicType && heuristicType !== "unknown") {
      return true;
    }
    return false;
  }, [resolveCode, requestId, resolvedType, pathClickHandler, heuristicType]);

  const finalType: PathType | undefined = useMemo(() => {
    if (resolveCode && requestId && resolvedType && resolvedType !== "unknown") {
      return resolvedType;
    }
    if (heuristicType && heuristicType !== "unknown") return heuristicType;
    return undefined;
  }, [resolveCode, requestId, resolvedType, heuristicType]);

  const handleClick = useCallback(() => {
    if (!shouldHighlight || !finalType) return;
    if (openCodeLink && requestId) {
      try {
        openCodeLink(requestId, code, finalType);
      } catch {
        /* ignore */
      }
      return;
    }
    if (pathClickHandler?.onPathClick) {
      const purePath = pathDetection.purePath || code;
      pathClickHandler.onPathClick(purePath, finalType, pathDetection.range);
    }
  }, [
    shouldHighlight,
    finalType,
    openCodeLink,
    requestId,
    code,
    pathClickHandler,
    pathDetection,
  ]);

  if (shouldHighlight && finalType) {
    const titleText =
      finalType === "symbol"
        ? "跳转到符号"
        : finalType === "file"
          ? "打开文件"
          : "打开目录";
    const iconNode = renderPathIcon?.({
      code,
      purePath: pathDetection.purePath || code,
      type: finalType,
    });
    return (
      <code
        className={[className, "md-inline-code", "md-clickable-path", `md-path-type-${finalType}`]
          .filter(Boolean)
          .join(" ")}
        onClick={handleClick}
        title={titleText}
        role="link"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            handleClick();
          }
        }}
      >
        {iconNode ? <span className="md-clickable-path-icon">{iconNode}</span> : null}
        {truncatePathDisplay(code)}
      </code>
    );
  }

  return (
    <code className={["md-inline-code", className].filter(Boolean).join(" ")}>
      {children}
    </code>
  );
});
