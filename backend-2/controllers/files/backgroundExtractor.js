// 22 sep

import * as mupdf from 'mupdf'
import sharp from "sharp";

export function extractPageVectorsAndImages(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const structuredText = page.toStructuredText("preserve-whitespace,preserve-images,vectors");

  const vectors = [];
  const images = [];
  let seqno = 0; // 👈 global counter — draw-order track karne ke liye

  const walker = {
    onVector(bbox, flags, rgb) {
      vectors.push({ bbox, flags, rgb, seqno: seqno++ });
    },
    onImageBlock(bbox, transform, image) {
      images.push({ bbox, transform,image, seqno: seqno++ });
    },
  };

  structuredText.walk(walker);
  return { vectors, images };
}

export function detectBackground(vectors, images, pageBounds, rendered = null) {
  const pageArea = (pageBounds[2] - pageBounds[0]) * (pageBounds[3] - pageBounds[1]);
  const areaOf = (b) => (b[2] - b[0]) * (b[3] - b[1]);

  const candidates = [
    ...vectors.map((v) => ({ type: "vector", area: areaOf(v.bbox), seqno: v.seqno, data: v })),
    ...images.map((im) => ({ type: "image", area: areaOf(im.bbox), seqno: im.seqno, data: im })),
  ];
  if (candidates.length === 0) return { type: "none" };

  const full = candidates.filter((c) => c.area / pageArea >= 0.9);
  if (full.length === 0) return { type: "none", reason: "no dominant full-page element found" };

  // topmost (sabse baad mein draw hua) pehle
  full.sort((a, b) => b.seqno - a.seqno);
  let top = full[0];

  // render se verify: kya ye vector asal mein nazar aa raha hai?
  if (top.type === "vector" && rendered) {
    const ring = ringPoints(rendered);
    const scored = full
      .filter((c) => c.type === "vector")
      .map((c) => ({ c, share: shareMatching(ring, c.data.rgb) }));
    const topShare = scored.find((s) => s.c === top).share;

    if (topShare < 0.05) {
      const best = scored
        .filter((s) => s.share >= 0.05)
        .sort((a, b) => b.share - a.share || b.c.seqno - a.c.seqno)[0];
     
    }
  }

  

  if (top.type === "image") return { type: "image", source: top.data, seqno: top.seqno };
  return { type: "color", rgb: top.data.rgb, seqno: top.seqno };
}
export function getPageBoundsPt(pdfBuffer,pageIndex){
  const doc=mupdf.Document.openDocument(pdfBuffer,'application/pdf');
  const page=doc.loadPage(pageIndex);
  return page.getBounds();
}
export function rgbToHex(rgbArray) {
  return rgbArray
    .map((c) => {
      const val = Math.round(c * 255);
      return val.toString(16).padStart(2, "0");
    })
    .join("")
    .toUpperCase();
}

export function samplePixelColor(pdfBuffer, pageIndex, xPt, yPt) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const pixmap = page.toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false);
  const samples = pixmap.getPixels();
  const width = pixmap.getWidth();
  const x = Math.floor(xPt);
  const y = Math.floor(yPt);
  const idx = (y * width + x) * 3;
  return [samples[idx], samples[idx + 1], samples[idx + 2]];
}


// Rectangle ke andar kitne pixels declared color se match karte hain






export function isVectorReallyVisible(r, vector, tol = 25, steps = 8) {
  const [x0, y0, x1, y1] = vector.bbox;
  const declared = vector.rgb.map((c) => Math.round(c * 255));
  let match = 0;
  let total = 0;

  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / steps;
      const y = y0 + ((y1 - y0) * (j + 0.5)) / steps;
      const px = Math.min(r.width - 1, Math.max(0, Math.floor(x)));
      const py = Math.min(r.height - 1, Math.max(0, Math.floor(y)));
      const idx = (py * r.width + px) * 3;
      const diff = Math.max(
        Math.abs(r.pixels[idx] - declared[0]),
        Math.abs(r.pixels[idx + 1] - declared[1]),
        Math.abs(r.pixels[idx + 2] - declared[2])
      );
      total++;
      if (diff <= tol) match++;
    }
  }
  return match / total >= 0.5;
}
// ---------- Render-based helpers ----------

