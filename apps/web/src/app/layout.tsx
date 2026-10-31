import type { Metadata, Viewport } from "next";
import { DM_Sans, Inter, JetBrains_Mono, Lora, Outfit, Playfair_Display, Poppins } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
// Only the admin's codes use it (order numbers, hex): not preloaded on every page.
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  preload: false,
});
// Store theme fonts (decision D3): not preloaded, the browser only downloads the ones a store uses.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", preload: false });
const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
  preload: false,
});
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", preload: false });
const playfair = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair-display",
  preload: false,
});

export const metadata: Metadata = {
  title: { default: "Kshop", template: "%s · Kshop" },
  description:
    "Tu tienda online con subdominio propio, catálogo, pedidos por WhatsApp y panel de administración.",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/apple-touch-icon.png",
  },
  manifest: "/site.webmanifest",
};

// viewport-fit: the bars that pad with env(safe-area-inset-*) get real values on an iPhone.
export const viewport: Viewport = { themeColor: "#24104F", viewportFit: "cover" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={[outfit, dmSans, jetbrainsMono, inter, poppins, lora, playfair]
        .map((f) => f.variable)
        .join(" ")}
    >
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
