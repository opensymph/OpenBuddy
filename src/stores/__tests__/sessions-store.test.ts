import { describe, it, expect, beforeEach } from "vitest";
import {
  useSessionsStore,
  HOME_DRAFT_KEY,
  ASSISTANT_DRAFT_KEY,
} from "../sessions-store";

/**
 * Per-session Composer draft storage. The UI uses `drafts[sessionId]` (or a
 * sentinel key) so switching sessions preserves unsent textarea text. These
 * tests pin the store-level contract the Composer integration relies on:
 *  - setDraft upserts; empty string deletes (keeps the map tidy).
 *  - clearDraft removes one entry.
 *  - remove(sessionId) drops the matching draft too (no leak).
 *  - sentinel keys behave like ordinary keys.
 */
describe("sessions-store drafts", () => {
  beforeEach(() => {
    // Reset the whole store between tests so drafts don't bleed across cases.
    useSessionsStore.setState({
      independent: [],
      workspaces: [],
      workspaceSessions: {},
      tasksOpen: true,
      spacesOpen: true,
      expanded: {},
      homeCwd: "",
      currentSessionId: null,
      loading: false,
      error: null,
      query: "",
      drafts: {},
    });
  });

  it("setDraft 写入后可通过 drafts[id] 读回", () => {
    useSessionsStore.getState().setDraft("s1", "北京天气怎么样");
    expect(useSessionsStore.getState().drafts.s1).toBe("北京天气怎么样");
  });

  it("setDraft 空字符串等价于删除(不残留空 key)", () => {
    useSessionsStore.getState().setDraft("s1", "hi");
    useSessionsStore.getState().setDraft("s1", "");
    expect(useSessionsStore.getState().drafts.s1).toBeUndefined();
    expect(Object.keys(useSessionsStore.getState().drafts)).not.toContain("s1");
  });

  it("setDraft 同值不产生新引用(避免无谓渲染)", () => {
    useSessionsStore.getState().setDraft("s1", "hi");
    const before = useSessionsStore.getState().drafts;
    useSessionsStore.getState().setDraft("s1", "hi");
    // 同值写入应返回 {} → drafts 引用不变。
    expect(useSessionsStore.getState().drafts).toBe(before);
  });

  it("clearDraft 删除指定草稿,缺失时无副作用", () => {
    useSessionsStore.getState().setDraft("s1", "hi");
    useSessionsStore.getState().clearDraft("s1");
    expect(useSessionsStore.getState().drafts.s1).toBeUndefined();
    // 缺失 key 不抛错。
    expect(() => useSessionsStore.getState().clearDraft("nope")).not.toThrow();
  });

  it("remove(sessionId) 顺带清掉该会话的草稿", () => {
    // 先把会话挂进 任务 分组,并写入草稿。
    useSessionsStore.getState().setHomeCwd("/home");
    useSessionsStore.getState().upsert({ sessionId: "s1", cwd: "/home" });
    useSessionsStore.getState().setDraft("s1", "未发送的字");
    expect(useSessionsStore.getState().drafts.s1).toBe("未发送的字");

    useSessionsStore.getState().remove("s1");
    expect(useSessionsStore.getState().drafts.s1).toBeUndefined();
  });

  it("哨兵 key (__home__ / __assistant__) 与普通 key 行为一致", () => {
    useSessionsStore.getState().setDraft(HOME_DRAFT_KEY, "首页草稿");
    useSessionsStore.getState().setDraft(ASSISTANT_DRAFT_KEY, "助理草稿");
    expect(useSessionsStore.getState().drafts[HOME_DRAFT_KEY]).toBe("首页草稿");
    expect(useSessionsStore.getState().drafts[ASSISTANT_DRAFT_KEY]).toBe(
      "助理草稿",
    );
    useSessionsStore.getState().clearDraft(HOME_DRAFT_KEY);
    expect(useSessionsStore.getState().drafts[HOME_DRAFT_KEY]).toBeUndefined();
  });

  it("新建条目兜底填 updatedAt(避免在侧边栏 recently-active 排序中沉底)", () => {
    useSessionsStore.getState().setHomeCwd("/home");
    // 调用方没传 updatedAt → store 应自动补一个,使新会话能置顶。
    useSessionsStore.getState().upsert({ sessionId: "fresh", cwd: "/home" });
    const entry = useSessionsStore
      .getState()
      .independent.find((x) => x.sessionId === "fresh");
    expect(entry?.updatedAt).toBeTruthy();

    // 调用方显式传了 updatedAt → 以调用方为准。
    useSessionsStore.getState().upsert({
      sessionId: "fresh2",
      cwd: "/home",
      updatedAt: "2020-01-01T00:00:00.000Z",
    });
    const entry2 = useSessionsStore
      .getState()
      .independent.find((x) => x.sessionId === "fresh2");
    expect(entry2?.updatedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});
