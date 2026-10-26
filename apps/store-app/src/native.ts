import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import type { AuthStorage } from "@kshop/data";
import { useEffect, useState } from "react";

// Native pieces of the store app (PRP-7 D8). Every plugin also works in the browser (dev and QA), where it falls
// back to the web APIs.

export const isNative = Capacitor.isNativePlatform();

/** Customer session in native storage (survives the WebView clearing its localStorage), PRP-7 D6. */
export const preferencesStorage: AuthStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
};

export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    let active = true;
    void Network.getStatus().then((s) => active && setOnline(s.connected));
    const listener = Network.addListener("networkStatusChange", (s) => setOnline(s.connected));
    return () => {
      active = false;
      void listener.then((l) => l.remove());
    };
  }, []);
  return online;
}

/** Android back button: back in the app's history, out of the app only from the home page. */
export function useBackButton() {
  useEffect(() => {
    if (!isNative) return;
    const listener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.location.pathname !== "/") window.history.back();
      else void App.exitApp();
    });
    return () => void listener.then((l) => l.remove());
  }, []);
}

/** Status bar in the store's background color, with dark or light icons to match. */
export async function paintStatusBar(color: string) {
  if (!isNative) return;
  const hex = color.replace("#", "");
  const [r = 255, g = 255, b = 255] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  try {
    await StatusBar.setBackgroundColor({ color });
    await StatusBar.setStyle({ style: light ? Style.Light : Style.Dark });
  } catch {
    // Not every Android version lets the app paint the status bar.
  }
}
