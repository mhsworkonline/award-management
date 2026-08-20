import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { getPublicBranding } from "@/lib/actions/organization";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

/** Browser-tab title, site-wide — driven by Settings → Branding so it stays
 *  in sync with the name shown on the sign-in page and the public form. */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicBranding();
  return {
    title: { default: branding.app_name, template: `%s · ${branding.app_name}` },
    description: "Annual student merit awards and prize distribution",
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#14161c" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
