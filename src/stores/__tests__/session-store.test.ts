import { describe, it, expect, beforeEach } from "vitest";
import { useSessionStore } from "../session-store";

/**
 * Per-session transcript store. The whole point of this refactor is that
 * switching sessions must NOT lose the locally-optimistic user bubbles, and a
 * session that keeps streaming in the background must keep accumulating into
 * its own transcript so a switch-back shows the full, live state.
 *
 * We feed `applyUpdate` plain objects shaped like the wire payload: a
 * `sessionUpdate` tag + `content`/fields, plus the side-channel `__sessionId`
 * the bridge attaches.
 */

const resetStore = () =>
  useSessionStore.setState({
    sessionId: null,
    transcripts: {},
    messages: [],
    streaming: false,
    streamingMessageId: null,
    usage: {},
    plan: null,
    error: null,
    planMode: false,
  });

// Wire-shaped payloads; cast loosely — we only care about runtime routing here.
const chunk = (text: string, sid: string) =>
  ({
    sessionUpdate: "agent_message_chunk",
    content: { text },
    __sessionId: sid,
  }) as unknown as Parameters<
    ReturnType<typeof useSessionStore.getState>["applyUpdate"]
  >[0];

const complete = (sid: string, totalTokens = 0) =>
  ({
    sessionId: sid,
    usage: { totalTokens },
  }) as unknown as Parameters<
    ReturnType<typeof useSessionStore.getState>["markComplete"]
  >[0];

const textOf = (idx: number) => {
  const m = useSessionStore.getState().messages[idx];
  return m.parts
    .filter((p) => p.kind === "text")
    .map((p) => (p as { text: string }).text)
    .join("");
};

describe("session-store transcripts", () => {
  beforeEach(resetStore);

  it("切离再切回保留本地 pushUser 的用户消息", () => {
    useSessionStore.getState().setSession("A");
    useSessionStore.getState().pushUser("北京天气怎么样");
    expect(useSessionStore.getState().messages[0].role).toBe("user");

    useSessionStore.getState().setSession("B");
    expect(useSessionStore.getState().messages).toEqual([]);

    useSessionStore.getState().setSession("A");
    expect(useSessionStore.getState().messages[0].role).toBe("user");
    expect(textOf(0)).toBe("北京天气怎么样");
  });

  it("流式中切走:后台 update 累积进旧会话 transcript,不污染当前", () => {
    const s = useSessionStore.getState();
    s.setSession("A");
    s.pushUser("q");
    s.startStreaming();
    s.applyUpdate(chunk("part1", "A"));
    expect(useSessionStore.getState().streaming).toBe(true);

    s.setSession("B"); // 切走,A 后台继续
    expect(useSessionStore.getState().messages).toEqual([]);
    expect(useSessionStore.getState().streaming).toBe(false);

    // 后台 chunk 带 __sessionId=A → 进 transcripts[A],绝不能进 B。
    useSessionStore.getState().applyUpdate(chunk("part2", "A"));
    expect(useSessionStore.getState().messages).toEqual([]); // B 仍空
    const a = useSessionStore.getState().transcripts["A"];
    const asst = a.messages.find((m) => m.role === "assistant")!;
    expect(
      asst.parts
        .filter((p) => p.kind === "text")
        .map((p) => (p as { text: string }).text)
        .join(""),
    ).toBe("part1part2");
    expect(a.streamingMessageId).not.toBeNull(); // A 仍在流
  });

  it("后台 complete 路由进旧会话,切回看到完整且已结束", () => {
    const s = useSessionStore.getState();
    s.setSession("A");
    s.pushUser("q");
    s.startStreaming();
    s.applyUpdate(chunk("answer", "A"));
    s.setSession("B");
    s.markComplete(complete("A", 42)); // A 在后台结束

    const a = useSessionStore.getState().transcripts["A"];
    expect(a.streamingMessageId).toBeNull();
    expect(a.messages.find((m) => m.role === "assistant")!.complete).toBe(true);
    expect(a.usage.totalTokens).toBe(42);

    s.setSession("A"); // 切回
    expect(textOf(1)).toBe("answer");
    expect(useSessionStore.getState().streaming).toBe(false);
    expect(useSessionStore.getState().usage.totalTokens).toBe(42);
  });

  it("流式中切回(尚未 complete)→ streaming 仍为 true", () => {
    const s = useSessionStore.getState();
    s.setSession("A");
    s.pushUser("q");
    s.startStreaming();
    s.applyUpdate(chunk("so far", "A"));
    s.setSession("B");
    s.applyUpdate(chunk(" more", "A")); // 后台累积,未 complete
    s.setSession("A"); // 切回,A 仍在流
    expect(useSessionStore.getState().streaming).toBe(true);
    expect(textOf(1)).toBe("so far more");
  });

  it("foreign update 无监听也不污染当前会话(路由到各自 transcript)", () => {
    const s = useSessionStore.getState();
    s.setSession("B");
    // 归属 X(无 transcript、无监听)→ 创建 transcripts[X],B 不变。
    s.applyUpdate(chunk("stray", "X"));
    expect(useSessionStore.getState().messages).toEqual([]);
    expect(useSessionStore.getState().transcripts["X"].messages.length).toBe(1);
  });

  it("缓存命中时屏蔽回放 update;clearReplaySuppression 后恢复", () => {
    const s = useSessionStore.getState();
    s.setSession("A");
    s.pushUser("q");
    s.applyUpdate(chunk("real", "A"));
    s.setSession("B");
    s.setSession("A"); // 命中缓存 → suppressReplay=true
    expect(useSessionStore.getState().transcripts["A"].suppressReplay).toBe(
      true,
    );

    // 回放重发的历史 chunk 必须被丢弃,不能合并/重复。
    s.applyUpdate(chunk("REPLAYED", "A"));
    expect(textOf(1)).toBe("real");

    // load 结束后清除抑制,真正的新一轮 update 才能进入。
    s.clearReplaySuppression("A");
    s.applyUpdate(chunk("LIVE", "A"));
    expect(textOf(1)).toBe("realLIVE");
  });

  it("stopStreaming 保留已流出内容并清 streaming 标志", () => {
    const s = useSessionStore.getState();
    s.setSession("A");
    s.pushUser("q");
    s.startStreaming();
    s.applyUpdate(chunk("partial", "A"));
    expect(useSessionStore.getState().streaming).toBe(true);

    s.stopStreaming();
    expect(useSessionStore.getState().streaming).toBe(false);
    expect(useSessionStore.getState().streamingMessageId).toBeNull();
    // 已流出的文本保留,且该 assistant 消息被标记 complete。
    expect(textOf(1)).toBe("partial");
    expect(useSessionStore.getState().messages[1].complete).toBe(true);
  });

  it("dropSessionCache 后切回走空(交给回放重建)", () => {
    const s = useSessionStore.getState();
    s.setSession("A");
    s.pushUser("q");
    s.applyUpdate(chunk("x", "A"));
    s.setSession("B");
    s.dropSessionCache("A");
    expect(useSessionStore.getState().transcripts["A"]).toBeUndefined();
    s.setSession("A"); // 无缓存 → 空,不抑制
    expect(useSessionStore.getState().messages).toEqual([]);
    expect(useSessionStore.getState().transcripts["A"].suppressReplay).toBe(
      false,
    );
  });
});
