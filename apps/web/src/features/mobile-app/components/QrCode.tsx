"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** QR of a URL drawn in the browser (SVG). */
export function QrCode({ value, className }: { value: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toString(value, { type: "svg", margin: 1 }).then(setSvg, () => setSvg(null));
  }, [value]);
  return (
    <div
      className={`rounded-md bg-white p-2 [&>svg]:size-full ${className ?? "size-40"}`}
      role="img"
      aria-label={`Código QR de ${value}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}
