// api/pdfToDocsApi.js
import axios from "axios";

const pdfToDocsApi = axios.create({
  baseURL: "http://localhost:5001",
});

export default pdfToDocsApi;