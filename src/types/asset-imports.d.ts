declare module 'pdfjs-dist/build/pdf.worker.min.mjs?url' {
  const assetUrl: string;
  export default assetUrl;
}

declare module '*?worker&url' {
  const workerUrl: string;
  export default workerUrl;
}
