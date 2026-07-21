import { useState, useCallback } from "react";
import { useQuestionStore, selectQuestionForSession } from "@/stores/question-store";
import { grokResolveQuestion } from "@/lib/grok-client";

/**
 * Inline question card rendered inside the ChatView message stream.
 * Shows questions from the agent with selectable options + optional custom input.
 * Only shows requests for the given session.
 */
export function QuestionInlineCard({ sessionId }: { sessionId: string | null }) {
  const head = useQuestionStore(selectQuestionForSession(sessionId));
  const dismiss = useQuestionStore((s) => s.dismiss);

  const [selections, setSelections] = useState<Record<string, string>>({});
  const [customInputs, setCustomInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const handleSelect = useCallback(
    (questionId: string, option: string) => {
      setSelections((prev) => ({ ...prev, [questionId]: option }));
      setCustomInputs((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    },
    [],
  );

  const handleCustomInput = useCallback(
    (questionId: string, value: string) => {
      setCustomInputs((prev) => ({ ...prev, [questionId]: value }));
      setSelections((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
    },
    [],
  );

  if (!head) return null;

  const handleSubmit = async () => {
    setBusy(true);
    // Grok's AskUserQuestionExtResponse keys answers by **question text**,
    // not synthetic id. Freeform-only answers must be label "Other" with the
    // typed text in annotations[question].notes.
    const answers: Record<string, string | string[]> = {};
    const annotations: Record<string, { notes?: string }> = {};
    for (const q of head.questions) {
      const key = q.question || q.id;
      const selected = selections[q.id];
      const custom = (customInputs[q.id] ?? "").trim();
      if (selected) {
        answers[key] = selected;
        if (custom) annotations[key] = { notes: custom };
      } else if (custom) {
        answers[key] = "Other";
        annotations[key] = { notes: custom };
      }
    }
    try {
      dismiss(head.requestId, head.sessionId);
      await grokResolveQuestion(head.requestId, {
        answers,
        annotations: Object.keys(annotations).length ? annotations : undefined,
      });
    } catch (e) {
      console.error("resolve question failed", e);
    } finally {
      setBusy(false);
      setSelections({});
      setCustomInputs({});
    }
  };

  const handleCancel = async () => {
    setBusy(true);
    try {
      dismiss(head.requestId, head.sessionId);
      await grokResolveQuestion(head.requestId, { cancelled: true });
    } catch (e) {
      console.error("cancel question failed", e);
    } finally {
      setBusy(false);
      setSelections({});
      setCustomInputs({});
    }
  };

  const hasAnswer = head.questions.some(
    (q) => (selections[q.id] ?? customInputs[q.id] ?? "").length > 0,
  );

  return (
    <div className="question-inline">
      <div className="question-inline__head">
        <span className="question-inline__icon">?</span>
        <span className="question-inline__title">{head.title || "Agent 提问"}</span>
      </div>
      <div className="question-inline__body">
        {head.questions.map((q) => (
          <div key={q.id} className="question-inline__question">
            <p className="question-inline__question-text">{q.question}</p>
            {q.options.length > 0 && (
              <div className="question-inline__options">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    className={
                      "question-inline__option" +
                      (selections[q.id] === opt ? " question-inline__option--selected" : "")
                    }
                    onClick={() => handleSelect(q.id, opt)}
                    disabled={busy}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <input
              type="text"
              className="question-inline__custom-input"
              placeholder="输入自定义回答…"
              value={customInputs[q.id] ?? ""}
              onChange={(e) => handleCustomInput(q.id, e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && hasAnswer && !busy) handleSubmit();
              }}
              disabled={busy}
            />
          </div>
        ))}
      </div>
      <div className="question-inline__footer">
        <button
          className="btn btn--ghost"
          onClick={handleCancel}
          disabled={busy}
        >
          跳过
        </button>
        <button
          className="btn btn--primary"
          onClick={handleSubmit}
          disabled={busy || !hasAnswer}
        >
          提交
        </button>
      </div>
    </div>
  );
}
