"use client";

import { useEffect, useState } from "react";

/** Whether the window matches a media query; `initial` is what the server render assumes. */
export function useMediaQuery(query: string, initial = true): boolean {
  const [matches, setMatches] = useState(initial);
  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [query]);
  return matches;
}
