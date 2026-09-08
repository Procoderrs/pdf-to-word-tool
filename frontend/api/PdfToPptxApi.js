import axios from "axios";

const pdfToPptxApi = axios.create({
  baseURL: "http://localhost:5000/api/pdf",
});

export default pdfToPptxApi;