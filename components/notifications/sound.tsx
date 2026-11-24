"use client";

import { createContext, useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

export const NotificationSoundContext = createContext({
  enabled: false,
  busy: false,
  error: "",
  toggle: () => {},
});

export function NotificationSoundProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const { data: { subscription } } = createClient().auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !userId) return;
    const db = createClient();
    const channel = db.channel(`notification-sound:${userId}`).on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "notifications",
      filter: `user_id=eq.${userId}`,
    }, () => {
      const audio = audioRef.current;
      if (!audio || document.visibilityState !== "visible" || !document.hasFocus()) return;
      audio.currentTime = 0;
      void audio.play().catch(() => {
        setEnabled(false);
        setUserId(null);
        setError("Playback was blocked. Enable sound again to resume.");
      });
    }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [enabled, userId]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || busy) return;
    setError("");
    if (enabled) {
      audio.pause();
      setEnabled(false);
      setUserId(null);
      return;
    }

    setBusy(true);
    try {
      audio.currentTime = 0;
      await audio.play();
      setEnabled(true);
    } catch {
      setError("Could not play the notification sound. Check your browser audio settings and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <NotificationSoundContext.Provider value={{ enabled, busy, error, toggle }}>
      <audio ref={audioRef} src="/sounds/Notif%20Sound.mp3" preload="none" />
      {children}
    </NotificationSoundContext.Provider>
  );
}
