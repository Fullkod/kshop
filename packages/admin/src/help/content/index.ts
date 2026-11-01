import { validateHelpContent } from "../schemas/help";
import type { HelpContent } from "../types";
import { helpContentRaw } from "./raw";

export { HELP_VERSION } from "./raw";

/**
 * The single source of truth, validated at module load: a broken reference, an unused screenshot or a stray
 * voseo form fails the tests and the export on purpose.
 */
export const helpContent: HelpContent = validateHelpContent(helpContentRaw);
