import type { ComponentType, ReactNode } from "react";

/**
 * The router's link of whoever mounts the help (Next on the web, react-router in Kshop Admin): a plain <a> would
 * reload the app. In-page anchors (#guia-…) stay plain <a>.
 */
export type HelpLinkComponent = ComponentType<{
  href: string;
  className?: string;
  onClick?: () => void;
  children: ReactNode;
}>;
