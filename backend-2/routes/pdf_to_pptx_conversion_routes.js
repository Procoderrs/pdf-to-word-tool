import express from "express";
import multer from "multer";
import { convertPdfToPptx } from "../controllers/pdf_to_pptx_conversion_controller.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });   // temp storage location

router.post("/convert", upload.single("pdfFile"), convertPdfToPptx);

export default router;