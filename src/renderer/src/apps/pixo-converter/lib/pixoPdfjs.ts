import * as pdfjs from "pdfjs-dist";

import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const i = dataUrl.indexOf(",");
  if (i < 0) {
    throw new Error("Invalid data URL");
  }
  const b64 = dataUrl.slice(i + 1);
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let c = 0; c < len; c++) {
    bytes[c] = bin.charCodeAt(c);
  }
  return bytes;
}

export function loadPdfFromDataUrl(dataUrl: string) {
  return pdfjs.getDocument({ data: dataUrlToUint8Array(dataUrl), useSystemFonts: true });
}

export type { PDFDocumentProxy } from "pdfjs-dist";
export { pdfjs };
