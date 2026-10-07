import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import convertRoutes from './routes/convert.routes.js';           // backend-2: word-to-pdf
import PdfToPptx from './routes/pdf_to_pptx_conversion_routes.js'; // backend-3: pdf-to-pptx
import cors from 'cors';

const app = express();
dotenv.config();

app.use(express.json());
app.use(cors());

app.get('/', (req, res) => {
  res.send('api is working');
});

app.use('/api/pdf', PdfToPptx);          // ← original path, frontend isi ko already call kar raha hai
app.use('/api/word', convertRoutes);      // ← naya, alag prefix, taake /api/pdf se clash na ho


const startServer = async () => {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`Server is running on PORT ${PORT}`));
};
startServer();

export default app;