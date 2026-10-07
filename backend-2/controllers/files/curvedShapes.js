// 22 sep

import * as mupdf from "mupdf";

function applyMatrix(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function toRgb(color) {
  const c = Array.from(color);
  if (c.length === 1) return [c[0], c[0], c[0]];
  if (c.length === 4) {
    const [C, M, Y, K] = c;
    return [(1 - C) * (1 - K), (1 - M) * (1 - K), (1 - Y) * (1 - K)];
  }
  return c.slice(0, 3);
}

function readPath(path, ctm) {
  const cmds = [];
  const xs = [], ys = [];
  let hasCurve = false;
  const pt = (x, y) => {
    const p = applyMatrix(ctm, x, y);
    xs.push(p[0]);
    ys.push(p[1]);
    return p;
  };
  path.walk({
    moveTo(x, y) { cmds.push({ t: "M", p: pt(x, y) }); },
    lineTo(x, y) { cmds.push({ t: "L", p: pt(x, y) }); },
    curveTo(x1, y1, x2, y2, x3, y3) {
      hasCurve = true;
      cmds.push({ t: "C", c1: pt(x1, y1), c2: pt(x2, y2), p: pt(x3, y3) });
    },
    closePath() { cmds.push({ t: "Z" }); },
  });
  const bbox = xs.length ? [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] : null;
  return { cmds, hasCurve, bbox };
}

const sameBox = (a, b, tol = 2) => a && b && a.every((n, k) => Math.abs(n - b[k]) <= tol);


// axis-aligned plain rectangle? (wo rectangles pehle se vectors wale path se draw hoti hain)
function isAxisAlignedRect(cmds) {
  if (cmds.some((c) => c.t === "C")) return false;
  const pts = cmds.filter((c) => c.t === "M" || c.t === "L").map((c) => c.p);
  if (pts.length < 4 || pts.length > 5) return false;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    if (Math.abs(a[0] - b[0]) > 0.5 && Math.abs(a[1] - b[1]) > 0.5) return false; // tirchi edge
  }
  return true;
}

// Canva pattern: rounded/arc shape = (rect fill) + (curved clip path). Clip path hi asli shape hai.
export function extractCurvedShapes(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const shapes = [];
  const stack = [];
  let order = 0;

  const innermostCurve = () => {
    for (let i = stack.length - 1; i >= 0; i--) if (stack[i].hasCurve) return stack[i];
    return null;
  };

  const device = new mupdf.Device({
    clipPath(path, evenOdd, ctm) {
      stack.push(readPath(path, ctm));
    },
    popClip() {
      stack.pop();
    },
   fillPath(path, evenOdd, ctm, cs, color, alpha) {
  const myOrder = order++; // zero-based, drawingExtractor jaisa
  if (alpha < 0.02) return; // alpha 0 = invisible container

  // 1) path khud curved ho, ya rectangle na ho (hexagon, arrow, ...)
  const own = readPath(path, ctm);
  if (own.bbox && (own.hasCurve || !isAxisAlignedRect(own.cmds))) {
    shapes.push({
      kind: "fill", order: myOrder, cmds: own.cmds, bbox: own.bbox,
      color: toRgb(color), alpha, poly: !own.hasCurve,
    });
    return;
  }

  // 2) purana Canva pattern: rect fill + curved clip
  const clip = innermostCurve();
  if (!clip || !clip.bbox) return;
  shapes.push({
    kind: "fill", order: myOrder, cmds: clip.cmds, bbox: clip.bbox,
    color: toRgb(color), alpha,
  });
},
strokePath(path, stroke, ctm, cs, color, alpha) {
  const myOrder = order++;
  const p = readPath(path, ctm);
  if (!p.hasCurve || !p.bbox || alpha < 0.02) return;
  const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
  let width = stroke.getLineWidth() * scale;
  if (stack.some((c) => c.hasCurve && sameBox(c.bbox, p.bbox))) width /= 2;
  shapes.push({ kind: "stroke", order: myOrder, cmds: p.cmds, bbox: p.bbox, color: toRgb(color), alpha, width });
},
    strokePath(path, stroke, ctm, cs, color, alpha) {
      order++;
      const p = readPath(path, ctm);
      if (!p.hasCurve || !p.bbox || alpha < 0.02) return;
      const scale = Math.sqrt(Math.abs(ctm[0] * ctm[3] - ctm[1] * ctm[2]));
      let width = stroke.getLineWidth() * scale;
      // apne hi clip ke andar stroke ho to sirf andar wala aadha hissa nazar aata hai
      if (stack.some((c) => c.hasCurve && sameBox(c.bbox, p.bbox))) width /= 2;
      shapes.push({ kind: "stroke", order, cmds: p.cmds, bbox: p.bbox, color: toRgb(color), alpha, width });
    },
  });

  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return shapes;
}