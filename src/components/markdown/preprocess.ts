const MAX_REPEAT = 200;

/**
 * Normalize model output before markdown parse:
 * - Cap pathological repeated characters (streaming / model glitches)
 * - Convert LaTeX delimiters \[ \] / \( \) into remark-math $$ / $
 */
export function preprocessMarkdown(source: string): string {
  let result = source;

  result = result.replace(/(.)\1{200,}/g, (match, char: string) => {
    return `${char.repeat(MAX_REPEAT)}…[${match.length - MAX_REPEAT} chars omitted]`;
  });

  result = result.replace(/\\\[([\s\S]*?)\\\]/g, (_, content: string) => `$$${content}$$`);
  result = result.replace(/\\\(([\s\S]*?)\\\)/g, (_, content: string) => `$${content}$`);

  return result;
}
