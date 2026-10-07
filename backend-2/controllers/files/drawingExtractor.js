// 22 sep

import * as mupdf from "mupdf";

const tx = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const rgb3 = (c) => (c.length === 1 ? [c[0], c[0], c[0]] : c.slice(0, 3));

export function extractStrokesAndFills(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const strokes = [];
  const fills = [];
  let order=0;

  const walkPath = (path, ctm) => {
    const pts = [];
    path.walk({
      moveTo(x, y) { pts.push(["M", ...tx(ctm, x, y)]); },
      lineTo(x, y) { pts.push(["L", ...tx(ctm, x, y)]); },
      curveTo(x1, y1, x2, y2, x3, y3) { pts.push(["C", ...tx(ctm, x3, y3)]); },
      closePath() { pts.push(["Z"]); },
    });
    return pts;
  };

  const device = new mupdf.Device({
    strokePath(path, stroke, ctm, cs, color, alpha) {
      strokes.push({
        order:order++,
        pts: walkPath(path, ctm),
        width: stroke.getLineWidth() * Math.hypot(ctm[0], ctm[1]),
        color: rgb3(color),
        alpha,
      });
    },
    fillPath(path, evenOdd, ctm, cs, color, alpha) {
      const myOrder=order++
      const pts = walkPath(path, ctm).filter((p) => p[0] !== "Z");
      if (!pts.length) return;
      const xs = pts.map((p) => p[1]);
      const ys = pts.map((p) => p[2]);
      fills.push({
        order:myOrder,
        bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
        color: rgb3(color),
        alpha,
      });
    },
  });

  page.run(device, mupdf.Matrix.identity);
  device.close();
  return { strokes, fills };
}

// path points -> seedhe line segments [x0,y0,x1,y1] (curves skip)
export function toSegments(pts) {
  const segs = [];
  let start = null, cur = null;
  for (const p of pts) {
    if (p[0] === "M") { start = [p[1], p[2]]; cur = start; }
    else if (p[0] === "L") { segs.push([cur[0], cur[1], p[1], p[2]]); cur = [p[1], p[2]]; }
    else if (p[0] === "C") { cur = [p[1], p[2]]; }
    else if (p[0] === "Z" && start && cur) { segs.push([cur[0], cur[1], start[0], start[1]]); cur = start; }
  }
  return segs.filter((s) => Math.hypot(s[2] - s[0], s[3] - s[1]) > 0.5);
}


/* 



*/