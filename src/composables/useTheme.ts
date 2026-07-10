import { computed, readonly, ref } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'site_theme'
const initialTheme = (): Theme => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === 'dark' || stored === 'light') return stored
  } catch {
    // Storage can be unavailable in privacy mode.
  }
  return 'dark'
}

const theme = ref<Theme>(initialTheme())

function applyTheme(next: Theme) {
  theme.value = next
  document.documentElement.dataset.theme = next
  document.documentElement.classList.toggle('light', next === 'light')
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Theme still works for the current session.
  }
}

applyTheme(theme.value)

export function useTheme() {
  return {
    theme: readonly(theme),
    isDark: computed(() => theme.value === 'dark'),
    setTheme: applyTheme,
    toggleTheme: () => applyTheme(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
