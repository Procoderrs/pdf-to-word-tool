/* 
VITE_PYTHON_API_URL=https://pdf-to-word-tool-psi.vercel.app
VITE_PYTHON_API_URL=http://localhost:5001

*/

import axios from "axios";

// Points directly to the Python Flask API (deployed separately on Vercel) —
// Node.js is no longer in this request path.
const pythonApi = axios.create({
  baseURL: import.meta.env.VITE_PYTHON_API_URL,
});

export default pythonApi;






