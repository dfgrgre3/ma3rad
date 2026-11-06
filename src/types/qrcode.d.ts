declare module 'qrcode' {
  const QRCode: {
    toDataURL: (
      text: string,
      options?: {
        errorCorrectionLevel?: 'M';
        margin?: number;
        width?: number;
      },
    ) => Promise<string>;
  };

  export default QRCode;
}
