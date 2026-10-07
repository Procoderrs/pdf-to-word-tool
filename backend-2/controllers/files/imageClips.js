import * as mupdf from "mupdf";

// m phir n apply (mupdf convention)
export const concat = (m, n) => [
  m[0] * n[0] + m[1] * n[2],
  m[0] * n[1] + m[1] * n[3],
  m[2] * n[0] + m[3] * n[2],
  m[2] * n[1] + m[3] * n[3],
  m[4] * n[0] + m[5] * n[2] + n[4],
  m[4] * n[1] + m[5] * n[3] + n[5],
];

function readPathCmds(path) {
  const cmds = [];
  path.walk({
    moveTo(x, y) { cmds.push(["M", x, y]); },
    lineTo(x, y) { cmds.push(["L", x, y]); },
    curveTo(x1, y1, x2, y2, x3, y3) { cmds.push(["C", x1, y1, x2, y2, x3, y3]); },
    closePath() { cmds.push(["Z"]); },
  });
  return cmds;
}

function buildPath(cmds) {
  const p = new mupdf.Path();
  for (const c of cmds) {
    if (c[0] === "M") p.moveTo(c[1], c[2]);
    else if (c[0] === "L") p.lineTo(c[1], c[2]);
    else if (c[0] === "C") p.curveTo(c[1], c[2], c[3], c[4], c[5], c[6]);
    else p.closePath();
  }
  return p;
}

// har image ke sath wo clip paths jo us waqt active thay
export function extractImageClips(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const out = [];
  const stack = []; // har level: path clip, ya null (jo replay nahi ho sakta)

  const device = new mupdf.Device({
    clipPath(path, evenOdd, ctm) {
      stack.push({ cmds: readPathCmds(path), evenOdd, ctm: Array.from(ctm) });
    },
    // baqi clips bhi stack mein ginti ke liye (popClip balance rahe)
    clipStrokePath() { stack.push(null); },
    clipText() { stack.push(null); },
    clipStrokeText() { stack.push(null); },
    clipImageMask() { stack.push(null); },
    beginMask() { stack.push(null); },
    popClip() { stack.pop(); },
    fillImage(image, ctm) {
      out.push({
        w: image.getWidth(),
        h: image.getHeight(),
        ctm: Array.from(ctm),
        clips: stack.filter(Boolean),
      });
    },
  });

  try {
    page.run(device, mupdf.Matrix.identity);
  } finally {
    device.close();
  }
  return out;
}

// imageToPngDataUri jaisa hi, bas path clips bhi apply karta hai
export function imageToPngDataUriClipped(image, transform, bbox, clips = [], maxPx = 1600) {
  try {
    const [bx0, by0, bx1, by1] = bbox;
    const bw = bx1 - bx0, bh = by1 - by0;
    if (bw <= 0 || bh <= 0) return null;

    const nativeMax = Math.max(image.getWidth(), image.getHeight());
    const ppp = Math.min(maxPx, nativeMax) / Math.max(bw, bh);
    const cw = Math.max(1, Math.round(bw * ppp));
    const ch = Math.max(1, Math.round(bh * ppp));
    const toCanvas = [ppp, 0, 0, ppp, -bx0 * ppp, -by0 * ppp];

    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, cw, ch], true);
    pixmap.clear();
    const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);

    for (const c of clips) device.clipPath(buildPath(c.cmds), c.evenOdd, concat(c.ctm, toCanvas));

    const m = concat(Array.from(transform), toCanvas);
    const mask = image.getMask();
    if (mask) device.clipImageMask(mask, m);
    device.fillImage(image, m, 1);
    if (mask) device.popClip();

    for (let k = 0; k < clips.length; k++) device.popClip();
    device.close();

    return "image/png;base64," + Buffer.from(pixmap.asPNG()).toString("base64");
  } catch (e) {
    console.warn("imageToPngDataUriClipped failed:", e.message);
    return null;
  }
}