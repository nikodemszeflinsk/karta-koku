import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/** Auto-lock after this much inactivity. */
const AUTO_LOCK_MS = 15 * 60 * 1000;

interface VaultState {
  /** Non-extractable AES-GCM key; exists only in this tab's memory while unlocked. */
  dek: CryptoKey | null;
  unlock: (dek: CryptoKey) => void;
  lock: () => void;
}

const Ctx = createContext<VaultState | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [dek, setDek] = useState<CryptoKey | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const lock = useCallback(() => setDek(null), []);
  const arm = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setDek(null), AUTO_LOCK_MS);
  }, []);
  const unlock = useCallback(
    (k: CryptoKey) => {
      setDek(k);
      arm();
    },
    [arm],
  );

  useEffect(() => {
    if (!dek) return;
    const onActivity = () => arm();
    const events = ["pointerdown", "keydown"] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [dek, arm]);

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const value = useMemo(() => ({ dek, unlock, lock }), [dek, unlock, lock]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useVault(): VaultState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useVault outside VaultProvider");
  return v;
}
