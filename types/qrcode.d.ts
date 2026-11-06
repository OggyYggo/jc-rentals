declare module "qrcode" {
  type Options = {
    errorCorrectionLevel?: "L" | "M" | "Q" | "H";
    margin?: number;
    width?: number;
    color?: { dark?: string; light?: string };
  };

  const QRCode: {
    toDataURL(text: string, options?: Options): Promise<string>;
  };

  export default QRCode;
}
