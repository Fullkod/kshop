"use client";

import { Check, ShoppingBag, X } from "@kshop/ui";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "../navigation";
import { CountBadge, useCart } from "./CartProvider";
import {
  CartLines,
  CartSummary,
  EmptyCart,
  FreeShippingBar,
  VoucherForm,
  type FreeShipping,
} from "./CartView";

// After adding to the cart: from 720 px the CartDrawer opens (side panel); on phones a toast confirms it and the
// header and tab bar counters change. The /cart page stays for links, the app's tab and no-JS.

type Added = { name: string; detail: string | null };
type CartUiValue = {
  openCart: () => void;
  /** Feedback for a line just added (drawer on wide screens, toast on phones). */
  added: (item: Added) => void;
};

const CartUiContext = createContext<CartUiValue | null>(null);

const WIDE = "(min-width: 720px)";

export function CartUiProvider({
  freeShipping,
  children,
}: {
  freeShipping: FreeShipping;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<Added | null>(null);

  const openCart = useCallback(() => {
    if (!dialog.current?.open) dialog.current?.showModal();
    setOpen(true);
  }, []);
  const closeCart = useCallback(() => dialog.current?.close(), []);

  const added = useCallback(
    (item: Added) => {
      if (window.matchMedia(WIDE).matches) openCart();
      else setToast(item);
    },
    [openCart],
  );

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const value = useMemo(() => ({ openCart, added }), [openCart, added]);
  return (
    <CartUiContext.Provider value={value}>
      {children}
      <dialog
        ref={dialog}
        aria-label="Carrito"
        onClose={() => setOpen(false)}
        onClick={(e) => {
          // A click on the backdrop (the dialog box itself, outside the panel) closes it.
          if (e.target === e.currentTarget) closeCart();
        }}
        className="m-0 mt-auto h-[90dvh] max-h-none w-full max-w-none rounded-t-sf-lg bg-background p-0 text-foreground shadow-sf-lg backdrop:bg-[color-mix(in_srgb,var(--ink)_55%,transparent)] min-[720px]:mt-0 min-[720px]:ml-auto min-[720px]:h-dvh min-[720px]:w-[420px] min-[720px]:rounded-t-none min-[720px]:rounded-l-sf-lg"
      >
        {open && <DrawerContent freeShipping={freeShipping} onClose={closeCart} />}
      </dialog>
      {toast && <AddedToast item={toast} onClose={() => setToast(null)} />}
    </CartUiContext.Provider>
  );
}

export function useCartUi(): CartUiValue {
  const value = useContext(CartUiContext);
  if (!value) throw new Error("useCartUi must be used inside <CartUiProvider>");
  return value;
}

function DrawerContent({ freeShipping, onClose }: { freeShipping: FreeShipping; onClose: () => void }) {
  const { cart, count } = useCart();
  return (
    <div className="flex h-full flex-col" data-testid="cart-drawer">
      <div className="flex items-center justify-between border-b border-border px-5 py-4">
        <h2 className="sf-heading text-[19px] font-bold">
          Tu carrito{count > 0 && <span className="text-muted-foreground"> · {count}</span>}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar el carrito"
          className="flex size-11 items-center justify-center rounded-full hover:bg-surface"
        >
          <X size={20} aria-hidden />
        </button>
      </div>
      {!cart ? (
        <p className="py-12 text-center text-muted-foreground">Cargando…</p>
      ) : cart.lines.length === 0 ? (
        <EmptyCart onBrowse={onClose} />
      ) : (
        <>
          <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-4">
            <FreeShippingBar cart={cart} freeShipping={freeShipping} />
            <CartLines cart={cart} onNavigate={onClose} />
            {cart.vouchersEnabled && <VoucherForm />}
          </div>
          <div className="border-t border-border px-5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
            <CartSummary cart={cart} onCheckout={onClose} />
          </div>
        </>
      )}
    </div>
  );
}

function AddedToast({ item, onClose }: { item: Added; onClose: () => void }) {
  return (
    <div
      role="status"
      data-testid="added-toast"
      className="fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-40 flex items-center gap-3 rounded-sf bg-ink px-3.5 py-3 text-ink-foreground shadow-sf-lg"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-white">
        <Check size={18} aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col text-sm">
        <strong>Añadido al carrito</strong>
        <span className="truncate text-ink-muted">
          {[item.name, item.detail].filter(Boolean).join(" · ")}
        </span>
      </span>
      <Link href="/cart" onClick={onClose} className="shrink-0 text-sm font-semibold text-secondary">
        Ver carrito
      </Link>
    </div>
  );
}

/** Header link to the cart (filled, with the number of units). */
export function CartLink() {
  const { count } = useCart();
  const ui = useContext(CartUiContext);
  return (
    <Link
      href="/cart"
      onClick={(e) => {
        // Wide screens open the drawer; phones (and no provider) go to /cart.
        if (!ui || !window.matchMedia(WIDE).matches) return;
        e.preventDefault();
        ui.openCart();
      }}
      className="ml-1 flex h-11 min-w-11 items-center justify-center gap-2 rounded-sf-btn bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
      aria-label={count ? `Carrito, ${count} ${count === 1 ? "producto" : "productos"}` : "Carrito"}
    >
      <ShoppingBag size={19} aria-hidden />
      {count > 0 && <CountBadge count={count} />}
    </Link>
  );
}
