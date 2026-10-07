


 


//22sep
// pdfConvertController.js — naya named export add karo, default export mat chhero

import PptxGenJS from "pptxgenjs";
import * as mupdf from "mupdf";
import sharp from "sharp";
import { extractStyledParagraphs, getTotalPages } from "./files/textExtractor.js";
import {
  extractPageVectorsAndImages,
  detectBackground,
  rgbToHex,
  renderPagePixels,
  classifyRect,
  buildGradientBackground, imageToPngDataUri,edgeBackgroundColor,colorsClose,rgb255ToHex
} from "./files/backgroundExtractor.js";
import { ptToIn } from "./files/geometryUtils.js";
import {
  renderPageForCrops,
  pickOrnaments,
  cropOrnament,
  mergeAlignedRows,
} from "./files/ornamentExtractor.js";
import { extractStrokesAndFills, toSegments } from "./files/drawingExtractor.js";
import {probePage} from './files/pathProbe.js'

import {extractCurvedShapes} from './files/curvedShapes.js'

import {extractImageClips, imageToPngDataUriClipped} from './files/imageClips.js'

const area = (b) => (b[2] - b[0]) * (b[3] - b[1]);


const near = (a, b, tol = 0.03) => a.every((n, k) => Math.abs(n - b[k]) <= tol);
const inside = (inner, outer, tol = 3) =>
  inner[0] >= outer[0] - tol && inner[1] >= outer[1] - tol &&
  inner[2] <= outer[2] + tol && inner[3] <= outer[3] + tol;

function segmentsBBox(pts) {
  const segs = toSegments(pts);
  if (!segs.length) return null;
  return [
    Math.min(...segs.map((s) => Math.min(s[0], s[2]))),
    Math.min(...segs.map((s) => Math.min(s[1], s[3]))),
    Math.max(...segs.map((s) => Math.max(s[0], s[2]))),
    Math.max(...segs.map((s) => Math.max(s[1], s[3]))),
  ];
}


function flattenCmds(cmds, steps = 16) {
  const polys = [];
  let cur = [], last = null;
  for (const c of cmds) {
    if (c.t === "M") { if (cur.length) polys.push(cur); cur = [c.p]; last = c.p; }
    else if (c.t === "L") { cur.push(c.p); last = c.p; }
    else if (c.t === "C") {
      const [x0, y0] = last;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps, u = 1 - t;
        cur.push([
          u*u*u*x0 + 3*u*u*t*c.c1[0] + 3*u*t*t*c.c2[0] + t*t*t*c.p[0],
          u*u*u*y0 + 3*u*u*t*c.c1[1] + 3*u*t*t*c.c2[1] + t*t*t*c.p[1],
        ]);
      }
      last = c.p;
    }
  }
  if (cur.length) polys.push(cur);
  return polys;
}

function clipPolyToRect(poly, [xmin, ymin, xmax, ymax]) {
  const edges = [
    { inside: (p) => p[0] >= xmin, cut: (a, b) => { const t = (xmin - a[0]) / (b[0] - a[0]); return [xmin, a[1] + t * (b[1] - a[1])]; } },
    { inside: (p) => p[0] <= xmax, cut: (a, b) => { const t = (xmax - a[0]) / (b[0] - a[0]); return [xmax, a[1] + t * (b[1] - a[1])]; } },
    { inside: (p) => p[1] >= ymin, cut: (a, b) => { const t = (ymin - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), ymin]; } },
    { inside: (p) => p[1] <= ymax, cut: (a, b) => { const t = (ymax - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), ymax]; } },
  ];
  let out = poly;
  for (const e of edges) {
    const inp = out;
    out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      const ai = e.inside(a), bi = e.inside(b);
      if (ai && bi) out.push(b);
      else if (ai && !bi) out.push(e.cut(a, b));
      else if (!ai && bi) { out.push(e.cut(a, b)); out.push(b); }
    }
    if (!out.length) break;
  }
  return out;
}

