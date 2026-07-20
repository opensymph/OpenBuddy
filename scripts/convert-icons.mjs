#!/usr/bin/env node
/**
 * Convert WorkBuddy decompiled Icon components to clean TypeScript/React.
 *
 * Four shapes are produced by the decompiler:
 *
 *   1. inline-jsx-call:   XxxRaw = (0, import_react$N.forwardRef)((props, ref) =>
 *                             (0, import_jsx_runtime$N.jsx)("svg", { ..., children: jsx("path",{...}) }))
 *   2. inline-real-jsx:   XxxRaw = (0, import_react.forwardRef)((props, ref) =>
 *                             <svg viewBox=...><path .../></svg>)
 *   3. lucide-direct:     XxxIcon = createIcon(ChevronLeft, { strokeWidth: 1.5 })
 *   4. lucide-custom:     LobsterClaw = createLucideIcon("name", [["path",{d:...}]]);
 *                         XxxIcon = createIcon(LobsterClaw, {...})
 *
 * 5. svg-asset:           uses a raw inline SVG string (ImaKnowledgeIcon etc.)
 *                         — these are brand/illustration icons; we emit a stub.
 *
 * Usage: node convert-icons.mjs <srcDir> <outDir> <indexOutPath>
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const [, , srcDir, outDir, indexOutPath] = process.argv;
if (!srcDir || !outDir) {
  console.error("usage: convert-icons.mjs <srcDir> <outDir> [indexOutPath]");
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

// ---------- shape detection & extraction ----------

function analyze(text, fileName) {
  const exportName = fileName.replace(/\.tsx$/, "");
  const isLucide = /init_lucide_react\b|lucide_react/.test(text);
  const hasRealJsx = /=>\s*<svg[\s>]/.test(text);
  const hasJsxCall = /forwardRef\)\(\s*\(props,\s*ref\)\s*=>\s*\(0,\s*import_jsx_runtime\$\d+/.test(text) ||
                     /forwardRef\)\(\s*\(props,\s*ref\)\s*=>\s*\(?[0-9a-zA-Z_]*\s*,\s*import_jsx_runtime\$\d+/.test(text);
  const hasForwardRefJsxCall = /forwardRef\)\(\s*\(props,\s*ref\)\s*=>\s*[\s\S]*?jsx\)\s*\(\s*"svg"/.test(text);

  // lucide-direct: createIcon(SomePascalName, { ... }) where SomePascalName is an
  // imported lucide component. Match `createIcon(<Ident>, ...)`.
  if (isLucide) {
    const m = text.match(/createIcon\(\s*([A-Z][A-Za-z0-9]+)\s*(?:,\s*(\{[\s\S]*?\}))?\s*\)/);
    if (m) {
      // Is that Ident defined via createLucideIcon in this file?
      const customRe = new RegExp(`\\b${m[1]}\\s*=\\s*createLucideIcon\\(`);
      if (customRe.test(text)) {
        return { shape: "lucide-custom", exportName, ident: m[1], defaults: m[2] || "", text };
      }
      return { shape: "lucide-direct", exportName, ident: m[1], defaults: m[2] || "", text };
    }
  }

  if (hasRealJsx) {
    // Extract the `<svg ...>...</svg>` literal verbatim.
    const m = text.match(/=>\s*(<svg[\s\S]*?<\/svg>)\s*\)/);
    if (m) return { shape: "real-jsx", exportName, svg: m[1], text };
  }

  if (hasForwardRefJsxCall || hasJsxCall) {
    const fwdMatch = text.match(
      /(\w+Raw)\s*=\s*(?:\(0,\s*import_react(?:\$\d+)?\.forwardRef\)|\(0,\s*import_react\$\d+\)\.forwardRef|\(\w+\)\.forwardRef|forwardRef)\s*\(\s*\(props,\s*ref\)\s*=>\s*([\s\S]*?)\)\)\s*;\s*\1\.displayName/
    );
    if (fwdMatch) {
      return { shape: "jsx-call", exportName, rawName: fwdMatch[1], body: fwdMatch[2].trim(), text };
    }
  }

  return { shape: "unknown", exportName, text };
}

// ---------- builders ----------

function buildJsxCall(a) {
  const { exportName, body } = a;
  let s = body;
  s = s.replace(/\(0,\s*import_jsx_runtime\$\d+\.(jsx|jsxs)\)/g, "");
  s = s.replace(/\(0,\s*import_react\$\d+\)/g, "").trim();
  const m = s.match(/^\(?\s*"svg"\s*,\s*\{([\s\S]*)\}\s*\)?\s*$/);
  if (!m) return fail(exportName, "jsx-call svg attrs");
  let inner = m[1];

  // peel off `children: ...` at depth 0
  const childIdx = findTopLevelKey(inner, "children:");
  let svgAttrs = inner;
  let childrenSrc = "";
  if (childIdx !== -1) {
    svgAttrs = inner.slice(0, childIdx).trim().replace(/,\s*$/, "");
    childrenSrc = inner.slice(childIdx + "children:".length).trim();
  }

  const attrLines = [];
  for (const part of splitTopLevel(svgAttrs, ",")) {
    const p = part.trim();
    if (!p || p === "ref") continue;
    if (p.startsWith("...")) {
      // JSX spread must be wrapped: `{...props}` not bare `...props`.
      attrLines.push("{" + p + "}");
      continue;
    }
    const km = p.match(/^([\w-]+)\s*:\s*(.*)$/s);
    if (km) attrLines.push(propToJsx(km[1], km[2].trim()));
    else attrLines.push(p);
  }

  const childrenJsx = convertChildren(childrenSrc);
  const attrStr = attrLines.join("\n      ");
  const bodyJsx = childrenJsx ? `\n      ${childrenJsx}\n    ` : "";

  return `import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ${exportName}Raw = forwardRef<SVGSVGElement>((props, ref) => (
  <svg
      ref={ref}
      ${attrStr}
    >${bodyJsx}</svg>
));
${exportName}Raw.displayName = "${exportName}Raw";

export const ${exportName} = createIcon(${exportName}Raw);
`;
}

function buildRealJsx(a) {
  const { exportName, svg } = a;
  // Inject ref support: rewrite `<svg ` to `<svg ref={ref} ` so forwardRef works.
  const svgWithRef = svg.replace(/^<svg/, "<svg ref={ref}");
  return `import { forwardRef } from "react";
import { createIcon } from "../Icon";

const ${exportName}Raw = forwardRef<SVGSVGElement>((props, ref) => (
  ${svgWithRef}
));
${exportName}Raw.displayName = "${exportName}Raw";

export const ${exportName} = createIcon(${exportName}Raw);
`;
}

function buildLucideDirect(a) {
  const { exportName, ident, defaults } = a;
  const defaultsArg = defaults ? `, ${defaults}` : "";
  return `import { ${ident} } from "lucide-react";
import { createIcon } from "../Icon";

export const ${exportName} = createIcon(${ident}${defaultsArg});
`;
}

function buildLucideCustom(a) {
  const { exportName, ident, defaults, text } = a;
  // Extract the createLucideIcon(...) call verbatim, including its node array.
  const re = new RegExp(`${ident}\\s*=\\s*(createLucideIcon\\([\\s\\S]*?\\))\\s*;`);
  const m = text.match(re);
  if (!m) return fail(exportName, "lucide-custom extract");
  const call = m[1];
  const defaultsArg = defaults ? `, ${defaults}` : "";
  return `import { createLucideIcon } from "lucide-react";
import { createIcon } from "../Icon";

const ${ident} = ${call};
export const ${exportName} = createIcon(${ident}${defaultsArg});
`;
}

function buildStub(a, reason) {
  const { exportName } = a;
  return fail(exportName, reason);
}

function fail(exportName, reason) {
  return `// OPENBUDDY-TODO(${reason}): icon not auto-converted; re-implement by hand.
export const ${exportName}: any = () => null;
`;
}

// ---------- helpers ----------

function propToJsx(key, value) {
  if (/^"[^"]*"$/.test(value)) return `${key}=${value}`;
  return `${key}={${value}}`;
}

function findTopLevelKey(s, key) {
  let depth = 0;
  for (let i = 0; i <= s.length - key.length; i++) {
    const c = s[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    else if (depth === 0 && s.startsWith(key, i)) return i;
  }
  return -1;
}

function splitTopLevel(s, sep) {
  const out = [];
  let depth = 0;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === "{" || c === "(" || c === "[") depth++;
    else if (c === "}" || c === ")" || c === "]") depth--;
    if (c === sep && depth === 0) { out.push(cur); cur = ""; }
    else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function convertChildren(src) {
  if (!src) return "";
  src = src.trim().replace(/,\s*$/, "").trim();
  if (src.startsWith("(") && src.endsWith(")")) src = src.slice(1, -1).trim();

  // Array of children: [ ("path",{...}), ("circle",{...}), ... ]
  // We can't split on commas naively (attribute objects contain commas).
  // Instead, scan for the repeated `("tag", { ... })` units and extract each.
  if (src.startsWith("[")) {
    const out = [];
    // Match `("tag", { balanced-object })` repeatedly.
    const unitRe = /\(\s*"(\w+)"\s*,\s*(\{)/g;
    let lastEnd = 1; // skip leading '['
    let m;
    while ((m = unitRe.exec(src)) !== null) {
      const tag = m[1];
      const objStart = m.index + m[0].length - 1; // position of '{'
      const objEnd = matchBrace(src, objStart, "{", "}");
      if (objEnd === -1) break;
      const objSrc = src.slice(objStart, objEnd + 1);
      out.push(element(tag, objSrc));
      lastEnd = objEnd + 1;
    }
    if (out.length) return out.join("\n      ");
  }

  // Single child: `"tag", { ... }`
  const m = src.match(/^"(\w+)"\s*,\s*(\{[\s\S]*\})$/);
  if (m) return element(m[1], m[2]);
  return `{${src}}`;
}

/** Find the index of the matching closing brace for the opener at `openIdx`. */
function matchBrace(s, openIdx, open, close) {
  let depth = 0;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i];
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function element(tag, attrsSrc) {
  const inner = attrsSrc.slice(1, attrsSrc.lastIndexOf("}"));
  const lines = [];
  for (const part of splitTopLevel(inner, ",")) {
    const p = part.trim();
    if (!p) continue;
    const km = p.match(/^([\w-]+)\s*:\s*(.*)$/s);
    if (km) lines.push(propToJsx(km[1], km[2].trim()));
    else lines.push(p);
  }
  return `<${tag} ${lines.join(" ")} />`;
}

