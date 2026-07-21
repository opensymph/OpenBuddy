import { LinkifyIt } from "linkify-it";
import type { Root, Parents, PhrasingContent } from "mdast";

type LinkifyInstance = LinkifyIt;

type Options = {
  linkify?: LinkifyInstance;
};

function createNodesFromMatches(
  value: string,
  matches: NonNullable<ReturnType<LinkifyInstance["match"]>>,
  asInlineCode = false,
): PhrasingContent[] {
  const nodes: PhrasingContent[] = [];
  let lastIndex = 0;

  for (const match of matches) {
    const start = match.index ?? 0;
    const end = match.lastIndex ?? start;
    if (start > lastIndex) {
      const sliceValue = value.slice(lastIndex, start);
      nodes.push(
        asInlineCode
          ? { type: "inlineCode", value: sliceValue }
          : { type: "text", value: sliceValue },
      );
    }
    const textValue = match.raw || match.text || value.slice(start, end);
    nodes.push({
      type: "link",
      url: match.url,
      children: [
        asInlineCode
          ? { type: "inlineCode", value: textValue }
          : { type: "text", value: textValue },
      ],
    });
    lastIndex = end;
  }

  if (lastIndex < value.length) {
    const sliceValue = value.slice(lastIndex);
    nodes.push(
      asInlineCode
        ? { type: "inlineCode", value: sliceValue }
        : { type: "text", value: sliceValue },
    );
  }

  return nodes;
}

/**
 * Autolink plain URLs (and URLs inside inline code) via linkify-it.
 * fuzzyLink / fuzzyIP disabled to avoid over-matching.
 */
export function remarkLinkifyIt(options: Options = {}) {
  const linkify =
    options.linkify ??
    new LinkifyIt({
      fuzzyLink: false,
      fuzzyIP: false,
    });

  const hasLinkAncestor = (ancestors: Parents[]) =>
    ancestors.some((a) => a.type === "link" || a.type === "linkReference");

  const processNode = (
    node: { type: string; value?: string },
    index: number,
    parent: Parents,
  ): number | undefined => {
    const matches = linkify.match(node.value ?? "");
    if (!matches || matches.length === 0) return undefined;
    const replacement = createNodesFromMatches(
      node.value ?? "",
      matches,
      node.type === "inlineCode",
    );
    if (replacement.length === 0) return undefined;
    parent.children.splice(index, 1, ...replacement);
    return index + replacement.length;
  };

  const visitChildren = (parent: Parents, ancestors: Parents[]) => {
    for (let index = 0; index < parent.children.length; index++) {
      const child = parent.children[index] as {
        type: string;
        value?: string;
        children?: unknown[];
      };
      if (
        (child.type === "text" || child.type === "inlineCode") &&
        !hasLinkAncestor(ancestors)
      ) {
        const nextIndex = processNode(child, index, parent);
        if (nextIndex !== undefined) {
          index = nextIndex - 1;
          continue;
        }
      }
      if ("children" in child && Array.isArray(child.children)) {
        visitChildren(child as unknown as Parents, [...ancestors, child as unknown as Parents]);
      }
    }
  };

  return (tree: Root) => {
    visitChildren(tree, []);
  };
}