// sirf fills clip hoti hain; strokes ko clip karne se page edge pe nayi line ban jati
function clipFillToPage(s, bounds) {
  const [bx0, by0, bx1, by1] = s.bbox;
  if (bx0 >= bounds[0] && by0 >= bounds[1] && bx1 <= bounds[2] && by1 <= bounds[3]) return s;

  const polys = flattenCmds(s.cmds)
    .map((p) => clipPolyToRect(p, bounds))
    .filter((p) => p.length >= 3);
  if (!polys.length) return null;

  const cmds = [], xs = [], ys = [];
  for (const poly of polys) {
    poly.forEach((p, k) => { cmds.push({ t: k ? "L" : "M", p }); xs.push(p[0]); ys.push(p[1]); });
    cmds.push({ t: "Z" });
  }
  return {
    ...s,
    cmds,
    bbox: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
}

function addCurvedShape(slide, pptx, s) {
  const [bx, by, bx2, by2] = s.bbox;
  if (bx2 - bx <= 0 || by2 - by <= 0) return;
  const rel = ([x, y]) => ({ x: ptToIn(x - bx), y: ptToIn(y - by) });

  const points = [];
  for (const c of s.cmds) {
    if (c.t === "M") points.push({ ...rel(c.p), moveTo: true });
    else if (c.t === "L") points.push(rel(c.p));
    else if (c.t === "C") {
      const c1 = rel(c.c1), c2 = rel(c.c2);
      points.push({ ...rel(c.p), curve: { type: "cubic", x1: c1.x, y1: c1.y, x2: c2.x, y2: c2.y } });
    } else if (c.t === "Z") points.push({ close: true });
  }

  const opts = {
    x: ptToIn(bx), y: ptToIn(by), w: ptToIn(bx2 - bx), h: ptToIn(by2 - by), points,
  };
  const transparency = Math.round((1 - s.alpha) * 100);
  if (s.kind === "fill") {
    opts.fill = { color: rgbToHex(s.color), transparency };
    opts.line = { type: "none" };
  } else {
    opts.line = { color: rgbToHex(s.color), width: Math.max(0.25, s.width), transparency };
  }
  slide.addShape(pptx.shapes?.CUSTOM_GEOMETRY ?? "custGeom", opts);
}
function clipSegmentToPage(x0, y0, x1, y1, b) {
  // Liang–Barsky: b = [xmin, ymin, xmax, ymax]
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - b[0], b[2] - x0, y0 - b[1], b[3] - y0];
  for (let k = 0; k < 4; k++) {
    if (p[k] === 0) {
      if (q[k] < 0) return null; // page ke bahar, parallel
    } else {
      const t = q[k] / p[k];
      if (p[k] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return [x0 + t0 * dx, y0 + t0 * dy, x0 + t1 * dx, y0 + t1 * dy];
}

function spacingMultiple(pitchPt, fontSize) {
  const m = pitchPt / (fontSize * 1.2); // Google Slides ki natural line height ~1.2em maan ke
  if (Math.abs(m - 1) < 0.04) return 1; // 1.0 ke bohat qareeb ho to snap kar do
  return Math.min(2.5, Math.max(0.8, Math.round(m * 100) / 100));
}

 
async function imageToJpegDataUri(image, transform, bbox, maxPx = 2000, quality = 85){

  const png= imageToPngDataUri(image,  transform, bbox, maxPx);
   if (!png) return null;
   const buf= Buffer.from(png.split("base64")[1], "base64");
   const jpg=await sharp(buf).flatten({background:"#ffffff"}).jpeg({quality}).toBuffer();
   return "image/jpeg;base64," + jpg.toString("base64");
}


export  default async function convertPdfToPptxJS(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });

    const pdfBuffer = req.file.buffer;
    const pageCount = getTotalPages(pdfBuffer);
    const pptx = new PptxGenJS();

    // 1x1 transparent PNG: link hotspots ke liye
    const clearPng = await sharp({
      create: { width: 1, height: 1, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const clearData = "image/png;base64," + clearPng.toString("base64");

    for (let i = 0; i < pageCount; i++) {
      const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
      const page = doc.loadPage(i);
      const bounds = page.getBounds(); // [x0,y0,x1,y1] pt
      const widthIn = ptToIn(bounds[2] - bounds[0]);
      const heightIn = ptToIn(bounds[3] - bounds[1]);

      pptx.defineLayout({ name: `PAGE_${i}`, width: widthIn, height: heightIn });
      pptx.layout = `PAGE_${i}`;
      const slide = pptx.addSlide();

      // ---------- Raw extraction ----------
      const { vectors, images } = extractPageVectorsAndImages(pdfBuffer, i);



      const DEBUG_PAGES = [2, 3]; // slide 3 aur slide 4 (index 0 se shuru hota hai)
if (DEBUG_PAGES.includes(i)) {
  console.log(`--- PAGE ${i + 1} IMG TRANSFORMS ---`);
  console.log(images.map((im) => {
    const [a, b, c, d] = im.transform;
    return `${im.seqno}: bbox[${im.bbox.map((n) => n.toFixed(0))}] a=${a.toFixed(1)} b=${b.toFixed(1)} c=${c.toFixed(1)} d=${d.toFixed(1)} mask=${!!im.image.getMask()} ${im.image.getWidth()}x${im.image.getHeight()}`;
  }));
}
      const rendered = renderPagePixels(pdfBuffer, i);
      const background = detectBackground(vectors, images, bounds,rendered);
      const edge = edgeBackgroundColor(rendered);
if (edge && background.type === "color") {
  const declared = background.rgb.map((c) => Math.round(c * 255));
  if (!colorsClose(edge, declared, 12)) {
    console.log(`Page ${i + 1}: background ${rgbToHex(background.rgb)} render se match nahi karta, edge color ${rgb255ToHex(edge)} le raha hoon`);
    background.rgb = edge.map((c) => c / 255);
  }
}
      const pageArea = area(bounds);
      const backgroundSeqno = background.seqno ?? null;

      const { strokes, fills } = extractStrokesAndFills(pdfBuffer, i);
      const links = page.getLinks().map((l) => ({
        bbox: l.getBounds(),
        uri: l.getURI(),
      }));

     

      // Text + ornaments pehle: gradient ke liye foreground boxes chahiye
      const paragraphs = extractStyledParagraphs(pdfBuffer, i);
            //const DEBUG_PAGES = [4, 6]; // jin pages ko dekhna hai (0 se shuru: 0 = slide 1, 4 = slide 5)
     
      const rawOrnaments = pickOrnaments(vectors, paragraphs, pageArea);
      const ornaments = mergeAlignedRows(rawOrnaments, paragraphs);


      // curved shapes: ornaments (icon crops) ke andar wali strokes skip, warna duplicate ban jayegi
      const inOrnament = (b) => {
        const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2;
        return ornaments.some((o) => cx >= o.bbox[0] && cx <= o.bbox[2] && cy >= o.bbox[1] && cy <= o.bbox[3]);
      };
     
      const curved = extractCurvedShapes(pdfBuffer, i)
        .filter((s) => (s.kind === "fill" && !s.poly )|| !inOrnament(s.bbox))
        .sort((a, b) => a.order - b.order);
      console.log(`Page ${i + 1}: curved shapes ${curved.length} (fill ${curved.filter((s) => s.kind === "fill").length})`);
    
    /*  if (DEBUG_PAGES.includes(i)) {
  console.log("CURVED:", curved.map((s) =>
    `${s.order}: ${s.kind} ${rgbToHex(s.color)} a=${s.alpha} [${s.bbox.map((n) => n.toFixed(0))}]`));
  console.log("STROKES:", strokes.map((s) =>
    `${s.order}: ${rgbToHex(s.color)} w=${s.width}`));
  console.log("FILLS:", fills.map((f) =>
    `${f.order}: a=${f.alpha} [${f.bbox.map((n) => n.toFixed(0))}]`));
}
 */

/* if (DEBUG_PAGES.includes(i)) {
  console.log("BG:", background.type, background.rgb ? rgbToHex(background.rgb) : "-");
  console.log("BIG FILLS:", curved
    .filter((s) => s.kind === "fill" && area(s.bbox) / pageArea > 0.3)
    .map((s) => `${s.order}: ${rgbToHex(s.color)} poly=${!!s.poly} cmds=${s.cmds.length} [${s.bbox.map((n) => n.toFixed(0))}]`));
} */

               if ([4, 11, 16].includes(i))
                
                console.log(`PROBE p${i + 1}:`, probePage(pdfBuffer, i));
      // ---------- Background ----------
      const fgBoxes = [
        ...vectors
          .filter((v) => v.seqno !== backgroundSeqno && area(v.bbox) / pageArea < 0.9)
          .map((v) => v.bbox),
        ...images
          .filter((im) => im.seqno !== backgroundSeqno && area(im.bbox) / pageArea < 0.9)
          .map((im) => im.bbox),
        ...paragraphs.map((p) => [p.bbox.x, p.bbox.y, p.bbox.x + p.bbox.w, p.bbox.y + p.bbox.h]),
        ...ornaments.map((o) => o.bbox),
      ];
      // image background ke liye gradient try karne ki zaroorat nahi
const gradient = background.type === "image"
  ? null
  : await buildGradientBackground(rendered, fgBoxes);

if (gradient) {
  console.log(`Page ${i}: gradient background (colour range ${gradient.range.toFixed(0)})`);
  slide.background = { data: gradient.data };
} else if (background.type === "color") {
  slide.background = { color: rgbToHex(background.rgb) };
} else if (background.type === "image") {
  const src = background.source; // { bbox, transform, image, seqno }
  const data = await imageToJpegDataUri(src.image, src.transform, src.bbox);
  if (data) {
    const [x0, y0, x1, y1] = src.bbox;
    const fullPage =
      x0 <= bounds[0] + 2 && y0 <= bounds[1] + 2 && x1 >= bounds[2] - 2 && y1 >= bounds[3] - 2;
    if (fullPage) {
      slide.background = { data };
    } else {
      // page se chhoti image: sab se neeche ek image ki tarah
      slide.addImage({
        data, x: ptToIn(x0), y: ptToIn(y0), w: ptToIn(x1 - x0), h: ptToIn(y1 - y0),
      });
    }
  } else {
    console.warn(`Page ${i + 1}: image background render nahi ho saka`);
  }
}

      // ---------- Rectangles ----------
      const findFill = (v) =>
        fills.find((f) => f.bbox.every((n, k) => Math.abs(n - v.bbox[k]) < 0.6)) || null;

      const bgHex = background.type === "color" ? rgbToHex(background.rgb) : null;

      const rectanglesToDraw = vectors
        .filter((v) => v.flags.isRectangle && v.seqno !== backgroundSeqno)
        .filter((v) => !curved.some((s) => s.kind === "fill" && near(s.color, v.rgb) && inside(v.bbox, s.bbox)))
        // link underlines skip
        .filter((v) => {
          const h = v.bbox[3] - v.bbox[1];
          const w = v.bbox[2] - v.bbox[0];
          const isUnderline =
            h < 4 &&
            w > 20 &&
            links.some(
              (l) =>
                v.bbox[0] >= l.bbox[0] - 1 &&
                v.bbox[2] <= l.bbox[2] + 1 &&
                v.bbox[1] >= l.bbox[1] - 1 &&
                v.bbox[3] <= l.bbox[3] + 1
            );
          return !isUnderline;
        })
        // full-page-jaisi rectangles skip
        .filter((v) => area(v.bbox) / pageArea < 0.9)
        // background jaisi color wali bari rectangles skip
        .filter((v) => !(rgbToHex(v.rgb) === bgHex && area(v.bbox) / pageArea > 0.1))
        .map((v) => {
          const m = findFill(v);
          const alpha = m ? m.alpha : null;
          const order = m ? m.order : -1; // match na mile to sabse neeche
          const cls = classifyRect(rendered, v).kind;
          if (cls === "fill") return { v, transparency: 0, order };
          if (alpha !== null && alpha >= 0.02 && alpha < 0.98)
            return { v, transparency: Math.round((1 - alpha) * 100), order };
          return null;
        })
        .filter(Boolean); 
        curved
  .map((s) => (s.kind === "fill" ? clipFillToPage(s, bounds) : s))
  .filter(Boolean)
  

      // ---------- Rectangles + Lines, asli paint order mein ----------
      const drawItems = [
        ...curved.map((s)=>({kind: "curved", order: s.order,s})),
        ...rectanglesToDraw.map((r) => ({ kind: "rect", order: r.order, r })),
        ...strokes
          .filter((s) => {
            const sb = segmentsBBox(s.pts);
            return !(sb && curved.some((c) => c.kind === "stroke" && near(c.color, s.color) && inside(sb, c.bbox)));
          })
          .map((s) => ({ kind: "stroke", order: s.order, s })),
          
      ].sort((a, b) => a.order - b.order);

      drawItems.forEach((item) => {
        if(item.kind === "curved"){
          const s= item.s.kind === 'fill' ? clipFillToPage(item.s, bounds): item.s;
          if (s) addCurvedShape(slide,pptx,s)
            return;
        }
        if (item.kind === "rect") {
          const { v, transparency } = item.r;
          slide.addShape(pptx.ShapeType.rect, {
            x: ptToIn(v.bbox[0]),
            y: ptToIn(v.bbox[1]),
            w: ptToIn(v.bbox[2] - v.bbox[0]),
            h: ptToIn(v.bbox[3] - v.bbox[1]),
            fill: { color: rgbToHex(v.rgb), transparency },
            line: { type: "none" },
          });
                } else {
          const s = item.s;
          toSegments(s.pts).forEach(([sx0, sy0, sx1, sy1]) => {
            const seg = clipSegmentToPage(sx0, sy0, sx1, sy1, bounds);
            if (!seg) return;
            const [x0, y0, x1, y1] = seg;
            slide.addShape(pptx.ShapeType.line, {
              x: ptToIn(Math.min(x0, x1)),
              y: ptToIn(Math.min(y0, y1)),
              w: ptToIn(Math.abs(x1 - x0)),
              h: ptToIn(Math.abs(y1 - y0)),
              flipV: (x1 - x0) * (y1 - y0) < 0,
              line: {
                color: rgbToHex(s.color),
                width: Math.max(0.25, s.width),
                transparency: Math.round((1 - s.alpha) * 100),
              },
            });
          });
        }
      });

      // ---------- Ornaments (non-editable image crops) ----------
      if (ornaments.length) {
        const render = renderPageForCrops(pdfBuffer, i, 3);
        for (const o of [...ornaments].sort((a, b) => a.seqno - b.seqno)) {
          const crop = await cropOrnament(render, o.bbox);
          if (!crop) continue;
          slide.addImage({
            data: crop.data,
            x: ptToIn(crop.x),
            y: ptToIn(crop.y),
            w: ptToIn(crop.w),
            h: ptToIn(crop.h),
          });
        }
      }

      
      // ---------- Images (e.g. logo), link ke saath ----------
            // ---------- Images (e.g. logo), link ke saath ----------
      const usedLinks = new Set();

      const linkIndexFor = (bbox) =>
        links.findIndex((l) => {
          const cx = (l.bbox[0] + l.bbox[2]) / 2;
          const cy = (l.bbox[1] + l.bbox[3]) / 2;
          return cx >= bbox[0] && cx <= bbox[2] && cy >= bbox[1] && cy <= bbox[3];
        });


        const imageClips = extractImageClips(pdfBuffer, i);
const clipsFor = (im) => {
  const w = im.image.getWidth(), h = im.image.getHeight();
  const t = Array.from(im.transform);
  const hit = imageClips.find(
    (x) => x.w === w && x.h === h && x.ctm.every((n, k) => Math.abs(n - t[k]) < 0.05)
  );
  return hit ? hit.clips : [];
};
      // abhi sirf wo images jinpar link ho ya jo chhoti hon (logo/icons)
     const imagesToPlace = images
  .filter((im) => im.seqno !== backgroundSeqno && area(im.bbox) / pageArea < 0.9)
  .sort((a, b) => a.seqno - b.seqno);

if (imagesToPlace.length) {
  const imgRender = renderPageForCrops(pdfBuffer, i, 3);
  for (const im of imagesToPlace) {
    const li = linkIndexFor(im.bbox);
    const isLarge = area(im.bbox) / pageArea >= 0.15;

    // bari image (link ke bina): mask-aware PNG, koi baked text/background nahi
    if (li < 0) {
const clips = clipsFor(im);
if (DEBUG_PAGES.includes(i)) console.log(`IMG ${im.seqno}: clips=${clips.length}`);
const data =
  imageToPngDataUriClipped(im.image, im.transform, im.bbox, clips, 1600) ??
  imageToPngDataUri(im.image, im.transform, im.bbox, 1600);
  
  if (data) {
    
      slide.addImage({
        data,
        x: ptToIn(im.bbox[0]),
        y: ptToIn(im.bbox[1]),
        w: ptToIn(im.bbox[2] - im.bbox[0]),
        h: ptToIn(im.bbox[3] - im.bbox[1]),
      });
      continue;
    }
  }
    // chhoti / link wali images: tumhara purana crop path
    const crop = await cropOrnament(imgRender, im.bbox);
    if (!crop) continue;
    if (li >= 0) usedLinks.add(li);
    slide.addImage({
      data: crop.data,
      x: ptToIn(crop.x), y: ptToIn(crop.y),
      w: ptToIn(crop.w), h: ptToIn(crop.h),
      ...(li >= 0 ? { hyperlink: { url: links[li].uri } } : {}),
    });
  }
}
      // ---------- Text ----------
      paragraphs.forEach((p) => {
        const pad = Math.max(8, p.bbox.w * 0.06); // pt: Slides ki font-metrics ka slack

        let x = p.bbox.x;
        if (p.align === "center") x = p.bbox.x - pad;
        if (p.align === "right") x = p.bbox.x - 2 * pad;

        const runs = p.lines.map((lineText, li) => {
          const lineH = p.lineSpacingPt || p.fontSize * 1.2;
          const lineTop = p.bbox.y + li * lineH;
          const lineBottom = lineTop + lineH;
          const link = links.find(
            (l) =>
              l.bbox[1] < lineBottom &&
              l.bbox[3] > lineTop &&
              l.bbox[0] < p.bbox.x + p.bbox.w &&
              l.bbox[2] > p.bbox.x
          );
          return {
            text: lineText + (li < p.lines.length - 1 ? "\n" : ""),
            options: link ? { underline: { style: "sng" } } : {},
          };
        });

        slide.addText(runs, {
          x: ptToIn(x),
          y: ptToIn(p.bbox.y),
          w: ptToIn(p.bbox.w + 2 * pad),
          h: ptToIn(p.bbox.h),
          fontFace: p.fontName,
          fontSize: p.fontSize,
          color: p.colorHex,
          bold: p.bold,
          italic: p.italic,
          align: p.align,
          valign: "top",
          margin: 0,
          ...(p.lineSpacingPt
            ? { lineSpacingMultiple: spacingMultiple(p.lineSpacingPt, p.fontSize) }
            : {}),
        });
      });

      // ---------- Link hotspots ----------
            links.forEach((l, idx) => {
        if (usedLinks.has(idx)) return; // image par already link lag chuka hai
        slide.addImage({
          data: clearData,
          x: ptToIn(l.bbox[0]),
          y: ptToIn(l.bbox[1]),
          w: ptToIn(l.bbox[2] - l.bbox[0]),
          h: ptToIn(l.bbox[3] - l.bbox[1]),
          hyperlink: { url: l.uri },
        });
      });
    }

    const outBuffer = await pptx.write({ outputType: "nodebuffer" });
    res.setHeader("Content-Disposition", "attachment; filename=converted.pptx");
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    );
    res.send(outBuffer);
  } catch (err) {
    console.error("PDF→PPTX (JS) conversion failed:", err);
    res.status(500).json({ error: "Conversion failed", detail: err.message });
  }
}



