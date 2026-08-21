/** Shared between the public form, the admin review sheet, and every server
 *  action that touches attachments — one source of truth so client-side
 *  validation can never drift from what the server actually enforces. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ATTACHMENTS = 2;
export const ALLOWED_ATTACHMENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];

/** The student's photograph — a single, compulsory image, distinct from the
 *  optional marksheet attachments above. Matches the storage bucket's own
 *  `file_size_limit` / `allowed_mime_types` (see migration), so a rejection
 *  reads the same client-side as it would server-side. */
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const ALLOWED_PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
