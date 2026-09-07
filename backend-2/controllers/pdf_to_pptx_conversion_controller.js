import path from 'path';
import fs from 'fs';
import pptxgen from 'pptxgenjs';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// apne venv ka python path use karo (jaise pdf-to-word tool mein use kar rahe ho)
const PYTHON_BIN = process.env.PYTHON_BIN || path.join(__dirname, '../venv/bin/python3');
const EXTRACT_SCRIPT = path.join(__dirname, '../scripts/extract_and_render.py');
const POINTS_PER_INCH = 72;

const mapFontName = (pdfFont = '') => {
  const f = pdfFont.toLowerCase();
  if (f.includes('times')) return 'Times New Roman';
  if (f.includes('courier') || f.includes('mono')) return 'Courier New';
  return 'Arial'; // safe cross-platform default
};

const extractPdfData = async (pdfPath, outputDir) => {
  const { stdout } = await execFileAsync(PYTHON_BIN, [EXTRACT_SCRIPT, pdfPath, outputDir], {
    maxBuffer: 1024 * 1024 * 50,
    timeout: 60000, // 60 second max
  });
  const jsonPath = stdout.trim().split('\n').pop();
  const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
  return JSON.parse(jsonContent);
};
const buildPptxFromData = async (pagesData, outputDir) => {
  const pptx = new pptxgen();

  const firstPage = pagesData[0];
  const widthIn = firstPage.width / POINTS_PER_INCH;
  const heightIn = firstPage.height / POINTS_PER_INCH;

  pptx.defineLayout({ name: 'PDF_LAYOUT', width: widthIn, height: heightIn });
  pptx.layout = 'PDF_LAYOUT';

  for (const page of pagesData) {
    const slide = pptx.addSlide();

    slide.addImage({ path: page.image, x: 0, y: 0, w: widthIn, h: heightIn });

   for (const span of page.spans) {
  const x = span.x0 / POINTS_PER_INCH;
  const y = span.y0 / POINTS_PER_INCH;
  const w = (span.x1 - span.x0) / POINTS_PER_INCH;
  const h = (span.y1 - span.y0) / POINTS_PER_INCH;

  slide.addText(span.text, {
  x, y,
  w: Math.max(w, 0.1) + 0.15,
  h: Math.max(h, 0.1) + 0.03,
  fontSize: Math.max(Math.round(span.size * 0.95), 6),
  fontFace: mapFontName(span.font),
  color: span.color,
  bold: span.bold,
  italic: span.italic,
  margin: 0,
  valign: 'top',
  align: 'left',
  wrap: false,
  fit: 'none',
  fill: { type: 'none' },
  line: { type: 'none' },
});
}
  }

  const pptxPath = path.join(outputDir, 'output.pptx');
  await pptx.writeFile({ fileName: pptxPath });
  return pptxPath;
};

const convertPdfToPptx = async (req, res) => {
  try {
    const pdfPath = req.file.path;
    const outputDir = path.join(__dirname, '../temp', Date.now().toString());
    fs.mkdirSync(outputDir, { recursive: true });

    const pagesData = await extractPdfData(pdfPath, outputDir);
    const pptxPath = await buildPptxFromData(pagesData, outputDir);

    res.download(pptxPath, 'converted.pptx', (err) => {
      if (err) console.error('Download error:', err);
      fs.rmSync(outputDir, { recursive: true, force: true });
      fs.unlinkSync(pdfPath);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Conversion failed', error: err.message });
  }
};

export { convertPdfToPptx };