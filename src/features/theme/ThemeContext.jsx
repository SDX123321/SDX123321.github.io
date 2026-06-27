import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const ThemeContext = createContext()

const STORAGE_KEY = 'site_theme'

function getInitialTheme() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'dark'
  } catch (e) {
    return 'dark'
  }
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  const isLight = theme === 'light'

  const applyTheme = useCallback((light) => {
    if (light) {
      document.documentElement.classList.add('light')
    } else {
      document.documentElement.classList.remove('light')
    }
    try {
      localStorage.setItem(STORAGE_KEY, light ? 'light' : 'dark')
    } catch (e) {}
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'light' ? 'dark' : 'light'
      applyTheme(next === 'light')
      return next
    })
  }, [applyTheme])

  // Apply theme on mount (in case HTML was cached with wrong class)
  useEffect(() => {
    applyTheme(isLight)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={{ theme, isLight, toggleTheme, applyTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
