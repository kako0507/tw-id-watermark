function isHeic(file) {
  return /\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/i.test(file.type);
}

export async function decodeImage(file) {
  try {
    // Safari decodes HEIC natively; EXIF orientation is applied automatically
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    if (!isHeic(file)) throw new Error("無法讀取這個檔案，可能不是圖片");
  }
  // Other browsers load the HEIC converter on demand (separate chunk)
  const { default: heic2any } = await import("heic2any");
  let blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.95 });
  if (Array.isArray(blob)) blob = blob[0];
  return createImageBitmap(blob, { imageOrientation: "from-image" });
}
