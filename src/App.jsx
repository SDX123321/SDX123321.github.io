import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'

const HomePage = lazy(() => import('./routes/HomePage'))
const CourseLayout = lazy(() => import('./routes/courses/CourseLayout'))

function Loading() {
  return (
    <div style={{ display:'flex',alignItems:'center',justifyContent:'center',height:'100vh',color:'var(--text)' }}>
      <p>加载中…</p>
    </div>
  )
}

function NotFound() {
  return (
    <div style={{ textAlign:'center',padding:'80px 20px',color:'var(--text)' }}>
      <h1 style={{ fontSize:'3rem',marginBottom:'12px' }}>404</h1>
      <p style={{ color:'var(--text-light)' }}>页面不存在</p>
      <a href="/site/" style={{ color:'var(--accent)',marginTop:'16px',display:'inline-block' }}>← 返回首页</a>
    </div>
  )
}

const router = createBrowserRouter([
  {
    path: '/site/',
    element: <Suspense fallback={<Loading />}><HomePage /></Suspense>,
  },
  {
    path: '/site/courses/:courseId/*',
    element: <Suspense fallback={<Loading />}><CourseLayout /></Suspense>,
  },
  {
    path: '*',
    element: <NotFound />,
  },
])

export default function App() {
  return <RouterProvider router={router} />
}
