import { useTheme } from './ThemeContext'

export default function ThemeToggle() {
  const { isLight, toggleTheme } = useTheme()

  return (
    <button
      className="theme-toggle"
      title="切换深浅色模式 (T)"
      onClick={toggleTheme}
    >
      {isLight ? '☀' : '☽'}
    </button>
  )
}
