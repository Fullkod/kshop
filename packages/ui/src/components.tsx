import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "./cn";

// Shared by the admin (Kshop brand on :root) and the storefront (store theme on .sf-root): every color and radius is a
// theme variable, so the same atom follows whichever palette surrounds it.
const focusRing = "outline-none focus-visible:shadow-[0_0_0_4px_var(--ring)]";

const buttonCva = cva(
  `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-sf-btn [&_svg]:shrink-0 font-semibold transition-colors disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 ${focusRing}`,
  {
    variants: {
      variant: {
        default: "bg-primary font-bold text-primary-foreground hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-foreground hover:opacity-92",
        outline: "border-[1.5px] border-border bg-background text-foreground hover:border-foreground",
        ghost: "bg-transparent text-primary hover:bg-accent-soft",
        whatsapp: "bg-whatsapp text-white hover:opacity-92",
        whatsappOutline:
          "border-[1.5px] border-whatsapp text-whatsapp hover:bg-[color-mix(in_srgb,var(--wa)_8%,transparent)]",
        inverse: "bg-primary-foreground text-primary hover:opacity-92",
        destructive: "bg-destructive text-background hover:bg-destructive/90",
      },
      size: {
        default: "h-11 px-[18px] text-sm",
        // Fingers (coarse pointer) get a taller small button; a mouse keeps the dense one.
        sm: "h-9 px-3.5 text-[13px] touch:h-10",
        lg: "h-13 px-6 text-base",
        icon: "size-11 shrink-0",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

/** Button classes; a `className` passed here is merged (tailwind-merge), so it can override a size or color. */
export const buttonVariants = (props?: Parameters<typeof buttonCva>[0]) => cn(buttonCva(props));

export function Button({
  className,
  variant,
  size,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

const fieldClasses = `flex w-full rounded-sf-btn border border-border bg-background px-3.5 text-[15px] focus-visible:border-[1.5px] focus-visible:border-primary aria-invalid:border-[1.5px] aria-invalid:border-destructive disabled:opacity-50 ${focusRing}`;

export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input className={cn(fieldClasses, "h-11 placeholder:text-muted-foreground", className)} {...props} />
  );
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select className={cn(fieldClasses, "h-11 cursor-pointer", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label className={cn("text-sm font-medium", className)} {...props} />;
}

export function FieldError({ children }: { children?: string | null }) {
  if (!children) return null;
  return <p className="text-[12.5px] text-destructive">{children}</p>;
}

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-xl border bg-background p-6 shadow-sm", className)} {...props} />;
}

export const badgeVariants = cva("inline-flex items-center gap-1 whitespace-nowrap text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-accent-soft text-primary",
      secondary: "bg-secondary text-secondary-foreground",
      sale: "bg-sale font-bold text-sale-foreground",
      success: "bg-success-soft text-success",
      warning: "bg-warning-soft text-warning",
      destructive: "bg-destructive-soft text-destructive",
      muted: "bg-surface text-muted-foreground",
      outline: "border border-border bg-background text-foreground",
      gold: "bg-gold text-night",
    },
    // pill = statuses; tag = product labels on photos and cards.
    shape: {
      pill: "rounded-full px-2.5 py-0.5",
      tag: "rounded-sf-sm px-2 py-1.5",
    },
  },
  defaultVariants: { variant: "default", shape: "pill" },
});

export function Badge({
  className,
  variant,
  shape,
  ...props
}: ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant, shape }), className)} {...props} />;
}

export function Alert({
  className,
  variant = "default",
  ...props
}: ComponentProps<"div"> & { variant?: "default" | "destructive" | "success" | "warning" | "info" }) {
  return (
    <div
      role="alert"
      className={cn(
        "rounded-sf border px-3.5 py-3 text-sm",
        variant === "destructive" && "border-destructive/40 bg-destructive-soft text-destructive",
        variant === "success" && "border-success/40 bg-success-soft text-success",
        variant === "warning" && "border-warning/40 bg-warning-soft text-warning",
        variant === "info" && "border-transparent bg-accent-soft text-foreground",
        variant === "default" && "bg-surface",
        className,
      )}
      {...props}
    />
  );
}

/** Tabs / segmented control: a row of options, one active. Works with buttons (onSelect) or links (href). */
export function Segmented<T extends string>({
  options,
  value,
  onSelect,
  className,
  label,
}: {
  options: readonly { value: T; label: ReactNode; href?: string }[];
  value: T;
  onSelect?: (value: T) => void;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex gap-1 rounded-sf-btn bg-surface p-1", className)}
    >
      {options.map((option) => {
        const active = option.value === value;
        const classes = cn(
          "inline-flex cursor-pointer items-center justify-center rounded-[calc(var(--sf-btn-radius)-2px)] px-3.5 py-[9px] text-sm transition-colors touch:min-h-10",
          focusRing,
          active
            ? "bg-background font-semibold text-foreground shadow-sf"
            : "text-muted-foreground hover:text-foreground",
        );
        return option.href ? (
          <a
            key={option.value}
            href={option.href}
            aria-current={active ? "page" : undefined}
            className={classes}
          >
            {option.label}
          </a>
        ) : (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect?.(option.value)}
            className={classes}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** Filter chip (listings, categories). Active chips are inverted; `chipVariants` also styles links. */
export const chipVariants = cva(
  `inline-flex h-[34px] shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13px] font-medium transition-colors touch:h-10 ${focusRing}`,
  {
    variants: {
      active: {
        true: "bg-foreground text-background",
        false: "border border-border bg-background text-foreground hover:border-foreground",
      },
    },
    defaultVariants: { active: false },
  },
);

export function Chip({
  className,
  active,
  ...props
}: ComponentProps<"button"> & VariantProps<typeof chipVariants>) {
  return <button type="button" className={cn(chipVariants({ active }), className)} {...props} />;
}
