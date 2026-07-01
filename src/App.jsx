import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Outlet, Link } from 'react-router-dom'
import { ThemeProvider } from './features/theme/ThemeContext'
import ThemeToggle from './features/theme/ThemeToggle'
import PWAManager from './features/pwa/PWAManager'
import { runMigration } from './lib/storage'

const HomePage = lazy(() => import('./routes/HomePage'))
const CourseLayout = lazy(() => import('./routes/courses/CourseLayout'))
const AlgorithmExercisesPage = lazy(() => import('./routes/courses/AlgorithmExercisesPage'))
const OsExercisesPage = lazy(() => import('./routes/courses/OsExercisesPage'))
const MarxismReviewPage = lazy(() => import('./routes/courses/MarxismReviewPage'))

function Loading() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text)' }}>
      <p>加载中…</p>
    </div>
  )
}

function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text)' }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '12px' }}>404</h1>
      <p style={{ color: 'var(--text-light)' }}>页面不存在</p>
      <Link to="/" style={{ color: 'var(--accent)', marginTop: 16, display: 'inline-block' }}>← 返回首页</Link>
    </div>
  )
}

/** Root layout: theme toggle + PWA + migration */
function RootLayout() {
  useEffect(() => {
    runMigration()
  }, [])

  return (
    <>
      <ThemeToggle />
      <PWAManager />
      <Outlet />
    </>
  )
}

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      {
        path: '/',
        element: <Suspense fallback={<Loading />}><HomePage /></Suspense>,
      },
      {
        path: '/courses/:courseId/*',
        element: <Suspense fallback={<Loading />}><CourseLayout /></Suspense>,
      },
      {
        path: '/courses/algorithm/exercises',
        element: <Suspense fallback={<Loading />}><AlgorithmExercisesPage /></Suspense>,
      },
      {
        path: '/courses/os/exercises',
        element: <Suspense fallback={<Loading />}><OsExercisesPage /></Suspense>,
      },
      {
        path: '/courses/marxism/review',
        element: <Suspense fallback={<Loading />}><MarxismReviewPage /></Suspense>,
      },
      {
        path: '*',
        element: <NotFound />,
      },
    ],
  },
])

export default function App() {
  return (
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>
  )
}
