import {
  Component,
  memo,
  useEffect,
  useMemo,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeHighlight from "rehype-highlight";
import rehypeKatex from "rehype-katex";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { common } from "lowlight";
import { LinkifyIt } from "linkify-it";
import "katex/dist/katex.min.css";

import { preprocessMarkdown } from "./preprocess";
import { remarkCodeLanguage } from "./plugins/remark-code-language";
import { remarkLinkifyIt } from "./plugins/remark-linkify-it";
import { rehypeCodeBlock } from "./plugins/rehype-code-block";
import { rehypeInlineCode } from "./plugins/rehype-inline-code";
import { rehypeFixAutolinkBoundary } from "./plugins/rehype-fix-autolink-boundary";
import { MarkdownPre } from "./MarkdownPre";
import { MarkdownPreMermaid } from "./MarkdownPreMermaid";
import { MarkdownInlineCode } from "./MarkdownInlineCode";
import type { MarkdownConfig, MarkdownProps } from "./types";

/* ---------- sanitize schema (hljs + katex/mathml) ---------- */

function buildSanitizeSchema(config?: MarkdownConfig) {
  const schema = { ...defaultSchema };
  schema.attributes = {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), "className", "meta"],
    span: ["className", "style", "ariaHidden", "role"],
    div: ["className", "style"],
    pre: [...(defaultSchema.attributes?.pre || []), "className"],
    "*": [
      "className",
      "style",
      "ariaHidden",
      "role",
      "tabIndex",
      "id",
      "title",
    ],
    math: ["xmlns", "display", "alttext"],
    semantics: ["*"],
    annotation: ["encoding"],
    mrow: ["*"],
    msup: ["*"],
    msub: ["*"],
    msubsup: ["*"],
    mi: ["mathvariant"],
    mn: ["*"],
    mo: ["stretchy", "fence", "separator", "lspace", "rspace", "form"],
    mfrac: ["linethickness"],
    msqrt: ["*"],
    mroot: ["*"],
    munder: ["*"],
    mover: ["*"],
    munderover: ["*"],
    mtable: ["*"],
    mtr: ["*"],
    mtd: ["*"],
    mspace: ["width", "height", "depth"],
    mtext: ["*"],
    mstyle: ["*"],
    mpadded: ["*"],
    mphantom: ["*"],
  };
  schema.tagNames = [
    ...(defaultSchema.tagNames || []),
    "math",
    "semantics",
    "mrow",
    "msup",
    "mi",
    "mn",
    "mo",
    "mfrac",
    "msqrt",
    "mroot",
    "msubsup",
    "msub",
    "munder",
    "mover",
    "munderover",
    "mtable",
    "mtr",
    "mtd",
    "mspace",
    "mtext",
    "mstyle",
    "mpadded",
    "mphantom",
    "annotation",
    "maligngroup",
    "malignmark",
    "menclose",
    "merror",
    "mfenced",
    "mglyph",
    "mlabeledtr",
    "mlongdiv",
    "mmultiscripts",
    "mstack",
    "mscarries",
    "mscarry",
    "msgroup",
    "msline",
    "msrow",
    "maction",
  ];

  const extraSchemes = config?.customUrlSchemes?.map((s) => s.scheme) ?? [];
  schema.protocols = {
    ...defaultSchema.protocols,
    href: [...(defaultSchema.protocols?.href || []), ...extraSchemes],
  };
  if (config?.imageUrlResolver || config?.imageUrlResolverAsync) {
    schema.protocols = {
      ...schema.protocols,
      src: [
        ...(defaultSchema.protocols?.src || []),
        "file",
        "local-file",
        "blob",
      ],
    };
  }
  return schema;
}

/* ---------- error boundary ---------- */

const MAX_ERROR_RETRIES = 1;

type BoundaryProps = {
  fallbackText: string;
  remarkPlugins: unknown[];
  rehypePlugins: unknown[];
  components: Record<string, unknown>;
  urlTransform: (url: string) => string;
  children: ReactNode;
};

type BoundaryState = {
  hasError: boolean;
  errorCount: number;
  retryKey: number;
};

class MarkdownErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { hasError: false, errorCount: 0, retryKey: 0 };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo) {
    this.setState((prev) => ({ errorCount: prev.errorCount + 1 }));
    console.warn("[Markdown] DOM reconciliation error caught:", error.message);
  }

  componentDidUpdate(prevProps: BoundaryProps) {
    if (this.state.hasError && prevProps.fallbackText !== this.props.fallbackText) {
      this.setState((prev) => ({
        hasError: false,
        errorCount: 0,
        retryKey: prev.retryKey + 1,
      }));
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.errorCount > MAX_ERROR_RETRIES) {
        return <pre className="md-fallback">{this.props.fallbackText}</pre>;
      }
      return (
        <ReactMarkdown
          key={`fallback-${this.state.retryKey}`}
          remarkPlugins={this.props.remarkPlugins as never}
          rehypePlugins={this.props.rehypePlugins as never}
          components={this.props.components as never}
          urlTransform={this.props.urlTransform}
        >
          {this.props.fallbackText}
        </ReactMarkdown>
      );
    }
    return <div key={this.state.retryKey}>{this.props.children}</div>;
  }
}

/* ---------- image with async resolver ---------- */

function MarkdownImage({
  src,
  alt,
  config,
  ...imgProps
}: {
  src?: string;
  alt?: string;
  config?: MarkdownConfig;
} & React.ImgHTMLAttributes<HTMLImageElement>) {
  const syncResolved = src ? (config?.imageUrlResolver?.(src) ?? src) : src;
  const [resolvedSrc, setResolvedSrc] = useState(syncResolved);

  useEffect(() => {
    let cancelled = false;
    setResolvedSrc(syncResolved);
    if (!src || !config?.imageUrlResolverAsync) {
      return () => {
        cancelled = true;
      };
    }
    config
      .imageUrlResolverAsync(src)
      .then((asyncResolved) => {
        if (!cancelled && asyncResolved) setResolvedSrc(asyncResolved);
      })
      .catch((error) => {
        config.onImageResolveError?.(error, { src });
      });
    return () => {
      cancelled = true;
    };
  }, [config, src, syncResolved]);

  return <img src={resolvedSrc} alt={alt} {...imgProps} />;
}

/* ---------- main renderer ---------- */

