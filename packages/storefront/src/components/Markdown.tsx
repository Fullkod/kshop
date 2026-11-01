import { buttonVariants, MessageCircle } from "@kshop/ui";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";

// Decision D7: restricted Markdown (no raw HTML, no images), rendered on the server. KSH0006 adds two blocks built
// from plain Markdown, so the store keeps writing text: a paragraph made only of links shows them as buttons, and the
// ### questions under a «Preguntas frecuentes» heading fold (<details>).
const ALLOWED = [
  "p",
  "strong",
  "em",
  "ul",
  "ol",
  "li",
  "a",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "br",
  "hr",
  "details",
  "summary",
];

// Minimal hast shapes (the plugin only reads tags, text and link targets).
type HastText = { type: "text"; value: string };
type HastElement = {
  type: "element";
  tagName: string;
  properties: Record<string, unknown>;
  children: HastNode[];
};
type HastNode = HastText | HastElement | { type: string };
type HastRoot = { type: "root"; children: HastNode[] };

export type ProseButton = "primary" | "secondary" | "whatsapp";

const isElement = (node: HastNode, tag?: string): node is HastElement =>
  node.type === "element" && (!tag || (node as HastElement).tagName === tag);
const isText = (node: HastNode): node is HastText => node.type === "text";
/** Text between the links of a button row: blanks, line breaks and separators like «·» or «|». */
const isFiller = (node: HastNode) =>
  (isText(node) && /^[\s·•|/-]*$/.test(node.value)) || isElement(node, "br");
const textOf = (node: HastNode): string =>
  isText(node) ? node.value : isElement(node) ? node.children.map(textOf).join("") : "";

export const isWhatsappHref = (href: string) => /^https?:\/\/(wa\.me|(api|web)\.whatsapp\.com)\//i.test(href);
const FAQ_HEADING = /preguntas|faq/i;

/** A paragraph of links only (and separators) becomes a row of buttons: the first one filled, the rest outlined. */
function markButtons(p: HastElement) {
  const links = p.children.filter((c): c is HastElement => isElement(c, "a"));
  if (!links.length || !p.children.every((c) => isElement(c, "a") || isFiller(c))) return;
  p.properties = { ...p.properties, className: ["sf-prose-actions"] };
  p.children = links;
  links.forEach((a, i) => {
    const href = String(a.properties.href ?? "");
    const kind: ProseButton = isWhatsappHref(href) ? "whatsapp" : i === 0 ? "primary" : "secondary";
    a.properties = { ...a.properties, dataButton: kind };
  });
}

/** After a «Preguntas frecuentes» h2, each h3 and what follows it (until the next h3/h2) folds into a <details>. */
function foldQuestions(root: HastRoot) {
  const out: HastNode[] = [];
  let inFaq = false;
  let open: HastElement | null = null;
  for (const node of root.children) {
    if (isElement(node, "h2")) {
      inFaq = FAQ_HEADING.test(textOf(node));
      open = null;
      out.push(node);
    } else if (inFaq && isElement(node, "h3")) {
      open = {
        type: "element",
        tagName: "details",
        properties: {},
        children: [{ type: "element", tagName: "summary", properties: {}, children: node.children }],
      };
      out.push(open);
    } else if (open && !(isText(node) && !node.value.trim())) {
      open.children.push(node);
    } else {
      out.push(node);
    }
  }
  root.children = out;
}

function rehypeStoreBlocks() {
  return (tree: HastRoot) => {
    for (const node of tree.children) if (isElement(node, "p")) markButtons(node);
    foldQuestions(tree);
  };
}

const BUTTON_VARIANT = { primary: "default", secondary: "outline", whatsapp: "whatsapp" } as const;

/** Store-written Markdown (pages, rich text section). A single line break is kept as written (KSH0006). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="sf-prose">
      <ReactMarkdown
        remarkPlugins={[remarkBreaks]}
        rehypePlugins={[rehypeStoreBlocks]}
        allowedElements={ALLOWED}
        unwrapDisallowed
        components={{
          a: ({ href, children: text, node }) => {
            const safe = href && /^(https?:\/\/|\/|mailto:|tel:)/.test(href) ? href : undefined;
            const external = safe?.startsWith("http");
            const button = node?.properties?.dataButton as ProseButton | undefined;
            return (
              <a
                href={safe}
                {...(external && { target: "_blank", rel: "noopener noreferrer" })}
                {...(button && {
                  "data-button": button,
                  className: `sf-btn ${buttonVariants({ variant: BUTTON_VARIANT[button] })}`,
                })}
              >
                {button === "whatsapp" && <MessageCircle size={18} aria-hidden />}
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
