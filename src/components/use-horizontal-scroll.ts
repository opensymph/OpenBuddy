import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 复刻 WorkBuddy 的 `use-horizontal-scroll`:为一条横向可滚动的 chip 行提供
 * 左右箭头按钮 + 边缘渐隐 + 鼠标拖拽滚动 + 垂直滚轮转横向滚动。
 *
 * 返回的 `bind` 需要展开到滚动容器上;`canScrollLeft/Right` 用来控制左右
 * 箭头与渐隐遮罩的显隐。
 */

const SCROLL_STEP = 200;
/** 拖拽超过该像素阈值才视为"拖拽",从而抑制随后触发的 click。 */
const DRAG_THRESHOLD = 3;

export interface HorizontalScroll {
  containerRef: React.RefObject<HTMLDivElement>;
  canScrollLeft: boolean;
  canScrollRight: boolean;
  scrollByStep: (dir: "left" | "right") => void;
  /** 展开到滚动容器上的鼠标/滚轮事件绑定。 */
  bind: {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseUp: () => void;
    onMouseLeave: () => void;
    onClickCapture: (e: React.MouseEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
}

export function useHorizontalScroll(deps: unknown[] = []): HorizontalScroll {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // 拖拽状态用 ref 记录,避免渲染开销。
  const dragging = useRef(false);
  const moved = useRef(false);
  const startX = useRef(0);
  const startScroll = useRef(0);

  const update = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft < max - 1);
  }, []);

  // 内容/尺寸变化时重算可滚动状态。
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    // jsdom(测试环境)没有 ResizeObserver;真实 WebView 里用它感知尺寸变化。
    const ro =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    ro?.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro?.disconnect();
    };
    // 依赖变化(如 chip 列表切换/展开)时也重算。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const scrollByStep = useCallback((dir: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -SCROLL_STEP : SCROLL_STEP, behavior: "smooth" });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    dragging.current = true;
    moved.current = false;
    startX.current = e.clientX;
    startScroll.current = el.scrollLeft;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragging.current) return;
    const el = containerRef.current;
    if (!el) return;
    const dx = e.clientX - startX.current;
    if (Math.abs(dx) > DRAG_THRESHOLD) moved.current = true;
    el.scrollLeft = startScroll.current - dx;
  }, []);

  const endDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  // 拖拽结束后,若发生过位移,吞掉本次 click,避免误触发 chip 的 onClick。
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (moved.current) {
      e.preventDefault();
      e.stopPropagation();
      moved.current = false;
    }
  }, []);

  // 垂直滚轮转为横向滚动,提升触控板/鼠标体验。
  const onWheel = useCallback((e: React.WheelEvent) => {
    const el = containerRef.current;
    if (!el) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
    }
  }, []);

  return {
    containerRef,
    canScrollLeft,
    canScrollRight,
    scrollByStep,
    bind: { onMouseDown, onMouseMove, onMouseUp: endDrag, onMouseLeave: endDrag, onClickCapture, onWheel },
  };
}
