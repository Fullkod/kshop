import { App } from "@capacitor/app";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { StatusBar, Style } from "@capacitor/status-bar";
import type { AuthStorage } from "@kshop/data";
import { useEffect } from "react";

// Native pieces of the admin app (PRP-7 D8). In the browser (dev and QA) they fall back to the web.

export const isNative = Capacitor.isNativePlatform();

/** Staff session in native storage (survives the WebView clearing its localStorage), PRP-7 D6. */
export const preferencesStorage: AuthStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
};

/** Camera or gallery (the phone asks); the photo is then compressed to WebP like any other upload. */
export async function takePhoto(): Promise<File | null> {
  const photo = await Camera.getPhoto({
    source: CameraSource.Prompt,
    resultType: CameraResultType.Uri,
    quality: 90,
    promptLabelHeader: "Foto del producto",
    promptLabelPhoto: "Elegir de la galería",
    promptLabelPicture: "Hacer una foto",
    promptLabelCancel: "Cancelar",
  });
  if (!photo.webPath) return null;
  const blob = await (await fetch(photo.webPath)).blob();
  const format = photo.format || "jpeg";
  return new File([blob], `foto.${format}`, { type: blob.type || `image/${format}` });
}

/** Android back button: back in the app's history, out of the app only from the home screen. */
export function useBackButton() {
  useEffect(() => {
    if (!isNative) return;
    const listener = App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack && window.location.pathname !== "/admin") window.history.back();
      else void App.exitApp();
    });
    return () => void listener.then((l) => l.remove());
  }, []);
}

/** Kshop night status bar with light icons. */
export async function paintStatusBar() {
  if (!isNative) return;
  try {
    await StatusBar.setBackgroundColor({ color: "#24104F" });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // Not every Android version lets the app paint the status bar.
  }
}
