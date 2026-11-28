"use client";

export type PaymentImageErrorCode = "IMAGE_UNREADABLE" | "IMAGE_TOO_LARGE" | "IMAGE_TYPE";

export class PaymentImageError extends Error {
  readonly code: PaymentImageErrorCode;

  constructor(code: PaymentImageErrorCode) {
    super(code);
    this.code = code;
  }
}

async function decode(file: File) {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // The browser's image element can support additional formats.
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const source = new Image();
    source.src = url;
    await source.decode();
    return { source, width: source.naturalWidth, height: source.naturalHeight, release: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    const looksLikeImage = /^image\//i.test(file.type) || /\.(avif|bmp|gif|heic|heif|ico|jpe?g|jfif|png|svg|tiff?|webp)$/i.test(file.name);
    throw new PaymentImageError(looksLikeImage ? "IMAGE_UNREADABLE" : "IMAGE_TYPE");
  }
}

export async function paymentImage(file: File): Promise<Blob> {
  if (!file.size) throw new PaymentImageError("IMAGE_UNREADABLE");
  if (file.size > 25 * 1024 * 1024) throw new PaymentImageError("IMAGE_TOO_LARGE");

  const decoded = await decode(file);
  const canvas = document.createElement("canvas");
  try {
    const context = canvas.getContext("2d");
    if (!context || !decoded.width || !decoded.height) throw new PaymentImageError("IMAGE_UNREADABLE");

    let format = "image/webp";
    let encoded = false;
    for (const longestSide of [2000, 1400, 1000]) {
      const scale = Math.min(1, longestSide / Math.max(decoded.width, decoded.height));
      canvas.width = Math.max(1, Math.round(decoded.width * scale));
      canvas.height = Math.max(1, Math.round(decoded.height * scale));
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.85, 0.7, 0.6]) {
        let blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, format, quality));
        if (format === "image/webp" && blob?.type !== format) {
          format = "image/jpeg";
          blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, format, quality));
        }
        if (blob?.type !== format || !blob.size) continue;
        encoded = true;
        if (blob.size <= 5 * 1024 * 1024) return blob;
      }
    }
    throw new PaymentImageError(encoded ? "IMAGE_TOO_LARGE" : "IMAGE_UNREADABLE");
  } catch (error) {
    if (error instanceof PaymentImageError) throw error;
    throw new PaymentImageError("IMAGE_UNREADABLE");
  } finally {
    decoded.release();
    canvas.width = canvas.height = 0;
  }
}
