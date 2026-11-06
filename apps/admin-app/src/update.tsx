import { AppUpdateBanner, type AppUpdate } from "@kshop/ui";
import { useCallback, useEffect, useState } from "react";
import { appConfig } from "./config";
import { installApk, useOnResume, useOnline } from "./native";

// KSH0008: Kshop Admin tells when a newer version is published (Superadmin › Apps) and installs it from the banner.

type Latest = { version_code: number; version_name: string; apk_path: string; size_bytes: number | null };

const apkUrl = (path: string) => `${appConfig.supabaseUrl}/storage/v1/object/public/store-apps/${path}`;

/** The latest published Kshop Admin when it is newer than this one; checked on open and on coming back to it. */
function useNewerVersion(): Latest | null {
  const online = useOnline();
  const [latest, setLatest] = useState<Latest | null>(null);
  const check = useCallback(() => {
    if (!online) return;
    void fetch(`${appConfig.supabaseUrl}/rest/v1/rpc/app_info`, {
      method: "POST",
      headers: {
        apikey: appConfig.supabaseKey,
        Authorization: `Bearer ${appConfig.supabaseKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_store_id: null }),
    })
      .then((res) => (res.ok ? (res.json() as Promise<{ latest: Latest | null }>) : null))
      .then((info) => info && setLatest(info.latest))
      // Without an answer nothing is shown: the counter keeps working.
      .catch(() => {});
  }, [online]);
  useEffect(check, [check]);
  useOnResume(check);
  return latest && latest.version_code > appConfig.versionCode ? latest : null;
}

export function UpdateBanner({ className }: { className?: string }) {
  const latest = useNewerVersion();
  // «Luego» hides it until the app is opened again.
  const [later, setLater] = useState<number | null>(null);
  if (!latest || later === latest.version_code) return null;
  const update: AppUpdate = { versionName: latest.version_name, sizeBytes: latest.size_bytes };
  return (
    <AppUpdateBanner
      update={update}
      appName="Kshop Admin"
      install={(onProgress) => installApk(apkUrl(latest.apk_path), onProgress)}
      onLater={() => setLater(latest.version_code)}
      className={className}
    />
  );
}