// Page ek baar render karo, baar baar nahi
export function renderPagePixels(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const pixmap = page.toPixmap(
    mupdf.Matrix.identity,
    mupdf.ColorSpace.DeviceRGB,
    false
  );
  return {
    pixels: pixmap.getPixels().slice(),
    width: pixmap.getWidth(),
    height: pixmap.getHeight(),
  };
}

function pixelAt(r, x, y) {
  const px = Math.min(r.width - 1, Math.max(0, Math.floor(x)));
  const py = Math.min(r.height - 1, Math.max(0, Math.floor(y)));
  const idx = (py * r.width + px) * 3;
  return [r.pixels[idx], r.pixels[idx + 1], r.pixels[idx + 2]];
}

// Region ke andar grid sample karke sabse common color (0-255) return karta hai
export function dominantColor(r, x0, y0, x1, y1, steps = 6) {
  const counts = new Map();
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const x = x0 + ((x1 - x0) * (i + 0.5)) / steps;
      const y = y0 + ((y1 - y0) * (j + 0.5)) / steps;
      const rgb = pixelAt(r, x, y);
      const key = `${rgb[0] >> 3},${rgb[1] >> 3},${rgb[2] >> 3}`; // thora sa quantize
      const entry = counts.get(key);
      if (entry) entry.count++;
      else counts.set(key, { count: 1, rgb });
    }
  }
  let best = null;
  for (const e of counts.values()) {
    if (!best || e.count > best.count) best = e;
  }
  return best.rgb;
}

export function colorsClose(a, b, tol = 12) {
  return (
    Math.abs(a[0] - b[0]) <= tol &&
    Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol
  );
}

export function rgb255ToHex(rgb) {
  return rgb
    .map((c) => c.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}


// "fill" | "stroke" | "skip"
export function classifyRect(r, vector, tol = 25) {
  const [x0, y0, x1, y1] = vector.bbox;
  const declared = vector.rgb.map((c) => Math.round(c * 255));

  const at = (x, y) => {
    const px = Math.min(r.width - 1, Math.max(0, Math.floor(x)));
    const py = Math.min(r.height - 1, Math.max(0, Math.floor(y)));
    const i = (py * r.width + px) * 3;
    return [r.pixels[i], r.pixels[i + 1], r.pixels[i + 2]];
  };
  const close = (p) =>
    Math.max(
      Math.abs(p[0] - declared[0]),
      Math.abs(p[1] - declared[1]),
      Math.abs(p[2] - declared[2])
    ) <= tol;

  const w = x1 - x0, h = y1 - y0;

  // interior
  let inMatch = 0, inTotal = 0;
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      inTotal++;
      if (close(at(x0 + w * (0.2 + 0.6 * (i + 0.5) / 6), y0 + h * (0.2 + 0.6 * (j + 0.5) / 6)))) inMatch++;
    }
  if (inMatch / inTotal >= 0.5) return { kind: "fill" };

  // edges (1pt andar se)
  let edMatch = 0, edTotal = 0;
  for (let k = 0; k < 10; k++) {
    const t = (k + 0.5) / 10;
    [[x0 + w * t, y0 + 1], [x0 + w * t, y1 - 1], [x0 + 1, y0 + h * t], [x1 - 1, y0 + h * t]]
      .forEach(([x, y]) => { edTotal++; if (close(at(x, y))) edMatch++; });
  }
  if (edMatch / edTotal < 0.5) return { kind: "skip" };

  // border ki motai: left edge se andar scan
  let px = 0;
  const midY = y0 + h / 2;
  while (px < 12 && close(at(x0 + px + 0.5, midY))) px++;
  return { kind: "stroke", widthPt: Math.max(0.75, px) };
}


