import QRCode from "qrcode";

/** Renders a QR code for any URL as a PNG data URL. Generated entirely
 *  client-side via the `qrcode` package — no third-party API call, so this
 *  never depends on network access or an external service's rate limits.
 *  Generic on purpose: every "give me a QR for X" need is a call to this
 *  with a different URL, not a new implementation. */
export async function generateQrCodeDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, {
    width: 512,
    margin: 2,
    color: { dark: "#000000", light: "#ffffff" },
  });
}
