"use client";

import { useSyncExternalStore } from "react";

const noSubscribe = () => () => {};

/** The current year, read in the browser (prerendered pages cannot read the clock): empty on the server. */
export function CurrentYear() {
  const year = useSyncExternalStore(
    noSubscribe,
    () => new Date().getFullYear(),
    () => null,
  );
  return year === null ? null : <>{year} </>;
}
