import { HELP_MARKDOWN_FILES, helpToMarkdown } from "@kshop/admin/help";
import { helpContent } from "@kshop/admin/help/content";
import { platformProtocol, publicEnv } from "@/env";

// KSH0005: the help as Markdown, built at build time from the validated content (an invalid guide fails the build).
// Paths with an extension skip the proxy, so `/help/…` answers on the platform and on every store host alike.

export function generateStaticParams() {
  return Object.keys(HELP_MARKDOWN_FILES).map((file) => ({ file }));
}

export async function GET(_request: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const options = HELP_MARKDOWN_FILES[file];
  if (!options) return new Response("Not found", { status: 404 });
  // Absolute screenshot URLs: the downloaded file is read outside the web.
  const screenshotBase = `${platformProtocol}://${publicEnv.platformDomain}`;
  return new Response(helpToMarkdown(helpContent, { ...options, screenshotBase }), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `inline; filename="${file}"`,
    },
  });
}
