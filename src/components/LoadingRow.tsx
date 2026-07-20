import { useEffect, useRef, useState } from "react";
import { LOADING_TIPS } from "@/lib/loading-tips";

/**
 * 助手消息的「等待中」行：头像/名字由 MessageItem 的 header 渲染，本组件
 * 只负责 body 里的 loading 行，视觉对齐 WorkBuddy：
 *
 *   [扫光主文案]  ·  [轮播小贴士]
 *
 * - 主文案走 progress phase 的两段式：先发请求前的「准备中」，随后切到
 *   「等待模型响应」，并套用 `ob-shining-text` 扫光（一道亮带在文字上扫过，
 *   即「文字在 loading」的观感，移植自 cb-chat-ui 的 shining-text mixin）。
 * - 右侧小贴士在挂载 `initialDelay` 后开始，每隔 `interval` 随机换一条
 *   （不与上一条重复），切换时淡入 —— 与 WorkBuddy 的 LoadingTip 同构。
 */

const PREPARING_TEXT = "准备中";
const REQUESTING_TEXT = "等待模型响应";
/** 「准备中」展示多久后推进到「等待模型响应」。 */
const PREPARING_DURATION_MS = 1200;
/** 首条 tip 出现前的延迟（让主文案先单独亮相）。 */
const TIP_INITIAL_DELAY_MS = 3500;
/** tip 轮播间隔。 */
const TIP_ROTATION_INTERVAL_MS = 9000;

/** 准备中 → 等待模型响应 的两段 phase。 */
function useLoadingPhase(): string {
  const [requesting, setRequesting] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setRequesting(true), PREPARING_DURATION_MS);
    return () => clearTimeout(t);
  }, []);
  return requesting ? REQUESTING_TEXT : PREPARING_TEXT;
}

/** 随机不重复地轮播 tip，initialDelay 后启动。返回 null 表示尚未开始。 */
function useRotatingTip(
  tips: string[],
  initialDelay: number,
  interval: number
): { text: string; key: number } | null {
  const [tip, setTip] = useState<{ text: string; key: number } | null>(null);
  const prevRef = useRef<string | null>(null);
  const tipsRef = useRef(tips);
  tipsRef.current = tips;

  useEffect(() => {
    let rotation: ReturnType<typeof setInterval> | undefined;
    const pick = () => {
      const pool = tipsRef.current;
      if (pool.length === 0) return;
      let next = pool[Math.floor(Math.random() * pool.length)];
      if (pool.length > 1 && next === prevRef.current) {
        next = pool[(pool.indexOf(next) + 1) % pool.length];
      }
      prevRef.current = next;
      setTip((t) => ({ text: next, key: (t?.key ?? 0) + 1 }));
    };
    const start = setTimeout(() => {
      pick();
      rotation = setInterval(pick, interval);
    }, initialDelay);
    return () => {
      clearTimeout(start);
      if (rotation) clearInterval(rotation);
    };
  }, [initialDelay, interval]);

  return tip;
}

export function LoadingRow() {
  const phase = useLoadingPhase();
  const tip = useRotatingTip(
    LOADING_TIPS,
    TIP_INITIAL_DELAY_MS,
    TIP_ROTATION_INTERVAL_MS
  );

  return (
    <div className="msg__loading">
      <span className="msg__loading-main ob-shining-text">{phase}</span>
      {tip && (
        <span className="msg__loading-tip">
          <span className="msg__loading-sep" aria-hidden="true">
            ·
          </span>
          <span className="msg__loading-tip-text" key={tip.key}>
            {tip.text}
          </span>
        </span>
      )}
    </div>
  );
}
