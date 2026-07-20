import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

/**
 * Markdown renderer for assistant messages. Grok emits a lot of fenced code,
 * so we wire up syntax highlighting and GFM (tables, task lists, strikethrough).
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown-body">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code(props) {
            // react-markdown v9: `inline` was removed. A fenced code block is
            // a <code> inside a <pre>; inline code is a bare <code>.
            const { className, children: codeChildren, node, ...rest } = props as any;
            const match = /language-(\w+)/.exec(className || "");
            const code = String(codeChildren).replace(/\n$/, "");
            const isBlock = node?.position?.start.line !== node?.position?.end.line || !!match;
            if (isBlock && match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: 0,
                    background: "var(--wb-bg-tertiary, #1e1e1e)",
                    borderRadius: 8,
                    fontSize: 12.5,
                  }}
                >
                  {code}
                </SyntaxHighlighter>
              );
            }
            return (
              <code className="md-inline-code" {...rest}>
                {codeChildren}
              </code>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
});
