import { ImageResponse } from "next/og";

/** Standard Open Graph size — what WhatsApp, iMessage, Slack, etc. expect. */
export const OG_IMAGE_SIZE = { width: 1200, height: 630 } as const;

type OgImageInput = {
  appName: string;
  logoUrl: string | null;
  heading: string;
  subheading?: string | null;
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

/** The banner behind /apply and /apply/[slug]'s opengraph-image routes —
 *  this is what shows up as the link preview thumbnail in WhatsApp. */
export async function renderApplyOgImage({ appName, logoUrl, heading, subheading }: OgImageInput) {
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
          gap: 24,
          background: "linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)",
          fontFamily: "sans-serif",
        }}
      >
        {logoDataUri ? (
          // eslint-disable-next-line @next/next/no-img-element -- satori element, not a DOM <img>
          <img
            src={logoDataUri}
            width={140}
            height={140}
            style={{ borderRadius: 28, objectFit: "contain", background: "#fff", padding: 12 }}
          />
        ) : null}
        <div style={{ display: "flex", fontSize: 56, color: "#fff", textAlign: "center", padding: "0 60px" }}>
          {appName}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "rgba(255,255,255,0.85)",
            textAlign: "center",
            padding: "0 80px",
          }}
        >
          {heading}
        </div>
        {subheading ? (
          <div style={{ display: "flex", fontSize: 22, color: "rgba(255,255,255,0.65)" }}>{subheading}</div>
        ) : null}
      </div>
    ),
    OG_IMAGE_SIZE
  );
}
