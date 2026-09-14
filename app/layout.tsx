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

/** Base URL used to turn metadata fields (notably opengraph-image routes)
 *  into the fully-qualified URLs link previews require. No custom domain is
 *  attached, so this relies on Vercel's own env vars — no manual config
 *  needed: VERCEL_PROJECT_PRODUCTION_URL is the stable production alias
 *  (e.g. project-name.vercel.app), VERCEL_URL a per-deployment URL (used
 *  for preview deployments, and as a production fallback on older
 *  projects that predate that variable), then localhost for local dev.
 *  NEXT_PUBLIC_SITE_URL still wins if a real domain gets attached later. */
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/** Browser-tab title, site-wide — driven by Settings → Branding so it stays
 *  in sync with the name shown on the sign-in page and the public form. */
export async function generateMetadata(): Promise<Metadata> {
  const branding = await getPublicBranding();
  return {
    metadataBase: new URL(siteUrl),
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
