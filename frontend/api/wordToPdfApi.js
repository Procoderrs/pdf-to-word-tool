import axios from "axios";

const wordToPdfApi = axios.create({
  baseURL: "http://localhost:5000/api/word",
});

export default wordToPdfApi;