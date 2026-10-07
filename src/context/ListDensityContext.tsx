import React, { createContext, useContext, useState } from 'react';

export type ListDensity = 'comfortable' | 'compact';

const STORAGE_KEY = 'vs_list_density';

const ListDensityContext = createContext<{
  density: ListDensity;
  setDensity: (d: ListDensity) => void;
  isCompact: boolean;
}>({
  density: 'comfortable',
  setDensity: () => {},
  isCompact: false,
});

export function ListDensityProvider({ children }: { children: React.ReactNode }) {
  const [density, setDensityState] = useState<ListDensity>(() => {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'compact' ? 'compact' : 'comfortable';
    } catch {
      return 'comfortable';
    }
  });

  const setDensity = (d: ListDensity) => {
    setDensityState(d);
    try {
      localStorage.setItem(STORAGE_KEY, d);
    } catch {
      /* ignore */
    }
  };

  return (
    <ListDensityContext.Provider value={{ density, setDensity, isCompact: density === 'compact' }}>
      {children}
    </ListDensityContext.Provider>
  );
}

export function useListDensity() {
  return useContext(ListDensityContext);
}

/** Toggle for progressive list density (U-02). */
export function ListDensityToggle({ className = '' }: { className?: string }) {
  const { density, setDensity } = useListDensity();
  return (
    <div
      className={`inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800 text-[10px] ${className}`}
      role="group"
      aria-label="List density"
    >
      <button
        type="button"
        onClick={() => setDensity('comfortable')}
        className={`px-2 py-1 rounded-md transition-colors ${
          density === 'comfortable'
            ? 'bg-white dark:bg-zinc-800 font-semibold shadow-sm'
            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
        }`}
      >
        Comfortable
      </button>
      <button
        type="button"
        onClick={() => setDensity('compact')}
        className={`px-2 py-1 rounded-md transition-colors ${
          density === 'compact'
            ? 'bg-white dark:bg-zinc-800 font-semibold shadow-sm'
            : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
        }`}
      >
        Compact
      </button>
    </div>
  );
}