export async function buildGradientBackground(
  rendered,
  fgBoxes,
  { cellPt = 8, maxStep = 18, minRange = 12 } = {}
) {
  const W = rendered.width, H = rendered.height;
  const gw = Math.max(2, Math.ceil(W / cellPt));
  const gh = Math.max(2, Math.ceil(H / cellPt));
  const boxes = fgBoxes.map(([a, b, c, d]) => [a - 4, b - 4, c + 4, d + 4]);

  const col = new Float32Array(gw * gh * 3);
  const known = new Uint8Array(gw * gh);
  let knownCount = 0;

  // 1) khali cells ka color sample karo
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const cx = ((gx + 0.5) * W) / gw;
      const cy = ((gy + 0.5) * H) / gh;
      if (boxes.some((b) => cx >= b[0] && cx <= b[2] && cy >= b[1] && cy <= b[3])) continue;
      const i = gy * gw + gx;
      col.set(pixelAt(rendered, cx, cy), i * 3);
      known[i] = 1;
      knownCount++;
    }
  }
  if (knownCount < gw * gh * 0.15) return null; // background ka bohat kam hissa nazar aa raha hai

  // 2) range + hard-edge check (hard edge = band/photo, gradient nahi)
  const lo = [255, 255, 255], hi = [0, 0, 0];
  let hardEdge = false;
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      const i = gy * gw + gx;
      if (!known[i]) continue;
      for (let c = 0; c < 3; c++) {
        lo[c] = Math.min(lo[c], col[i * 3 + c]);
        hi[c] = Math.max(hi[c], col[i * 3 + c]);
      }
      for (const j of [gx + 1 < gw ? i + 1 : -1, gy + 1 < gh ? i + gw : -1]) {
        if (j < 0 || !known[j]) continue;
        const d = Math.max(
          Math.abs(col[i * 3] - col[j * 3]),
          Math.abs(col[i * 3 + 1] - col[j * 3 + 1]),
          Math.abs(col[i * 3 + 2] - col[j * 3 + 2])
        );
        if (d > maxStep) hardEdge = true;
      }
    }
  }
  const range = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]);
  if (!Number.isFinite(range) || range < minRange || hardEdge) return null;
  // 3) foreground wali cells ko neighbors se bharo
  const filled = Uint8Array.from(known);
  let remaining = gw * gh - knownCount;
  while (remaining > 0) {
    const batch = [];
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const i = gy * gw + gx;
        if (filled[i]) continue;
        let n = 0, sr = 0, sg = 0, sb = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = gx + dx, y = gy + dy;
            if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
            const j = y * gw + x;
            if (!filled[j]) continue;
            n++; sr += col[j * 3]; sg += col[j * 3 + 1]; sb += col[j * 3 + 2];
          }
        }
        if (n) batch.push([i, sr / n, sg / n, sb / n]);
      }
    }
    if (!batch.length) break;
    for (const [i, R, G, B] of batch) {
      col[i * 3] = R; col[i * 3 + 1] = G; col[i * 3 + 2] = B; filled[i] = 1;
    }
    remaining -= batch.length;
  }

  // 4) bhari hui cells ko smooth karo (known cells fixed rehti hain)
  for (let pass = 0; pass < 4; pass++) {
    const next = Float32Array.from(col);
    for (let gy = 0; gy < gh; gy++) {
      for (let gx = 0; gx < gw; gx++) {
        const i = gy * gw + gx;
        if (known[i]) continue;
        let n = 0, s = [0, 0, 0];
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const x = gx + dx, y = gy + dy;
            if (x < 0 || y < 0 || x >= gw || y >= gh) continue;
            const j = y * gw + x;
            n++; s[0] += col[j * 3]; s[1] += col[j * 3 + 1]; s[2] += col[j * 3 + 2];
          }
        }
        next[i * 3] = s[0] / n; next[i * 3 + 1] = s[1] / n; next[i * 3 + 2] = s[2] / n;
      }
    }
    col.set(next);
  }

  // 5) chhoti grid -> smooth bari image
  const raw = Buffer.alloc(gw * gh * 3);
  for (let k = 0; k < raw.length; k++) raw[k] = Math.max(0, Math.min(255, Math.round(col[k])));
  const scale = Math.min(2, 1920 / W);
  const jpg = await sharp(raw, { raw: { width: gw, height: gh, channels: 3 } })
    .resize(Math.round(W * scale), Math.round(H * scale), { kernel: "cubic" })
    .jpeg({ quality: 92 })
    .toBuffer();

  return { data: "image/jpeg;base64," + jpg.toString("base64"), range };
}

