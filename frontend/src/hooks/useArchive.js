import { useEffect, useState } from "react";
import api from "../api/axios";

export default function useArchive(kind, query, refreshKey) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let inFlight = false;
    setData(null);
    setLoading(true);
    setError("");
    async function load() {
      if (controller.signal.aborted || inFlight) return;
      inFlight = true;
      setUpdating(true);
      clearTimeout(timer);
      try {
        const response = await api.get(`/${kind}/archive?${query}`, {
          signal: controller.signal,
        });
        const result = response.data;
        if (
          !result ||
          !Array.isArray(result.items) ||
          !result.pagination ||
          !result.summary
        )
          throw new Error(
            "Unexpected archive response. Check that the updated backend is running.",
          );
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e.response?.data?.error ||
              e.message ||
              "Unable to load the archive.",
          );
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          setUpdating(false);
          if (kind === "contests") timer = setTimeout(load, 30000);
        }
      }
    }
    function visible() {
      if (document.visibilityState === "visible" && kind === "contests") load();
    }
    load();
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [kind, query, refreshKey]);
  return { data, loading, updating, error };
}
