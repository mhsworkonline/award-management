import imageCompression from "browser-image-compression";

/** Client-side image compression, applied before anything ever reaches
 *  Storage. Two presets: the student photograph (an ID photo — safe to shrink
 *  hard) and marksheet attachments that happen to be images rather than a
 *  PDF/DOCX (staff read percentages/grades off these, so legibility matters
 *  more than squeezing out the last kilobyte).
 *
 *  `useWebWorker` is deliberately left at its default `false` here — the
 *  library's worker mode loads its own script into the worker via
 *  `importScripts()` from a jsDelivr CDN URL unless you supply a
 *  self-hosted `libURL`, which this app doesn't. Turning that on would make
 *  every photo/marksheet upload depend on an external CDN being reachable —
 *  a bad trade for the brief main-thread block compressing one file avoids.
 *  These are one-off interactive uploads (a person just picked a file), not a
 *  bulk job, so the block is short and already covered by the existing
 *  "Uploading…" busy state in every form that calls these. */

const PHOTO_OPTIONS = {
  maxWidthOrHeight: 800,
  maxSizeMB: 0.2,
  initialQuality: 0.8,
  useWebWorker: false,
};

const MARKSHEET_IMAGE_OPTIONS = {
  maxWidthOrHeight: 1600,
  maxSizeMB: 0.8,
  initialQuality: 0.85,
  useWebWorker: false,
};

/** Sanity cap on the *source* file before compression is even attempted — a
 *  guard against something absurd (a 40MP raw camera dump) tying up the
 *  main thread, independent of the much smaller post-compression limits
 *  every upload path still enforces as a hard backstop. */
export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

/** Resizes/re-encodes the student's photograph to ~800px long edge, ~150-200KB.
 *  Throws on failure — callers should show an error and refuse to upload
 *  rather than silently falling back to the uncompressed original (which
 *  could exceed the bucket's hard size limit). */
export function compressStudentPhoto(file: File): Promise<File> {
  return imageCompression(file, PHOTO_OPTIONS);
}

/** Resizes/re-encodes an image-type marksheet attachment to ~1600px long
 *  edge, ~800KB — enough to keep printed marks legible while still cutting a
 *  typical 5-8MB phone photo down by 5-10x. PDF/DOCX attachments never go
 *  through this; they aren't images. */
export function compressMarksheetImage(file: File): Promise<File> {
  return imageCompression(file, MARKSHEET_IMAGE_OPTIONS);
}
