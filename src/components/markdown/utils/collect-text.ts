import { Children, isValidElement, type ReactNode } from "react";

/** Recursively collect plain text from a React node tree. */
export function collectText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(collectText).join("");
  if (isValidElement(node)) {
    return collectText((node.props as { children?: ReactNode }).children);
  }
  return "";
}

export function extractCodeFromChildren(children: ReactNode): {
  language: string;
  code: string;
} {
  let language = "";
  let code = "";
  Children.forEach(children, (child) => {
    if (isValidElement(child) && child.type === "code") {
      const props = child.props as { className?: string; children?: ReactNode };
      const cls = props.className || "";
      const match = cls.match(/language-([\w+#.-]+)/);
      if (match) language = match[1];
      code = collectText(props.children);
    }
  });
  return { language, code };
}
