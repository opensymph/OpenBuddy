import { visit } from "unist-util-visit";
import type { Root, Element, ElementContent } from "hast";

function extractLanguage(node: Element): string {
  const className = node.properties?.className;
  if (!Array.isArray(className)) return "";
  for (const cls of className) {
    if (typeof cls === "string" && cls.startsWith("language-")) {
      return cls.slice("language-".length);
    }
  }
  return "";
}

function extractContent(node: Element): string {
  const textParts: string[] = [];
  const collectText = (n: ElementContent) => {
    if (n.type === "text") textParts.push(n.value);
    else if (n.type === "element" && n.children) n.children.forEach(collectText);
  };
  node.children.forEach(collectText);
  return textParts.join("");
}

/**
 * Attach language / content / meta onto parent <pre> node.data so the React
 * `pre` component can render headers without re-walking children.
 * Also marks block vs inline on <code>.
 */
export function rehypeCodeBlock() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "code") return;
      const parentEl = parent && parent.type === "element" ? (parent as Element) : null;
      if (parentEl && parentEl.tagName === "pre") {
        const language = extractLanguage(node);
        const content = extractContent(node);
        const meta =
          (node.data as { meta?: string } | undefined)?.meta ||
          (node.properties?.meta as string | undefined);
        if (!parentEl.data) parentEl.data = {};
        Object.assign(parentEl.data, {
          language,
          content,
          meta,
          ...(node.data || {}),
        });
        if (!node.data) node.data = {};
        (node.data as { inline?: boolean }).inline = false;
      } else {
        if (!node.data) node.data = {};
        (node.data as { inline?: boolean }).inline = true;
      }
    });
  };
}
