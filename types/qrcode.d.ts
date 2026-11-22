declare module "qrcode" {
  type Options = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  };

  const QRCode: {
    create(text: string, options?: Options): { version: number; modules: { size: number; get(row: number, column: number): number } };
    toDataURL(text: string, options?: Options): Promise<string>;
  };

  export default QRCode;
}
