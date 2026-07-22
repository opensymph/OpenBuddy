import { describe, it, expect, beforeEach } from "vitest";
import {
  useQuestionStore,
  selectQuestionForSession,
  type QuestionRequest,
} from "../question-store";

const resetStore = () => useQuestionStore.setState({ queues: {} });

function makeQuestion(requestId: string, sessionId: string): QuestionRequest {
  return {
    requestId,
    sessionId,
    toolCallId: `tc-${requestId}`,
    title: `Question ${requestId}`,
    questions: [
      { id: "q1", question: "选择方案", options: ["A", "B", "C"] },
    ],
  };
}

describe("question-store", () => {
  beforeEach(resetStore);

  it("request 入队到对应 sessionId", () => {
    useQuestionStore.getState().request(makeQuestion("r1", "s1"));
    expect(useQuestionStore.getState().queues["s1"]).toHaveLength(1);
    expect(useQuestionStore.getState().queues["s1"][0].requestId).toBe("r1");
  });

  it("同会话多个 question 按顺序排列", () => {
    const s = useQuestionStore.getState();
    s.request(makeQuestion("r1", "s1"));
    s.request(makeQuestion("r2", "s1"));
    expect(useQuestionStore.getState().queues["s1"].map((q) => q.requestId)).toEqual(["r1", "r2"]);
  });

  it("不同会话隔离", () => {
    const s = useQuestionStore.getState();
    s.request(makeQuestion("r1", "s1"));
    s.request(makeQuestion("r2", "s2"));
    expect(useQuestionStore.getState().queues["s1"]).toHaveLength(1);
    expect(useQuestionStore.getState().queues["s2"]).toHaveLength(1);
  });

  it("sessionId 为空时兜底到 __global", () => {
    useQuestionStore.getState().request(makeQuestion("r1", ""));
    expect(useQuestionStore.getState().queues["__global"]).toHaveLength(1);
  });

  it("dismiss 指定 sessionId 只移除该会话中的", () => {
    const s = useQuestionStore.getState();
    s.request(makeQuestion("r1", "s1"));
    s.request(makeQuestion("r2", "s1"));
    s.request(makeQuestion("r3", "s2"));
    s.dismiss("r1", "s1");
    expect(useQuestionStore.getState().queues["s1"].map((q) => q.requestId)).toEqual(["r2"]);
    expect(useQuestionStore.getState().queues["s2"]).toHaveLength(1);
  });

  it("dismiss 不指定 sessionId 则从所有队列中移除", () => {
    const s = useQuestionStore.getState();
    s.request(makeQuestion("r1", "s1"));
    s.request(makeQuestion("r1", "s2"));
    s.dismiss("r1");
    expect(useQuestionStore.getState().queues["s1"]).toHaveLength(0);
    expect(useQuestionStore.getState().queues["s2"]).toHaveLength(0);
  });

  it("dismiss 不存在的 requestId 无副作用", () => {
    useQuestionStore.getState().request(makeQuestion("r1", "s1"));
    useQuestionStore.getState().dismiss("nope", "s1");
    expect(useQuestionStore.getState().queues["s1"]).toHaveLength(1);
  });

  it("dismiss 不存在的 sessionId 无副作用", () => {
    useQuestionStore.getState().request(makeQuestion("r1", "s1"));
    useQuestionStore.getState().dismiss("r1", "no-such");
    expect(useQuestionStore.getState().queues["s1"]).toHaveLength(1);
  });
});

describe("selectQuestionForSession", () => {
  beforeEach(resetStore);

  it("返回指定会话的第一个 pending question", () => {
    const s = useQuestionStore.getState();
    s.request(makeQuestion("r1", "s1"));
    s.request(makeQuestion("r2", "s1"));
    const selector = selectQuestionForSession("s1");
    expect(selector(useQuestionStore.getState())?.requestId).toBe("r1");
  });

  it("会话无 pending 返回 null", () => {
    expect(selectQuestionForSession("s1")(useQuestionStore.getState())).toBeNull();
  });

  it("sessionId 为 null 返回 null", () => {
    useQuestionStore.getState().request(makeQuestion("r1", "s1"));
    expect(selectQuestionForSession(null)(useQuestionStore.getState())).toBeNull();
  });
});
