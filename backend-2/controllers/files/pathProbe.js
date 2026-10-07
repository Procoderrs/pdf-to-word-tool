
// 22 sep

import * as mupdf from "mupdf";

// ctm = [a, b, c, d, e, f]
function applyMatrix(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function pathInfo(path, ctm) {
  const c = { M: 0, L: 0, C: 0, Z: 0 };
  const xs = [], ys = [];
  const add = (x, y) => {
    const [tx, ty] = applyMatrix(ctm, x, y);
    xs.push(tx);
    ys.push(ty);
  };
  path.walk({
    moveTo(x, y) { c.M++; add(x, y); },
    lineTo(x, y) { c.L++; add(x, y); },
    curveTo(x1, y1, x2, y2, x3, y3) { c.C++; add(x3, y3); },
    closePath() { c.Z++; },
  });
  const bbox = xs.length
    ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(Math.round)
    : [];
  return { sig: `M${c.M} L${c.L} C${c.C} Z${c.Z}`, bbox };
}

export function probePage(pdfBuffer, pageIndex, maxEvents = 60) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const log = [];
  let depth = 0;
  const push = (s) => { if (log.length < maxEvents) log.push(s); };
  const col = (c) => JSON.stringify(Array.from(c).map((n) => +n.toFixed(2)));

  const device = new mupdf.Device({
    fillPath(path, evenOdd, ctm, cs, color, alpha) {
      const { sig, bbox } = pathInfo(path, ctm);
      push(`FILL   clip=${depth} ${sig} [${bbox}] ${col(color)} a=${alpha}`);
    },
    strokePath(path, stroke, ctm, cs, color, alpha) {
      const { sig, bbox } = pathInfo(path, ctm);
      push(`STROKE clip=${depth} ${sig} [${bbox}] ${col(color)} w=${stroke.getLineWidth()}`);
    },
    clipPath(path, evenOdd, ctm) {
      const { sig, bbox } = pathInfo(path, ctm);
      depth++;
      push(`CLIP   depth=${depth} ${sig} [${bbox}]`);
    },
    popClip() {
      push(`POP    depth=${depth}`);
      depth--;
    },
    fillImage(image, ctm, alpha) {
      push(`IMAGE  clip=${depth} ${image.getWidth()}x${image.getHeight()} mask=${!!image.getMask()}`);
    },
  });

  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return log;
}