import { Truck, type LucideIcon } from "@kshop/ui";
import { Link } from "../navigation";

/**
 * Thin band above the header (home section `announcement_bar`, wired in R5). Phones show only the main text; wider
 * screens add the secondary text and the link.
 */
export function AnnouncementBar({
  text,
  secondary,
  link,
  icon: Icon = Truck,
}: {
  text: string;
  secondary?: string | null;
  link?: { href: string; label: string } | null;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5 bg-ink px-[clamp(16px,4.4cqw,56px)] py-2.5 text-center text-[13px] font-medium text-ink-foreground">
      <Icon size={16} aria-hidden className="shrink-0" />
      <span>{text}</span>
      {(secondary || link) && (
        <span className="hidden items-center gap-2.5 @min-[720px]:flex">
          <span aria-hidden className="opacity-50">
            ·
          </span>
          {secondary && <span>{secondary}</span>}
          {link && (
            <Link href={link.href} className="font-semibold text-secondary">
              {link.label}
            </Link>
          )}
        </span>
      )}
    </div>
  );
}
