const FILE_NAME_TO_LANG: Record<string, string> = {
  dockerfile: "dockerfile",
  makefile: "makefile",
  "cmakelists.txt": "cmake",
  ".gitignore": "gitignore",
  jenkinsfile: "groovy",
  "go.mod": "go",
  "go.sum": "go",
  procfile: "plaintext",
  readme: "markdown",
  changelog: "markdown",
  license: "plaintext",
};

const EXT_TO_LANG: Record<string, string> = {
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  json: "json",
  css: "css",
  scss: "scss",
  sass: "sass",
  less: "less",
  html: "html",
  xml: "xml",
  md: "markdown",
  py: "python",
  java: "java",
  go: "go",
  rs: "rust",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  h: "c",
  hpp: "cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  yml: "yaml",
  yaml: "yaml",
  sql: "sql",
  swift: "swift",
  kt: "kotlin",
  r: "r",
  m: "objectivec",
  mm: "objectivec",
  pl: "perl",
  lua: "lua",
  vim: "vim",
  diff: "diff",
  patch: "diff",
  proto: "protobuf",
  graphql: "graphql",
  vue: "xml",
  svelte: "xml",
  gitignore: "gitignore",
  mod: "go",
  toml: "ini",
  ini: "ini",
  env: "bash",
};

export const LanguageUtil = {
  getLanguageByFilename(filename = ""): string {
    if (!filename) return "plaintext";
    const basename = filename.split(/[\\/]/).pop() || filename;
    const lowerBasename = basename.toLowerCase();
    if (FILE_NAME_TO_LANG[lowerBasename]) return FILE_NAME_TO_LANG[lowerBasename];
    const ext = basename.split(".").pop();
    if (ext && ext !== basename) {
      const langByExt = EXT_TO_LANG[ext.toLowerCase()];
      if (langByExt) return langByExt;
    }
    return "plaintext";
  },
};
