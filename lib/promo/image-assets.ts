import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const FONTS = [
  { file: "Poppins-Bold.ttf", name: "Poppins", weight: 700 },
  { file: "Inter-Regular.ttf", name: "Inter", weight: 400 },
  { file: "Inter-Bold.ttf", name: "Inter", weight: 700 },
] as const;

function assetPath(...parts: string[]) {
  return join(process.cwd(), ...parts);
}

async function readArrayBuffer(path: string) {
  const bytes = new Uint8Array(await readFile(path));
  return bytes.buffer as ArrayBuffer;
}

async function loadPromoImageAssets() {
  const [logo, ...fonts] = await Promise.all([
    readFile(assetPath("img", "Logo.png")),
    ...FONTS.map(async (font) => ({
      name: font.name,
      data: await readArrayBuffer(assetPath("assets", "fonts", font.file)),
      weight: font.weight,
      style: "normal" as const,
    })),
  ]);

  return {
    fonts,
    logo: `data:image/png;base64,${logo.toString("base64")}`,
  };
}

let promoImageAssetsPromise: ReturnType<typeof loadPromoImageAssets> | undefined;

export function getPromoImageAssets() {
  promoImageAssetsPromise ??= loadPromoImageAssets();
  return promoImageAssetsPromise;
}