function MarkdownInner({
  children,
  complete = true,
  markdownTheme = "legacy",
  config,
  theme = "light",
}: MarkdownProps) {
  const preprocessed = useMemo(
    () => preprocessMarkdown(children ?? ""),
    [children],
  );

  const sanitizeSchema = useMemo(() => buildSanitizeSchema(config), [config]);

  const linkify = useMemo(() => {
    const instance = new LinkifyIt({ fuzzyLink: false, fuzzyIP: false });
    config?.customUrlSchemes?.forEach((s) => {
      if (!s.linkifyValidate) return;
      instance.add(`${s.scheme}:`, { validate: s.linkifyValidate });
    });
    return instance;
  }, [config?.customUrlSchemes]);

  const urlTransform = useMemo(() => {
    const schemes = config?.customUrlSchemes;
    if (!schemes?.length) return defaultUrlTransform;
    const prefixes = schemes.map((s) => `${s.scheme}:`);
    return (value: string) =>
      prefixes.some((p) => value.toLowerCase().startsWith(p))
        ? value
        : defaultUrlTransform(value);
  }, [config?.customUrlSchemes]);

  const remarkPlugins = useMemo(
    () => [
      remarkGfm,
      remarkBreaks,
      [remarkMath, { singleDollarTextMath: true }] as const,
      [remarkLinkifyIt, { linkify }] as const,
      remarkCodeLanguage,
    ],
    [linkify],
  );

  /**
   * Plugin order matters:
   * 1. sanitize before katex (katex emits MathML + styles)
   * 2. code-block / inline-code before highlight (extract raw content)
   * 3. highlight last
   */
  const rehypePlugins = useMemo(
    () => [
      [rehypeSanitize, sanitizeSchema] as const,
      rehypeFixAutolinkBoundary,
      rehypeCodeBlock,
      rehypeInlineCode,
      [
        rehypeKatex,
        {
          strict: false,
          throwOnError: false,
          errorColor: "#cc0000",
          macros: {
            "\\RR": "\\mathbb{R}",
            "\\NN": "\\mathbb{N}",
            "\\ZZ": "\\mathbb{Z}",
            "\\QQ": "\\mathbb{Q}",
            "\\CC": "\\mathbb{C}",
          },
        },
      ] as const,
      [rehypeHighlight, { languages: { ...common } }] as const,
    ],
    [sanitizeSchema],
  );

  const components = useMemo(
    () => ({
      pre: ({
        children: preChildren,
        node,
        ...preProps
      }: {
        children?: ReactNode;
        node?: { data?: Record<string, unknown> };
      } & React.HTMLAttributes<HTMLPreElement>) => {
        const language = node?.data?.language as string | undefined;
        const content = node?.data?.content as string | undefined;
        const meta = node?.data?.meta as string | undefined;

        if (language === "mermaid") {
          return (
            <MarkdownPreMermaid
              content={content}
              complete={complete}
              language={language}
              theme={theme}
              onDownloadMermaid={config?.onDownloadMermaid}
              onPreviewMermaid={config?.onPreviewMermaid}
              codeBlockActions={config?.codeBlockActions}
              requestId={config?.requestId}
              onCodeBlockAction={config?.onCodeBlockAction}
              onApplyCode={config?.onApplyCode}
              expandThreshold={config?.expandThreshold}
            >
              {preChildren}
            </MarkdownPreMermaid>
          );
        }

        if (language === "latex") {
          return (
            <MarkdownPre
              {...preProps}
              language={language}
              code={content}
              meta={meta}
              pathClickHandler={config?.pathClickHandler}
              codeBlockActions={config?.codeBlockActions}
              onApplyCode={config?.onApplyCode}
              isLatex
              requestId={config?.requestId}
              onCodeBlockAction={config?.onCodeBlockAction}
            >
              {preChildren}
            </MarkdownPre>
          );
        }

        return (
          <MarkdownPre
            {...preProps}
            language={language}
            code={content}
            meta={meta}
            pathClickHandler={config?.pathClickHandler}
            codeBlockActions={config?.codeBlockActions}
            onApplyCode={config?.onApplyCode}
            requestId={config?.requestId}
            onCodeBlockAction={config?.onCodeBlockAction}
          >
            {preChildren}
          </MarkdownPre>
        );
      },
      table: ({
        children: tableChildren,
        ...tableProps
      }: React.TableHTMLAttributes<HTMLTableElement> & {
        children?: ReactNode;
      }) => (
        <div className="md-table-wrapper">
          <table {...tableProps}>{tableChildren}</table>
        </div>
      ),
      code: ({
        children: codeChildren,
        node,
        className,
        ...codeProps
      }: {
        children?: ReactNode;
        node?: { data?: { inline?: boolean } };
        className?: string;
      } & React.HTMLAttributes<HTMLElement>) => {
        if (!node?.data?.inline) {
          return (
            <code className={className} {...codeProps}>
              {codeChildren}
            </code>
          );
        }
        return (
          <MarkdownInlineCode
            pathClickHandler={config?.pathClickHandler}
            resolveCode={config?.resolveCode}
            openCodeLink={config?.openCodeLink}
            requestId={config?.requestId}
            renderPathIcon={config?.renderInlineCodePathIcon}
            className={className}
            {...codeProps}
          >
            {codeChildren}
          </MarkdownInlineCode>
        );
      },
      a: ({
        href,
        title,
        children: aChildren,
        ...aProps
      }: React.AnchorHTMLAttributes<HTMLAnchorElement> & {
        children?: ReactNode;
      }) => {
        const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
          if (config?.onLinkClick) {
            if (
              config.onLinkClick({
                href: href || "",
                title,
                children: aChildren,
                event: e,
              }) === false
            ) {
              e.preventDefault();
              e.stopPropagation();
            }
          }
        };
        return (
          <a
            href={href}
            title={title}
            onClick={handleClick}
            target="_blank"
            rel="noopener noreferrer"
            {...aProps}
          >
            {aChildren}
          </a>
        );
      },
      ...(config?.imageUrlResolver || config?.imageUrlResolverAsync
        ? {
            img: ({
              src,
              alt,
              ...imgProps
            }: React.ImgHTMLAttributes<HTMLImageElement>) => (
              <MarkdownImage src={src} alt={alt} config={config} {...imgProps} />
            ),
          }
        : {}),
    }),
    [config, complete, theme],
  );

  const themeClass =
    markdownTheme === "loose" || markdownTheme === "reasoning"
      ? "markdown-body md-font-size-fixed"
      : "markdown-body";

  return (
    <div className={themeClass} data-md-theme={markdownTheme}>
      <MarkdownErrorBoundary
        fallbackText={preprocessed}
        remarkPlugins={remarkPlugins as unknown[]}
        rehypePlugins={rehypePlugins as unknown[]}
        components={components as Record<string, unknown>}
        urlTransform={urlTransform}
      >
        <ReactMarkdown
          remarkPlugins={remarkPlugins as never}
          rehypePlugins={rehypePlugins as never}
          components={components as never}
          urlTransform={urlTransform}
        >
          {preprocessed}
        </ReactMarkdown>
      </MarkdownErrorBoundary>
    </div>
  );
}

export const Markdown = memo(MarkdownInner, (prev, next) => {
  return (
    prev.children === next.children &&
    prev.complete === next.complete &&
    prev.theme === next.theme &&
    prev.config === next.config &&
    prev.markdownTheme === next.markdownTheme
  );
});

export type { MarkdownProps, MarkdownConfig, MarkdownTheme } from "./types";
