// In-app help (KSH0005): model, unvalidated content and generators, safe for the browser bundle (no Zod).
// The validated content lives in `@kshop/admin/help/content` for tests and the export script.
export * from "./types";
export * from "./lib/help-utils";
export * from "./lib/first-day-progress";
export * from "./lib/context";
export * from "./components/HelpButton";
export * from "./components/HelpCenter";
export type { HelpLinkComponent } from "./components/HelpLink";
export * from "./generators/markdown";
export * from "./generators/search-index";
export { helpContentRaw, HELP_VERSION } from "./content/raw";
