import { describe, it, expect } from "vitest";
import {
  collectSessionArtifacts,
  findToolCall,
} from "../session-artifacts";
import type { ChatMessage } from "@/stores/session-store";

describe("session-artifacts", () => {
  it("collects unique paths from diffs and titles", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        complete: true,
        parts: [
          {
            kind: "tool_call",
            toolCall: {
              toolCallId: "t1",
              title: "Write C:\\Users\\chenr\\hello.txt",
              kind: "edit",
              status: "completed",
              content: [
                {
                  type: "diff",
                  diff: {
                    path: "C:\\Users\\chenr\\hello.txt",
                    old: "",
                    new: "hello",
                  },
                },
              ],
            },
          },
          {
            kind: "tool_call",
            toolCall: {
              toolCallId: "t2",
              title: "Write C:\\Users\\chenr\\hello.txt",
              kind: "edit",
              status: "completed",
              content: [],
            },
          },
        ],
      },
    ];
    const arts = collectSessionArtifacts(messages);
    expect(arts).toHaveLength(1);
    expect(arts[0].path.toLowerCase()).toContain("hello.txt");
    expect(arts[0].toolCallId).toBe("t2"); // last write wins
  });

  it("findToolCall locates by id", () => {
    const messages: ChatMessage[] = [
      {
        id: "a1",
        role: "assistant",
        complete: true,
        parts: [
          {
            kind: "tool_call",
            toolCall: {
              toolCallId: "abc",
              title: "read",
              kind: "read",
              status: "completed",
              content: [],
            },
          },
        ],
      },
    ];
    expect(findToolCall(messages, "abc")?.kind).toBe("read");
    expect(findToolCall(messages, "nope")).toBeUndefined();
  });
});
