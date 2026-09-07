// routes/convert.routes.js
import express from 'express';
import multer from 'multer';
import { convertDocxToPdf } from '../controllers/convert.controller.js';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post('/convert', upload.single('docxFile'), convertDocxToPdf);

export default router;


/* 

const express = require("express");
const multer = require("multer");
const { convertPdfToPptx } = require("../controllers/pdf.controller");

const router = express.Router();
const upload = multer({ dest: "uploads/" });   // temp storage location

router.post("/convert", upload.single("pdfFile"), convertPdfToPptx);

module.exports = router;
*/