/* import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  withCredentials:true,
});


export default api; */


import axios from "axios";

// Points directly to the Python Flask API (deployed separately on Vercel) —
// Node.js is no longer in this request path.
const pythonApi = axios.create({
  baseURL: import.meta.env.VITE_PYTHON_API_URL,
});

export default pythonApi;