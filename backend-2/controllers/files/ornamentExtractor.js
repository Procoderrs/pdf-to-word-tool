// 22 sep

import * as mupdf from "mupdf";
import sharp from "sharp";

// Page ek baar high-res render karo (zoom 3 = crisp crops)
export function renderPageForCrops(pdfBuffer, pageIndex, zoom = 3) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const pixmap = page.toPixmap(
    mupdf.Matrix.scale(zoom, zoom),
    mupdf.ColorSpace.DeviceRGB,
    false
  );
  return {
    png: Buffer.from(pixmap.asPNG()),
    zoom,
    width: pixmap.getWidth(),
    height: pixmap.getHeight(),
  };
}

function overlapsAny(bbox, boxes) {
  const [x0, y0, x1, y1] = bbox;
  return boxes.some(
    (b) => x0 < b.x + b.w && x1 > b.x && y0 < b.y + b.h && y1 > b.y
  );
}

// Non-rectangle vectors jo ornament hain: chhote hon aur text par na baithe hon
export function pickOrnaments(vectors, paragraphs, pageArea) {
  // text boxes ko andar se thoda chhota karo, taake sirf asli overlap pakde
  const INSET = 3; // pt
  const textBoxes = paragraphs.map((p) => ({
    x: p.bbox.x + INSET,
    y: p.bbox.y + INSET,
    w: Math.max(0, p.bbox.w - 2 * INSET),
    h: Math.max(0, p.bbox.h - 2 * INSET),
  }));

  return vectors.filter((v) => {
    if (v.flags.isRectangle) return false;
    const w = v.bbox[2] - v.bbox[0];
    const h = v.bbox[3] - v.bbox[1];
    // patli line allow karo: sirf tab skip jab dono taraf bilkul chhota ho
    if (w < 0.3 && h < 0.3) return false;
    if ((w * h) / pageArea > 0.15) return false;
    if (overlapsAny(v.bbox, textBoxes)) return false;
    return true;
  });
}

// Ek vector ki jagah ka crop -> pptxgenjs ke liye base64 image
export async function cropOrnament(render, bbox, padPt = 1) {
  const z = render.zoom;
  const left = Math.max(0, Math.floor((bbox[0] - padPt) * z));
  const top = Math.max(0, Math.floor((bbox[1] - padPt) * z));
  const right = Math.min(render.width, Math.ceil((bbox[2] + padPt) * z));
  const bottom = Math.min(render.height, Math.ceil((bbox[3] + padPt) * z));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;

  const buf = await sharp(render.png)
    .extract({ left, top, width, height })
    .png()
    .toBuffer();

  return {
    data: "image/png;base64," + buf.toString("base64"),
    x: left / z,
    y: top / z,
    w: width / z,
    h: height / z,
  };
}

// Ek hi row (same y-range) ke ornaments ko ek union bbox mein jod do.
// Isse dots ke beech ki line bhi crop mein aa jati hai.
export function mergeAlignedRows(ornaments, paragraphs, tol = 1) {
  const INSET = 3;
  const textBoxes = paragraphs.map((p) => ({
    x: p.bbox.x + INSET,
    y: p.bbox.y + INSET,
    w: Math.max(0, p.bbox.w - 2 * INSET),
    h: Math.max(0, p.bbox.h - 2 * INSET),
  }));

  const used = new Set();
  const result = [];

  ornaments.forEach((a, i) => {
    if (used.has(i)) return;
    const group = [a];
    ornaments.forEach((b, j) => {
      if (j <= i || used.has(j)) return;
      if (
        Math.abs(a.bbox[1] - b.bbox[1]) <= tol &&
        Math.abs(a.bbox[3] - b.bbox[3]) <= tol
      ) {
        group.push(b);
      }
    });

    if (group.length >= 2) {
      const union = [
        Math.min(...group.map((g) => g.bbox[0])),
        Math.min(...group.map((g) => g.bbox[1])),
        Math.max(...group.map((g) => g.bbox[2])),
        Math.max(...group.map((g) => g.bbox[3])),
      ];
      // union text par baith raha ho to merge mat karo
      if (!overlapsAny(union, textBoxes)) {
        group.forEach((g) => used.add(ornaments.indexOf(g)));
        result.push({
          bbox: union,
          seqno: Math.min(...group.map((g) => g.seqno)),
          rgb: a.rgb,
        });
        return;
      }
    }
    used.add(i);
    result.push(a);
  });

  return result;
}