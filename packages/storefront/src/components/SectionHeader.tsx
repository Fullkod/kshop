import { ArrowRight } from "@kshop/ui";
import type { ReactNode } from "react";
import { Link } from "../navigation";

/** Small uppercase line above a title (accent color unless told otherwise). */
export const Eyebrow = ({
  children,
  className = "text-primary",
}: {
  children: ReactNode;
  className?: string;
}) => (
  <span className={`text-xs leading-none font-bold tracking-[.1em] uppercase ${className}`}>{children}</span>
);

export const sectionTitle = "sf-heading text-[clamp(24px,2.6cqw,34px)] leading-[1.1] font-bold text-balance";

/** Header of a home section: eyebrow and title on the left; «Ver todo» (and carousel arrows from 720 px) on the right. */
export function SectionHeader({
  eyebrow,
  title,
  href,
  hrefLabel = "Ver todo",
  children,
}: {
  eyebrow?: string | null;
  title: string;
  href?: string;
  hrefLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4 px-[clamp(16px,4.4cqw,56px)]">
      <div className="flex flex-col gap-1.5">
        {eyebrow && <Eyebrow>{eyebrow}</Eyebrow>}
        <h2 className={sectionTitle}>{title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {href && (
          <Link
            href={href}
            className="mr-1.5 flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap"
          >
            {hrefLabel}
            <ArrowRight size={16} aria-hidden />
          </Link>
        )}
        {children && <div className="hidden gap-2 @min-[720px]:flex">{children}</div>}
      </div>
    </div>
  );
}
