// src/axios.js
import axios from "axios";

 
const instance = axios.create({
    baseURL: "https://backend-production-c40d.up.railway.app",   // <-- FastAPI port
  });
  
export default instance;
