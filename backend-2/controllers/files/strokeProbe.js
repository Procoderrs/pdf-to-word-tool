// 22 sep

import * as mupdf from "mupdf";

export function dumpStrokes(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const out = [];

  const device = new mupdf.Device({
    strokePath(path, stroke, ctm, colorspace, color, alpha) {
      const pts = [];
      path.walk({
        moveTo(x, y) { pts.push(["M", x, y]); },
        lineTo(x, y) { pts.push(["L", x, y]); },
        closePath() { pts.push(["Z"]); },
      });
      out.push({ width: stroke.getLineWidth(), ctm, color, alpha, pts });
    },
  });

  page.run(device, mupdf.Matrix.identity);
  return out;
}