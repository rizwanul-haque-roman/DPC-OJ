import { useEffect, useState } from "react";
import api from "../api/axios";

export function getPublicContestStatus(contest, now) {
  const start = Date.parse(contest.start_time);
  const end = Date.parse(
    contest.effective_end_time || contest.ended_at || contest.end_time,
  );
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
    return "invalid";
  return now < start ? "upcoming" : now < end ? "live" : "ended";
}

export default function usePublicContest(id, refreshKey = 0) {
  const [contest, setContest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [warning, setWarning] = useState("");
  const [offset, setOffset] = useState(0);
  const [localNow, setLocalNow] = useState(Date.now());
  useEffect(() => {
    const controller = new AbortController();
    let timer;
    let inFlight = false;
    let loaded = false;
    setContest(null);
    setLoading(true);
    setError("");
    setWarning("");
    setNotFound(false);
    const valid =
      /^[1-9]\d*$/.test(String(id)) && Number.isSafeInteger(Number(id));
    async function load() {
      if (controller.signal.aborted || inFlight) return;
      if (!valid) {
        setError("The contest ID is invalid.");
        setNotFound(true);
        setLoading(false);
        return;
      }
      clearTimeout(timer);
      inFlight = true;
      try {
        const response = await api.get(`/contests/${id}`, {
          signal: controller.signal,
        });
        const data = response.data;
        if (
          !data ||
          Number(data.id) !== Number(id) ||
          !Array.isArray(data.problems)
        )
          throw new Error("Unexpected contest response.");
        if (controller.signal.aborted) return;
        const server = Date.parse(data.server_time);
        setOffset(Number.isFinite(server) ? server - Date.now() : 0);
        setContest(data);
        setWarning("");
        setError("");
        setNotFound(false);
        loaded = true;
      } catch (e) {
        if (controller.signal.aborted) return;
        const text =
          e.response?.data?.error || e.message || "Unable to load the contest.";
        if (e.response?.status === 404 || !loaded) {
          setError(text);
          setNotFound(e.response?.status === 404);
          setContest(null);
        } else
          setWarning(
            "Could not refresh the schedule. Showing the last loaded information.",
          );
      } finally {
        inFlight = false;
        if (!controller.signal.aborted) {
          setLoading(false);
          timer = setTimeout(load, 15000);
        }
      }
    }
    function visible() {
      if (document.visibilityState === "visible") load();
    }
    load();
    document.addEventListener("visibilitychange", visible);
    return () => {
      controller.abort();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [id, refreshKey]);
  useEffect(() => {
    const timer = setInterval(() => setLocalNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return { contest, loading, error, notFound, warning, now: localNow + offset };
}
