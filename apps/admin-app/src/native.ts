import { App } from "@capacitor/app";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Network } from "@capacitor/network";
import { Preferences } from "@capacitor/preferences";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { createIndexedDbPosStorage, type PosStorage, type QueuedSale } from "@kshop/admin";
import type { AuthStorage } from "@kshop/data";
import { useEffect, useState } from "react";

// Native pieces of the admin app (PRP-7 D8). In the browser (dev and QA) they fall back to the web.

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

/** Staff session in native storage (survives the WebView clearing its localStorage), PRP-7 D6. */
export const preferencesStorage: AuthStorage = {
  getItem: async (key) => (await Preferences.get({ key })).value,
  setItem: (key, value) => Preferences.set({ key, value }),
  removeItem: (key) => Preferences.remove({ key }),
};

/** Whether the phone says it has a connection (being connected does not promise that the internet answers). */
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

// One JSON file per sale in the app's private directory (PRP pos-offline D7): what costs money goes where the WebView
// cannot clear it, without an SQL engine. The catalog can be downloaded again, so it stays in IndexedDB.
const salesDir = (storeId: string) => `pos/${storeId}`;
const SALE_FILE = /^[0-9a-f-]{36}\.json$/;
const DEVICE_FILE = "pos/device.json";

async function readJsonFile<T>(path: string): Promise<T> {
  const { data } = await Filesystem.readFile({ path, directory: Directory.Data, encoding: Encoding.UTF8 });
  return JSON.parse(data as string) as T;
}

/** Written aside and renamed: a phone that dies halfway leaves the previous file or a stray .tmp, never half a sale. */
async function writeJsonFile(path: string, value: unknown) {
  const tmp = `${path}.tmp`;
  await Filesystem.writeFile({
    path: tmp,
    data: JSON.stringify(value),
    directory: Directory.Data,
    encoding: Encoding.UTF8,
    recursive: true,
  });
  await Filesystem.rename({ from: tmp, to: path, directory: Directory.Data, toDirectory: Directory.Data });
}

export function createNativePosStorage(): PosStorage {
  const web = createIndexedDbPosStorage();
  return {
    readCatalog: web.readCatalog,
    writeCatalog: web.writeCatalog,
    listSales: async (storeId) => {
      let names: string[];
      try {
        names = (await Filesystem.readdir({ path: salesDir(storeId), directory: Directory.Data })).files.map(
          (f) => f.name,
        );
      } catch {
        return []; // No sale has been saved yet: the folder does not exist.
      }
      const sales: QueuedSale[] = [];
      for (const name of names.filter((n) => SALE_FILE.test(n))) {
        sales.push(await readJsonFile<QueuedSale>(`${salesDir(storeId)}/${name}`));
      }
      return sales;
    },
    putSale: (storeId, sale) => writeJsonFile(`${salesDir(storeId)}/${sale.sale.id}.json`, sale),
    removeSale: async (storeId, saleId) => {
      await Filesystem.deleteFile({ path: `${salesDir(storeId)}/${saleId}.json`, directory: Directory.Data });
    },
    deviceId: async () => {
      try {
        return (await readJsonFile<{ id: string }>(DEVICE_FILE)).id;
      } catch {
        const id = crypto.randomUUID();
        await writeJsonFile(DEVICE_FILE, { id });
        return id;
      }
    },
  };
}

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
