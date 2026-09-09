/** Fetches a file-download route client-side instead of navigating to it
 *  via a plain `<a href>`. Needed for any route that builds its whole
 *  response in memory before replying (a ZIP, say) — a plain link gives no
 *  feedback for however long that takes, so the caller can't show a
 *  spinner or stop a double-click. Returns an error string on failure, or
 *  null on success (the browser's save dialog/download bar takes over from
 *  there, same as a normal link). */
export async function downloadFile(url: string, fallbackFilename: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return "Could not reach the server. Check your connection and try again.";
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    return text || `Download failed (${res.status}).`;
  }

  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = disposition.match(/filename="?([^";]+)"?/);
  const filename = match?.[1] ?? fallbackFilename;

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);

  return null;
}
