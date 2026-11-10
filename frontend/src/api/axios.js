import axios from "axios";

const api = axios.create({
  // use localhost for local development and vercel for production deployment
  //baseURL: "http://localhost:5000/api",
  baseURL: "https://dpc-oj-backend.vercel.app/api",
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config;
  },
  (error) => Promise.reject(error),
);

export default api;
