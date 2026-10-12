import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { RuleError } from './domain/actions';
import { buildSeed } from './domain/seed';
import type { AppState, Colleague } from './domain/types';

const STORAGE_KEY = 'idea-pipeline-prototype-v2';
const DEFAULT_COLLEAGUE = 'c-jonah';

interface Saved {
  state: AppState;
  meId: string;
}

interface Flash {
  kind: 'success' | 'error';
  text: string;
}

interface AppContext {
  state: AppState;
  /** The colleague the prototype is currently being viewed as. Stands in for Google sign-in. */
  me: Colleague;
  setMeId: (id: string) => void;
  /** Applies an action. Returns false and shows the reason if a rule blocks it. */
  run: (action: (state: AppState) => AppState, successMessage?: string) => boolean;
  flash: Flash | null;
  clearFlash: () => void;
  resetDemoData: () => void;
}

const Ctx = createContext<AppContext | null>(null);

function load(): Saved {
  let saved: Saved = { state: buildSeed(), meId: DEFAULT_COLLEAGUE };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const stored = JSON.parse(raw) as Saved;
      if (stored.state?.ideas && stored.state.colleagues.some((c) => c.id === stored.meId)) saved = stored;
    }
  } catch {
    // Storage unavailable or corrupt: fall back to fresh demo data.
  }
  // Demo links can open the prototype as a given colleague, for example ?as=c-dev
  const as = new URLSearchParams(window.location.search).get('as');
  if (as && saved.state.colleagues.some((c) => c.id === as)) saved = { ...saved, meId: as };
  return saved;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [saved, setSaved] = useState<Saved>(load);
  const [flash, setFlash] = useState<Flash | null>(null);
  const stateRef = useRef(saved.state);
  stateRef.current = saved.state;

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch {
      setFlash({
        kind: 'error',
        text: 'Your last change was not saved in this browser. Please check that storage is available, then try again.',
      });
    }
  }, [saved]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 6000);
    return () => clearTimeout(timer);
  }, [flash]);

  const run = useCallback((action: (state: AppState) => AppState, successMessage?: string) => {
    try {
      const next = action(stateRef.current);
      stateRef.current = next;
      setSaved((s) => ({ ...s, state: next }));
      setFlash(successMessage ? { kind: 'success', text: successMessage } : null);
      return true;
    } catch (error) {
      if (!(error instanceof RuleError)) throw error;
      setFlash({ kind: 'error', text: error.message });
      return false;
    }
  }, []);

  const value = useMemo<AppContext>(() => {
    const me = saved.state.colleagues.find((c) => c.id === saved.meId) ?? saved.state.colleagues[0];
    return {
      state: saved.state,
      me,
      setMeId: (meId) => {
        setFlash(null);
        setSaved((s) => ({ ...s, meId }));
      },
      run,
      flash,
      clearFlash: () => setFlash(null),
      resetDemoData: () => {
        setSaved((s) => ({ state: buildSeed(), meId: s.meId }));
        setFlash({ kind: 'success', text: 'The demo data has been reset.' });
      },
    };
  }, [saved, flash, run]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
