import { App } from "@capacitor/app";
import { Capacitor } from "@capacitor/core";
import { FileTransfer } from "@capacitor/file-transfer";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import type { AuthStorage } from "@kshop/data";
import { FileOpener } from "@capawesome-team/capacitor-file-opener";
import { useEffect, useState } from "react";

// Native pieces of the store app (PRP-7 D8). Every plugin also works in the browser (dev and QA), where it falls
// back to the web APIs.

export const isNative = Capacitor.isNativePlatform();

/** The native splash stays until the first real screen is ready (launchAutoHide: false), at most 8 s. */
export function hideSplash() {
  if (isNative) void SplashScreen.hide().catch(() => {});
}
if (isNative) setTimeout(hideSplash, 8000);

/** Hides the splash once `ready` (by default, when the calling screen mounts). */
export function useHideSplash(ready = true) {
  useEffect(() => {
    if (ready) hideSplash();
  }, [ready]);
}

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

/**
 * Downloads an APK into the cache and opens the Android installer (KSH0008); signed with the same key, it updates
 * this app in place and keeps its data. Android asks once to allow installing apps from this one. In the browser the
 * APK just opens.
 */
export async function installApk(url: string, onProgress: (fraction: number | null) => void) {
  if (!isNative) {
    window.location.href = url;
    return;
  }
  const { uri } = await Filesystem.getUri({ directory: Directory.Cache, path: "kshop-update.apk" });
  const listener = await FileTransfer.addListener("progress", (p) =>
    onProgress(p.lengthComputable && p.contentLength > 0 ? p.bytes / p.contentLength : null),
  );
  try {
    await FileTransfer.downloadFile({ url, path: uri, progress: true });
  } finally {
    await listener.remove();
  }
  await FileOpener.openFile({ path: uri, mimeType: "application/vnd.android.package-archive" });
}

/** Runs `onResume` each time the app comes back to the foreground (the browser: the tab becomes visible). */
export function useOnResume(onResume: () => void) {
  useEffect(() => {
    if (!isNative) {
      const onVisible = () => document.visibilityState === "visible" && onResume();
      document.addEventListener("visibilitychange", onVisible);
      return () => document.removeEventListener("visibilitychange", onVisible);
    }
    const listener = App.addListener("appStateChange", ({ isActive }) => isActive && onResume());
    return () => void listener.then((l) => l.remove());
  }, [onResume]);
}
