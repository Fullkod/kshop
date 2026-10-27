import type { BenefitIcon } from "@kshop/core";
import type { Announcement } from "@kshop/data";
import {
  Banknote,
  Clock,
  Gift,
  type LucideIcon,
  MessageCircle,
  RefreshCcw,
  ShieldCheck,
  Store,
  Truck,
} from "@kshop/ui";
import { Link } from "../navigation";

/** Icons the owner picks for benefits and the announcement (names from @kshop/core). */
export const BENEFIT_ICON: Record<BenefitIcon, LucideIcon> = {
  truck: Truck,
  banknote: Banknote,
  "message-circle": MessageCircle,
  "refresh-ccw": RefreshCcw,
  "shield-check": ShieldCheck,
  clock: Clock,
  gift: Gift,
  store: Store,
};

/** The store's announcement (first visible `announcement_bar` section, read with the shell). */
export const StoreAnnouncement = ({ announcement }: { announcement: Announcement | null }) =>
  announcement && (
    <AnnouncementBar
      text={announcement.text}
      secondary={announcement.secondaryText}
      link={announcement.link}
      icon={BENEFIT_ICON[announcement.icon]}
    />
  );

/**
 * Thin band above the header (home section `announcement_bar`). Phones show only the main text; wider
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