export function imageToPngDataUri(image, transform, bbox, maxPx = 1600) {
  try {
    const [bx0, by0, bx1, by1] = bbox;
    const bw = bx1 - bx0, bh = by1 - by0;
    if (bw <= 0 || bh <= 0) return null;

    // canvas: image ke native resolution ke qareeb, maxPx se zyada nahi
    const nativeMax = Math.max(image.getWidth(), image.getHeight());
    const ppp = Math.min(maxPx, nativeMax) / Math.max(bw, bh); // pixels per point
    const cw = Math.max(1, Math.round(bw * ppp));
    const ch = Math.max(1, Math.round(bh * ppp));

    const pixmap = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, cw, ch], true);
    pixmap.clear(); // transparent

    // image ka apna transform (page space) -> canvas space (bbox ka top-left origin)
    const [a, b, c, d, e, f] = transform;
    const m = [a * ppp, b * ppp, c * ppp, d * ppp, (e - bx0) * ppp, (f - by0) * ppp];

    const mask = image.getMask();

    const device = new mupdf.DrawDevice(mupdf.Matrix.identity, pixmap);
    if (mask) device.clipImageMask(mask, m); // soft mask se clip
    device.fillImage(image, m, 1);
    if (mask) device.popClip();
    device.close();

    return "image/png;base64," + Buffer.from(pixmap.asPNG()).toString("base64");
  } catch (e) {
    console.warn("imageToPngDataUri failed:", e.message);
    return null;
  }
}


function ringPoints(r,inset=3, step=6){

  const pts=[];
  for (let x=inset; x < r.width-inset ; x+=step){
    pts.push([x,inset] , [x,r.right -1-inset]);
  }

  for (let y=inset; y < r.height - inset; y+=step){
    pts.push([inset , y], [r.width - 1 - inset, y]);
  }
  return pts.map(([x,y])=>pixelAt(r, x, y));
}

function shareMatching(pixels , rgb01, tol =12){
  const d=rgb01.map((c)=>Math.round(c* 255));
  return pixels.filter((p)=>colorsClose(p,d,tol)).length / pixels.length;
}

// page ke 4 edges ka dominant color (0-255), ya null agar edges uniform na hon (gradient/photo)
export function edgeBackgroundColor(r, inset = 2) {
  const W = r.width, H = r.height;
  const pts = [];
  for (let k = 0; k <= 10; k++) {
    const t = k / 10;
    pts.push([inset + t * (W - 1 - 2 * inset), inset]);
    pts.push([inset + t * (W - 1 - 2 * inset), H - 1 - inset]);
    pts.push([inset, inset + t * (H - 1 - 2 * inset)]);
    pts.push([W - 1 - inset, inset + t * (H - 1 - 2 * inset)]);
  }
  const px = pts.map(([x, y]) => pixelAt(r, x, y));

  let best = [];
  for (const seed of px) {
    const cluster = px.filter((p) => colorsClose(p, seed, 12));
    if (cluster.length > best.length) best = cluster;
  }
  if (best.length / px.length < 0.8) return null;
  return [0, 1, 2].map((c) => Math.round(best.reduce((s, p) => s + p[c], 0) / best.length));
}



/* 

controller file , background extractor , pathprob, curved shapes, text extractor , drawing extractor , stroke probe,geometry  utils,ornamnetsextractor



*/