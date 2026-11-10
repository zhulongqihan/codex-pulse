import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCodexResetHistory, fetchLatestCodexReset, type CodexResetAnnouncement } from "@/lib/api";

/** Reset announcements are a separate network source, never a local-log scan. */
export function useCodexResetOverview(days: number) {
  const [latest, setLatest] = useState<CodexResetAnnouncement | null>(null);
  const [history, setHistory] = useState<CodexResetAnnouncement[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(false);
  const inFlight = useRef<{ days: number; promise: Promise<void> } | null>(null);
  const currentDays = useRef(days);
  currentDays.current = days;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const refresh = useCallback((): Promise<void> => {
    if (inFlight.current?.days === days) return inFlight.current.promise;
    setIsLoading(true);
    const request = { days, promise: Promise.resolve() };
    inFlight.current = request;
    request.promise = (async () => {
      const [nextLatest, nextHistory] = await Promise.allSettled([
        fetchLatestCodexReset(), fetchCodexResetHistory(days),
      ]);
      if (!mounted.current || currentDays.current !== days || inFlight.current !== request) return;
      // Retain each last successful result independently. One success must not hide the other failure.
      if (nextLatest.status === "fulfilled") setLatest(nextLatest.value);
      if (nextHistory.status === "fulfilled") setHistory(nextHistory.value);
      const failure = [nextLatest, nextHistory].find(result => result.status === "rejected");
      setError(failure?.status === "rejected"
        ? failure.reason instanceof Error ? failure.reason.message : String(failure.reason ?? "Reset service unavailable")
        : null);
    })().finally(() => {
      if (inFlight.current === request) {
        inFlight.current = null;
        if (mounted.current) setIsLoading(false);
      }
    });
    return request.promise;
  }, [days]);

  return { latest, history, isLoading, error, refresh };
}
