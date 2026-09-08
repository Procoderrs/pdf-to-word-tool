import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import PdfToPptx from "./pages/PdfToPptx";
import WordToPdf from "./pages/WordtoPdf";
import PdfToDocs from "./pages/PdfToDocs";

function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <Routes>
        <Route path="/" element={<Navigate to="/pdf-to-pptx" />} />
        <Route path="/pdf-to-pptx" element={<PdfToPptx />} />
        <Route path="/word-to-pdf" element={<WordToPdf />} />
        <Route path="/pdf-to-docs" element={<PdfToDocs />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;