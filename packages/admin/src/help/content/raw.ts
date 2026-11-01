import type { HelpContent } from "../types";
import { articles } from "./articles";
import { faq } from "./faq";
import { firstDay } from "./first-day";
import { glossary } from "./glossary";
import { screenshots } from "./screenshots";

export const HELP_VERSION = "1.0";

/**
 * The help content as written, before validation. The admin imports this one (no Zod in the bundle);
 * `./index.ts` validates it for tests and exporters, and `help:export` runs before every build.
 */
export const helpContentRaw: HelpContent = {
  version: HELP_VERSION,
  screenshots,
  firstDay,
  articles,
  glossary,
  faq,
};
