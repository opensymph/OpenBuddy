import type { PathType } from "../types";

const SYMBOL_PATTERN = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const ABSOLUTE_PATH_PATTERN = /^(?:[a-zA-Z]:[\\/]|[\\/])(?:[^\\/]+[\\/])*[^\\/]+[\\/]?/;
const RELATIVE_PATH_PATTERN =
  /^(?![.\\/]$)(?!^$)(?:[^\\/]+(?:[\\/][^\\/]+)+|(?:[^\\/]+)\.(?:[a-zA-Z0-9]+))$/;
const FILENAME_PATTERN = /^(?:[^\\/]+)\.(?:[a-zA-Z0-9]+)$/;
const CODE_RANGE_PATTERN = /^(.+?)#L(\d+)(?:-L(\d+))?$/;

export type PathDetection = {
  isPath: boolean;
  type?: PathType;
  purePath?: string;
  range?: { start: number; end?: number };
};

function isSymbol(code: string) {
  return SYMBOL_PATTERN.test(code);
}

function isAbsolutePath(code: string) {
  return ABSOLUTE_PATH_PATTERN.test(code);
}

function isFilename(code: string) {
  return FILENAME_PATTERN.test(code);
}

function isRelativePath(code: string) {
  if (isAbsolutePath(code)) return false;
  if (!code.includes("/") && !code.includes("\\") && !isFilename(code)) return false;
  return RELATIVE_PATH_PATTERN.test(code);
}

function hasLineRange(code: string) {
  return CODE_RANGE_PATTERN.test(code);
}

function isPath(code: string) {
  return isAbsolutePath(code) || isRelativePath(code) || isFilename(code) || hasLineRange(code);
}

function shouldDetectAsPath(code: string) {
  return isSymbol(code) || isPath(code);
}

function parseLineRange(code: string) {
  const match = code.match(CODE_RANGE_PATTERN);
  if (!match) return undefined;
  return {
    start: parseInt(match[2], 10),
    end: match[3] ? parseInt(match[3], 10) : undefined,
  };
}

function extractPurePath(code: string) {
  const match = code.match(CODE_RANGE_PATTERN);
  return match ? match[1] : code;
}

function detectPathType(code: string): PathType | undefined {
  const purePath = extractPurePath(code);
  if (isSymbol(purePath)) return "symbol";
  if (purePath.endsWith("/") || purePath.endsWith("\\")) return "directory";
  if (isFilename(purePath) || isAbsolutePath(purePath) || isRelativePath(purePath)) {
    const parts = purePath.split(/[\\/]/);
    const lastPart = parts[parts.length - 1];
    if (lastPart && lastPart.includes(".")) return "file";
    return "directory";
  }
  return undefined;
}

export function detectPath(code: string): PathDetection {
  if (!shouldDetectAsPath(code)) return { isPath: false };
  const purePath = extractPurePath(code);
  return {
    isPath: true,
    type: detectPathType(code),
    purePath,
    range: parseLineRange(code),
  };
}

export function middleEllipsis(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  const available = maxLen - 3;
  const headLen = Math.ceil(available / 2);
  const tailLen = Math.floor(available / 2);
  return str.slice(0, headLen) + "..." + str.slice(str.length - tailLen);
}

export function truncatePathDisplay(text: string, maxLen = 40): string {
  if (text.length <= maxLen) return text;
  const sepIdx = Math.max(text.lastIndexOf("/"), text.lastIndexOf("\\"));
  const fileName = sepIdx >= 0 ? text.slice(sepIdx + 1) : text;
  const dirPart = sepIdx >= 0 ? text.slice(0, sepIdx + 1) : "";
  if (!dirPart || fileName.length >= maxLen - 4) return middleEllipsis(text, maxLen);
  const dirBudget = maxLen - fileName.length - 3;
  if (dirBudget <= 1) return middleEllipsis(text, maxLen);
  return `${dirPart.slice(0, dirBudget)}...${fileName}`;
}
