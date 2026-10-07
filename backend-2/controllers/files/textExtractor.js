// 22 sep

import * as mupdf from "mupdf";
// 22 sep

import { rgbToHex } from "./backgroundExtractor.js";

export function extractRawTextFromPage(pdfBuffer, pageIndex) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  const page = doc.loadPage(pageIndex);
  const structuredText = page.toStructuredText("preserve-whitespace");
  return JSON.parse(structuredText.asJSON());
}
export function extractLineColors(pdfBuffer, pageIndex) {
	const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
	const page = doc.loadPage(pageIndex);
	const structuredText = page.toStructuredText("preserve-whitespace");

	const lineColors = [];
	let currentLineChars = null;

	const walker = {
		beginLine(bbox, wmode, direction) {
			currentLineChars = [];
		},
		onChar(c, origin, font, size, quad, color, flags) {
			if (currentLineChars) {
				currentLineChars.push(color);
			}
		},
		endLine() {
			if (currentLineChars) {
				const first = currentLineChars[0];
				const isUniform = currentLineChars.every(
					(c) => c[0] === first[0] && c[1] === first[1] && c[2] === first[2],
				);
				lineColors.push({
					representativeColor: first,
					isUniform,
					charCount: currentLineChars.length,
				});
				currentLineChars = null;
			}
		},
	};

	structuredText.walk(walker);
	return lineColors;
}

export function getTotalPages(pdfBuffer) {
  const doc = mupdf.Document.openDocument(pdfBuffer, "application/pdf");
  return doc.countPages();
}


export function groupLinesIntoParagraphs(flatLines) {
  const paragraphs = [];
  let currentGroup = null;

  for (const line of flatLines) {
    if (currentGroup === null) {
      currentGroup = { lines: [line] };
      continue;
    }
    const prev = currentGroup.lines[currentGroup.lines.length - 1];
    const size = line.font.size;
    const tol = Math.max(10, size * 0.3);

    const sameSize = prev.font.size === line.font.size;

    // upper AND lower bound: side-by-side columns ka negative-gap wala latent bug bhi yahin band hota hai
    const verticalGap = line.bbox.y - (prev.bbox.y + prev.bbox.h);
    const closeEnough = verticalGap <= size * 1.3 && verticalGap >= -size * 0.5;

    const prevL = prev.bbox.x, prevR = prev.bbox.x + prev.bbox.w;
    const curL = line.bbox.x, curR = line.bbox.x + line.bbox.w;
    const leftMatch = Math.abs(prevL - curL) <= tol;
    const prevIsBullet = /^[▪•◦●■\-–]/.test(prev.text.trim());
    const sameFont = prev.font.name === line.font.name || prevIsBullet;
        const hangingIndent =
      prevIsBullet && curL > prevL && curL - prevL <= size * 2.5;
    const rightMatch = Math.abs(prevR - curR) <= tol;
    const centerMatch = Math.abs((prevL + prevR) / 2 - (curL + curR) / 2) <= tol;
    if (sameFont && sameSize && closeEnough && (leftMatch || centerMatch || rightMatch || hangingIndent)) {
     
      currentGroup.lines.push(line);
    } else {
      paragraphs.push(currentGroup);
      currentGroup = { lines: [line] };
    }
  }
  if (currentGroup) paragraphs.push(currentGroup);

  return paragraphs.map((group) => {
    const lines = group.lines;
    const first = lines[0];
    const minX = Math.min(...lines.map((l) => l.bbox.x));
    const minY = Math.min(...lines.map((l) => l.bbox.y));
    const maxX = Math.max(...lines.map((l) => l.bbox.x + l.bbox.w));
    const maxY = Math.max(...lines.map((l) => l.bbox.y + l.bbox.h));
    return {
      text: lines.map((l) => l.text.trim()).join(" ").trim(),
      lines: lines.map((l) => l.text.trim()),          // original line-breaks
      bbox: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      font: first.font,
      colorRgb: first.colorRgb,
      align: detectAlignment(lines),
      // baseline-to-baseline distance (line.y baseline hai)
      lineSpacingPt: lines.length > 1 ? (lines[lines.length - 1].y - first.y) / (lines.length - 1) : null,
      lineCount: lines.length,
    };
  });
}
export function extractStyledParagraphs(pdfBuffer, pageIndex) {
  const rawData = extractRawTextFromPage(pdfBuffer, pageIndex);
  const colorData = extractLineColors(pdfBuffer, pageIndex);

  const flatLines = [];
  rawData.blocks.forEach((block) => {
    if (block.type !== "text") return;
    block.lines.forEach((line) => flatLines.push(line));
  });

  flatLines.forEach((line, idx) => {
    line.colorRgb = colorData[idx]?.representativeColor || [0, 0, 0];
     
  });

  const paragraphs = groupLinesIntoParagraphs(flatLines);

  
  return paragraphs.map((p) => ({
    text: p.text,
    bbox: p.bbox,
     lines: p.lines,  
    fontName: cleanFontName(p.font.name),
    fontSize: p.font.size,
    bold: p.font.weight === "bold" || /bold|black|heavy/i.test(p.font.name),
     italic: p.font.style === "italic" || /italic|oblique/i.test(p.font.name),
    colorHex: rgbToHex(p.colorRgb),
    align: p.align,
    lineSpacingPt: p.lineSpacingPt,
  }));
}

export function cleanFontName (rawName){
const noprefix=rawName.replace(/^[A-Z]{6}\+/, "");
let family=noprefix.split("-")[0];
family=family.replace(/MT$/, "");
return family.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function detectAlignment(lines){
if(lines.length < 2) return "left";
const spread=(vals)=>Math.max(...vals) - Math.min(...vals);
const T = Math.max(4,lines[0].font.size * 0.2);
const lefts=lines.map((l)=>l.bbox.x)
const rights=lines.map((l)=>l.bbox.x + l.bbox.w);
const centers=lines.map((l)=>l.bbox.x + l.bbox.w/2);
if(spread(lefts)<=T) return "left";
if (spread(centers)<=T)return "center"
if (spread(rights)<=T)return "center";
return "left";

}


