import { ImageResponse } from "next/og";

/** Standard Open Graph size — what WhatsApp, iMessage, Slack, etc. expect. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

type OgImageInput = {
  appName: string;
  logoUrl: string | null;
};

/** Fetches the logo and inlines it as a data URI so satori (which renders
 *  `opengraph-image` routes) never has to fetch a remote URL mid-render.
 *  Also filters out SVG: satori can't reliably rasterize an arbitrary
 *  remote SVG via <img src>, so an SVG logo falls back to the text-only
 *  banner below rather than breaking the whole preview image. */
async function fetchLogoDataUri(logoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (contentType.includes("svg")) return null;
    const buf = await res.arrayBuffer();
    return `data:${contentType || "image/png"};base64,${Buffer.from(buf).toString("base64")}`;
  } catch {
    return null;
  }
}

/** The banner behind every public page's opengraph-image route — /apply,
 *  /apply/[slug], /confirm and /confirm/[slug] all reuse this one renderer,
 *  so any public link shares the same thumbnail treatment. This is what
 *  shows up as the link preview in WhatsApp/iMessage/etc. Kept deliberately
 *  simple (logo + name only): the page's own title and academic year are
 *  already carried by its og:title/description text, so repeating them
 *  here just added small, redundant text. Colors are the app's own
 *  --primary (a deep rose/maroon) rather than a generic gradient. */
export async function renderApplyOgImage({ appName, logoUrl }: OgImageInput) {
  const logoDataUri = logoUrl ? await fetchLogoDataUri(logoUrl) : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          background: "linear-gradient(135deg, #571922 0%, #d3455a 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori element, not a DOM <img>
          <img
            src={logoDataUri}
            width={220}
            height={220}
            style={{ borderRadius: 32, objectFit: "contain", background: "#fff", padding: 16 }}
          />
        ) : null}
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 700,
            color: "#fff",
            textAlign: "center",
            padding: "0 60px",
            lineHeight: 1.15,
          }}
        >
          {appName}
        </div>
      </div>
    ),
    OG_IMAGE_SIZE
  );
}