// ---------- main ----------

const files = readdirSync(srcDir).filter((f) => f.endsWith(".tsx") && f !== "index.tsx");
const counts = { "jsx-call": 0, "real-jsx": 0, "lucide-direct": 0, "lucide-custom": 0, stub: 0, unknown: 0 };
const exports = [];
const unknownFiles = [];

for (const f of files) {
  const text = readFileSync(join(srcDir, f), "utf8");
  const a = analyze(text, f);
  let src;
  switch (a.shape) {
    case "jsx-call": src = buildJsxCall(a); counts["jsx-call"]++; break;
    case "real-jsx": src = buildRealJsx(a); counts["real-jsx"]++; break;
    case "lucide-direct": src = buildLucideDirect(a); counts["lucide-direct"]++; break;
    case "lucide-custom": src = buildLucideCustom(a); counts["lucide-custom"]++; break;
    default: src = buildStub(a, `shape:${a.shape}`); counts.stub++; unknownFiles.push(f);
  }
  // A file counts as an export unless its body still contains the TODO marker.
  if (!/OPENBUDDY-TODO/.test(src)) exports.push(a.exportName);
  writeFileSync(join(outDir, f.replace(/\.tsx$/, ".tsx")), src);
}

if (indexOutPath) {
  mkdirSync(dirname(indexOutPath), { recursive: true });
  const lines = exports.map((n) => `export { ${n} } from "./${n}";`);
  writeFileSync(indexOutPath, lines.join("\n") + "\n");
}

console.log("counts:", counts);
console.log("exports:", exports.length, "/", files.length);
if (unknownFiles.length) console.log("unconverted:", unknownFiles.join(", "));
