// routes/convert.routes.js
import express from 'express';
import multer from 'multer';
import { convertDocxToPdf } from '../controllers/convert.controller.js';

const upload = multer({ dest: 'uploads/' });
const router = express.Router();

router.post('/convert', upload.single('docxFile'), convertDocxToPdf);

export default router;


