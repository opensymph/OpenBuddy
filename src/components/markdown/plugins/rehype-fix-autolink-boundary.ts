import { visit } from "unist-util-visit";
import type { Root, Element, ElementContent, Parents } from "hast";

function extractTextContent(node: Element): string {
  const parts: string[] = [];
  const collect = (n: ElementContent) => {
    if (n.type === "text") parts.push(n.value);
    else if (n.type === "element" && n.children) n.children.forEach(collect);
  };
  node.children.forEach(collect);
  return parts.join("");
}

function hasNonASCII(text: string) {
  return /[^\x00-\x7F]/.test(text);
}

function shouldSplitUrl(
  href: string,
  linkText: string,
): { correctUrl: string; extraText: string } | null {
  let decodedHref = href;
  try {
    decodedHref = decodeURIComponent(href);
  } catch {
    decodedHref = href;
  }
  if (!hasNonASCII(decodedHref) && !hasNonASCII(linkText)) return null;

  const urlMatch = decodedHref.match(/^([a-z]+:\/\/[^/\s]+)(\/[^\s]*)?$/i);
  if (!urlMatch) return null;

  const baseUrl = urlMatch[1];
  const pathPart = urlMatch[2] || "";

  if (hasNonASCII(baseUrl)) {
    const cleanBaseUrl = baseUrl.replace(/[^\x00-\x7F]+$/, "");
    const extraText = baseUrl.slice(cleanBaseUrl.length) + pathPart;
    const extra =
      linkText === decodedHref || linkText.startsWith(decodedHref)
        ? extraText + linkText.slice(decodedHref.length)
        : extraText;
    try {
      return { correctUrl: encodeURI(cleanBaseUrl), extraText: extra };
    } catch {
      return { correctUrl: cleanBaseUrl, extraText: extra };
    }
  }

  if (!hasNonASCII(baseUrl) && hasNonASCII(pathPart)) {
    // Keep non-ASCII path segments (many real URLs are valid); only strip
    // trailing glued CJK when link text overruns the href.
  }

  if (hasNonASCII(pathPart)) {
    const cleanPath = pathPart.replace(/[^\x00-\x7F]+$/, "");
    const extraFromPath = pathPart.slice(cleanPath.length);
    if (!extraFromPath) {
      // path itself is non-ASCII but fully part of the URL — leave alone
    } else {
      const correctUrl = baseUrl + cleanPath;
      const extra =
        linkText === decodedHref || linkText.startsWith(decodedHref)
          ? extraFromPath + linkText.slice(decodedHref.length)
          : extraFromPath;
      try {
        return { correctUrl: encodeURI(correctUrl), extraText: extra };
      } catch {
        return { correctUrl, extraText: extra };
      }
    }
  }

  if (linkText.length > decodedHref.length && linkText.startsWith(decodedHref)) {
    const extraText = linkText.slice(decodedHref.length);
    if (hasNonASCII(extraText)) return { correctUrl: href, extraText };
  }

  return null;
}

/**
 * Fix CJK / non-ASCII characters glued to autolinked URLs by splitting them
 * out of the <a> into a following text node.
 */
export function rehypeFixAutolinkBoundary() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "a" || !parent || index === undefined) return;
      const href = node.properties?.href;
      if (typeof href !== "string" || !href) return;

      const splitResult = shouldSplitUrl(href, extractTextContent(node));
      if (!splitResult) return;

      node.properties = { ...node.properties, href: splitResult.correctUrl };
      node.children = [{ type: "text", value: splitResult.correctUrl }];
      (parent as Parents).children.splice(index + 1, 0, {
        type: "text",
        value: splitResult.extraText,
      });
    });
  };
}
