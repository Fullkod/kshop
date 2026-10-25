import ReactMarkdown from "react-markdown";

// Decision D7: restricted Markdown (no raw HTML, no images), rendered on the server.
const ALLOWED = ["p", "strong", "em", "ul", "ol", "li", "a", "h2", "h3", "h4", "blockquote", "br", "hr"];

export function Markdown({ children }: { children: string }) {
  return (
    <div className="sf-prose">
      <ReactMarkdown
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          a: ({ href, children: text }) => {
            const safe = href && /^(https?:\/\/|\/|mailto:|tel:)/.test(href) ? href : undefined;
            const external = safe?.startsWith("http");
            return (
              <a href={safe} {...(external && { target: "_blank", rel: "noopener noreferrer" })}>
                {text}
              </a>
            );
          },
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
