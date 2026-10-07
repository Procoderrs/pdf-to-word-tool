import express from "express";
import multer from "multer";

 

import   convertPdfToPptxJS from '../controllers/pdfConvertController.js'

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
router.post("/convert", upload.single("pdfFile"), convertPdfToPptxJS); 
export default router;