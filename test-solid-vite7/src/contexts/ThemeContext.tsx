import { createContext, useContext, createSignal, ParentComponent } from 'solid-js';

export type Theme = 'light' | 'dark' | 'system';

interface ThemeContextValue {
  theme: () => Theme;
  setTheme: (theme: Theme) => void;
  isDark: () => boolean;
}

const ThemeContext = createContext<ThemeContextValue>();

export const ThemeProvider: ParentComponent = (props) => {
  const [theme, setTheme] = createSignal<Theme>('system');

  const isDark = () => {
    const t = theme();
    if (t === 'system') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    return t === 'dark';
  };

  const value: ThemeContextValue = {
    theme,
    setTheme,
    isDark,
  };

  return (
    <ThemeContext.Provider value={value}>
      {props.children}
    </ThemeContext.Provider>
  );
};

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
