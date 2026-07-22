import { describe, it, expect, beforeEach } from "vitest";
import {
  usePermissionStore,
  selectPermissionForSession,
  selectPermissionHead,
} from "../permission-store";
import type { PermissionRequest } from "@/lib/types";

const resetStore = () => usePermissionStore.setState({ queues: {} });

function makePerm(requestId: string, sessionId: string): PermissionRequest {
  return {
    requestId,
    sessionId,
    toolCallId: `tc-${requestId}`,
    tool: "Bash",
    title: `Run: echo ${requestId}`,
    input: { command: `echo ${requestId}` },
    kind: "terminal",
  } as unknown as PermissionRequest;
}

describe("permission-store", () => {
  beforeEach(resetStore);

  it("request 入队到对应 sessionId", () => {
    usePermissionStore.getState().request(makePerm("r1", "s1"));
    expect(usePermissionStore.getState().queues["s1"]).toHaveLength(1);
    expect(usePermissionStore.getState().queues["s1"][0].requestId).toBe("r1");
  });

  it("同会话多个 request 按顺序排列", () => {
    const s = usePermissionStore.getState();
    s.request(makePerm("r1", "s1"));
    s.request(makePerm("r2", "s1"));
    s.request(makePerm("r3", "s1"));
    expect(usePermissionStore.getState().queues["s1"].map((q) => q.requestId)).toEqual(["r1", "r2", "r3"]);
  });

  it("不同会话隔离", () => {
    const s = usePermissionStore.getState();
    s.request(makePerm("r1", "s1"));
    s.request(makePerm("r2", "s2"));
    expect(usePermissionStore.getState().queues["s1"]).toHaveLength(1);
    expect(usePermissionStore.getState().queues["s2"]).toHaveLength(1);
  });

  it("sessionId 为空时兜底到 __global", () => {
    usePermissionStore.getState().request(makePerm("r1", ""));
    expect(usePermissionStore.getState().queues["__global"]).toHaveLength(1);
  });

  it("dismiss 指定 sessionId 只移除该会话中的", () => {
    const s = usePermissionStore.getState();
    s.request(makePerm("r1", "s1"));
    s.request(makePerm("r2", "s1"));
    s.request(makePerm("r3", "s2"));
    s.dismiss("r1", "s1");
    expect(usePermissionStore.getState().queues["s1"].map((q) => q.requestId)).toEqual(["r2"]);
    expect(usePermissionStore.getState().queues["s2"]).toHaveLength(1);
  });

  it("dismiss 不指定 sessionId 则从所有队列中移除", () => {
    const s = usePermissionStore.getState();
    s.request(makePerm("r1", "s1"));
    s.request(makePerm("r1", "s2")); // 同 requestId 在不同会话
    s.dismiss("r1");
    expect(usePermissionStore.getState().queues["s1"]).toHaveLength(0);
    expect(usePermissionStore.getState().queues["s2"]).toHaveLength(0);
  });

  it("dismiss 不存在的 requestId 无副作用", () => {
    usePermissionStore.getState().request(makePerm("r1", "s1"));
    usePermissionStore.getState().dismiss("nope", "s1");
    expect(usePermissionStore.getState().queues["s1"]).toHaveLength(1);
  });

  it("dismiss 不存在的 sessionId 无副作用", () => {
    usePermissionStore.getState().request(makePerm("r1", "s1"));
    usePermissionStore.getState().dismiss("r1", "no-such-session");
    expect(usePermissionStore.getState().queues["s1"]).toHaveLength(1);
  });
});

describe("selectPermissionForSession", () => {
  beforeEach(resetStore);

  it("返回指定会话的第一个 pending", () => {
    const s = usePermissionStore.getState();
    s.request(makePerm("r1", "s1"));
    s.request(makePerm("r2", "s1"));
    const selector = selectPermissionForSession("s1");
    expect(selector(usePermissionStore.getState())?.requestId).toBe("r1");
  });

  it("会话无 pending 返回 null", () => {
    expect(selectPermissionForSession("s1")(usePermissionStore.getState())).toBeNull();
  });

  it("sessionId 为 null 返回 null", () => {
    usePermissionStore.getState().request(makePerm("r1", "s1"));
    expect(selectPermissionForSession(null)(usePermissionStore.getState())).toBeNull();
  });
});

describe("selectPermissionHead", () => {
  beforeEach(resetStore);

  it("返回第一个非空队列的头部", () => {
    const s = usePermissionStore.getState();
    s.request(makePerm("r1", "s1"));
    s.request(makePerm("r2", "s2"));
    expect(selectPermissionHead(usePermissionStore.getState())?.requestId).toBe("r1");
  });

  it("所有队列为空返回 null", () => {
    expect(selectPermissionHead(usePermissionStore.getState())).toBeNull();
  });
});
