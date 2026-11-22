import QRCode from "qrcode";


export const quiet = 4;
export const qrBlue = "#0A3D91";

export function pickupQrShape(url: string) {
  const matrix = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = matrix.modules.size;
  const modules: [number, number][] = [];
  const finders = [[0, 0], [size - 7, 0], [0, size - 7]];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (matrix.modules.get(y, x) && !finders.some(([fx, fy]) => x >= fx && y >= fy && x < fx + 7 && y < fy + 7)) {
        modules.push([x, y]);
      }
    }
  }
  return { modules, finders, size, side: size + quiet * 2, logoRadius: matrix.version > 3 ? size * 0.071 : 0 };
}

export function pickupQrMarkup(url: string, logo: string) {
  const { modules, finders, side, size, logoRadius } = pickupQrShape(url);
  const dots = modules.map(([x, y]) => `<rect x="${x}" y="${y}" width="1" height="1" rx=".34"/>`).join("");
  const eyes = finders.map(([x, y]) => `<g transform="translate(${x} ${y})"><rect width="7" height="7" rx=".65"/><rect x="1" y="1" width="5" height="5" rx=".35" fill="white"/><rect x="2" y="2" width="3" height="3" rx=".4"/></g>`).join("");
  const center = (size - logoRadius * 2) / 2;
  const brand = logoRadius ? `<circle cx="${size / 2}" cy="${size / 2}" r="${logoRadius * 1.12}" fill="white"/><clipPath id="pickup-logo-clip"><circle cx="${size / 2}" cy="${size / 2}" r="${logoRadius}"/></clipPath><image href="${logo}" x="${center}" y="${center}" width="${logoRadius * 2}" height="${logoRadius * 2}" clip-path="url(#pickup-logo-clip)"/>` : "";
  return { side, content: `<rect width="${side}" height="${side}" fill="white"/><g fill="${qrBlue}" transform="translate(${quiet} ${quiet})">${dots}${eyes}${brand}</g>` };
}
