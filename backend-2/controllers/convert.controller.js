// controllers/convert.controller.js
import libre from 'libreoffice-convert';
import fs from 'fs';

export const convertDocxToPdf = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const docxBuf = fs.readFileSync(req.file.path);

    const pdfBuf = await new Promise((resolve, reject) => {
      libre.convert(docxBuf, '.pdf', undefined, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });

    fs.unlinkSync(req.file.path);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename=converted.pdf',
    });
    res.send(pdfBuf);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Conversion failed', detail: err.message });
  }
};