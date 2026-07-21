import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

/** Set node.data.inline on every <code> (true unless parent is <pre>). */
export function rehypeInlineCode() {
  return (root: Root) => {
    visit(root, "element", (node: Element, _index, parent) => {
      if (node.tagName !== "code") return;
      const isCodeBlock =
        parent &&
        parent.type === "element" &&
        (parent as Element).tagName === "pre";
      if (!node.data) node.data = {};
      (node.data as { inline?: boolean }).inline = !isCodeBlock;
    });
  };
}
