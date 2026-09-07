import express from "express";
import multer from "multer";
import { convertPdfToPptx } from "../controllers/conversion.controller.js";

const router = express.Router();
const upload = multer({ dest: "uploads/" });   // temp storage location

router.post("/convert", upload.single("pdfFile"), convertPdfToPptx);

export default router;