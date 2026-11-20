import { useSyncExternalStore } from "react";

/* "Add to home screen": captures Chrome/Android's install prompt and detects iOS / installed state. */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Call once at startup, before React renders (the event can fire early). */
export function initInstallPrompt() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export function isStandalone(): boolean {
  return matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Browsers built into other apps (Messenger, Instagram, WhatsApp, Gmail…) usually cannot add to the home screen. */
export function inAppBrowser(): string | null {
  const ua = navigator.userAgent;
  if (/FBAN|FBAV|FB_IAB|Messenger/i.test(ua)) return "Messenger/Facebook";
  if (/Instagram/i.test(ua)) return "Instagram";
  if (/WhatsApp/i.test(ua)) return "WhatsApp";
  if (/Line\//.test(ua)) return "LINE";
  if (/GSA\//.test(ua)) return "Google";
  if (/; wv\)/.test(ua)) return "aplikacji";
  return null;
}

/** iPhone browser other than Safari (Chrome/Firefox/Edge on iOS). */
export function iosBrowser(): "safari" | "chrome" | "other" {
  const ua = navigator.userAgent;
  if (/CriOS/.test(ua)) return "chrome";
  if (/FxiOS|EdgiOS|OPiOS/.test(ua)) return "other";
  return "safari";
}

export type Platform = "ios" | "android" | "other";
export function platform(): Platform {
  const ua = navigator.userAgent;
  // iPadOS reports itself as Mac; touch points tell them apart.
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
}

export function useInstall() {
  const snap = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (installed ? "installed" : deferred ? "prompt" : "none"),
    () => "none",
  );
  return {
    installed: snap === "installed" || isStandalone(),
    canPrompt: snap === "prompt",
    platform: platform(),
    async prompt(): Promise<boolean> {
      if (!deferred) return false;
      const e = deferred;
      deferred = null;
      await e.prompt();
      const { outcome } = await e.userChoice;
      emit();
      return outcome === "accepted";
    },
  };
}

const DISMISS_KEY = "scl-install-dismissed";
export function installDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}
export function dismissInstall() {
  try {
    localStorage.setItem(DISMISS_KEY, "1");
  } catch {
    /* storage unavailable: banner just comes back next time */
  }
}
