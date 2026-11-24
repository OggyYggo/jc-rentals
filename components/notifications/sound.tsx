"use client";

import { createContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

const soundPreferenceKey = "kuyog-notification-sound";
const soundPreferenceEvent = "kuyog-notification-sound-change";

function subscribeToPreference(callback: () => void) {
  window.addEventListener(soundPreferenceEvent, callback);
  return () => window.removeEventListener(soundPreferenceEvent, callback);
}

function getSoundPreference() {
  return sessionStorage.getItem(soundPreferenceKey) === "enabled";
}

function setSoundPreference(enabled: boolean) {
  if (enabled) sessionStorage.setItem(soundPreferenceKey, "enabled");
  else sessionStorage.removeItem(soundPreferenceKey);
  window.dispatchEvent(new Event(soundPreferenceEvent));
}

export const NotificationSoundContext = createContext({
  enabled: false,
  blocked: false,
  busy: false,
  error: "",
  toggle: () => {},
});

export function NotificationSoundProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const enabled = useSyncExternalStore(subscribeToPreference, getSoundPreference, () => false);
  const [blocked, setBlocked] = useState(false);
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
      void audio.play().then(
        () => {
          setBlocked(false);
          setError("");
        },
        (error: unknown) => {
          if (!getSoundPreference() || (error instanceof DOMException && error.name === "AbortError")) return;
          setBlocked(true);
          setError("The browser blocked the chime. Tap Resume sound to allow playback again.");
        },
      );
    }).subscribe();
    return () => { void db.removeChannel(channel); };
  }, [enabled, userId]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio || busy) return;
    setError("");
    if (enabled && !blocked) {
      setSoundPreference(false);
      audio.pause();
      setUserId(null);
      return;
    }

    setBusy(true);
    try {
      audio.currentTime = 0;
      await audio.play();
      setSoundPreference(true);
      setBlocked(false);
    } catch {
      setError("Could not play the notification sound. Check your browser audio settings and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <NotificationSoundContext.Provider value={{ enabled, blocked, busy, error, toggle }}>
      <audio ref={audioRef} src="/sounds/Notif%20Sound.mp3" preload="none" />
      {children}
    </NotificationSoundContext.Provider>
  );
}
