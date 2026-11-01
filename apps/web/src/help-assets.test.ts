import { existsSync } from "node:fs";
import { join } from "node:path";
import { HELP_PDF_FILE, helpContentRaw } from "@kshop/admin/help";
import { describe, expect, it } from "vitest";

// KSH0005: the help ships its screenshots and PDF in public/help/ (pnpm help:shots, pnpm help:pdf).
const PUBLIC_HELP = join(__dirname, "..", "public", "help");

describe("help assets", () => {
  it("has a PNG for every declared screenshot", () => {
    const missing = helpContentRaw.screenshots
      .map((s) => s.slug)
      .filter((slug) => !existsSync(join(PUBLIC_HELP, "screens", `${slug}.png`)));
    expect(missing, "run pnpm help:shots").toEqual([]);
  });

  it("has the PDF", () => {
    expect(existsSync(join(PUBLIC_HELP, HELP_PDF_FILE)), "run pnpm help:pdf").toBe(true);
  });
});
