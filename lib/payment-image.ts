"use client";

export async function paymentImage(file: File) {
  const maxBytes = 5 * 1024 * 1024;
  if (!(file instanceof File) || !file.size || file.size > maxBytes ||
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPEG, PNG or WebP image up to 5 MB.");
  }
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const image = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85));
  if (!image || image.type !== "image/webp" || image.size > maxBytes) throw new Error("Could not convert this image to WebP.");
  return image;
}
