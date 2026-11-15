import React, { createContext, useContext, useEffect, useState } from 'react';
export type Theme = 'light' | 'dark' | 'system';
const ThemeContext = createContext<{theme: Theme; setTheme: (theme: Theme) => void}>({theme: 'system', setTheme: () => {}});
export function readTheme(): Theme {
  try { const saved = localStorage.getItem('fzee-theme'); return saved === 'light' || saved === 'dark' ? saved : 'system'; } catch { return 'system'; }
}
export function ThemeProvider({children}: {children: React.ReactNode}) {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolved === 'dark' ? '#101114' : '#f8fafc');
    };
    apply(); media.addEventListener('change', apply);
    try { localStorage.setItem('fzee-theme', theme); } catch { /* Theme still works without browser storage. */ }
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  return <ThemeContext.Provider value={{theme, setTheme}}>{children}</ThemeContext.Provider>;
}
export function ThemeSwitch() {
  const {theme, setTheme} = useContext(ThemeContext);
  return <label className="theme-switch"><span aria-hidden="true">◐</span><span className="sr-only">Appearance</span><select aria-label="Appearance" value={theme} onChange={e => setTheme(e.target.value as Theme)}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>;
}
