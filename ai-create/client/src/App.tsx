import { useEffect } from 'react'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom'
import { refreshSession } from './features/auth/session'
import { AuthPage } from './features/auth/AuthPage'
import { Shell } from './components/Shell'
import { Library } from './features/documents/Library'
import { Editor } from './features/editor/Editor'
import './App.css'

const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/login', element: <AuthPage mode="login" /> },
  { path: '/register', element: <AuthPage mode="register" /> },
  { path: '/app', element: <Shell />, children: [
    { index: true, element: <Library /> },
    { path: 'documents/:id', element: <Editor /> },
  ] },
  { path: '*', element: <Navigate to="/app" replace /> },
])
export default function App() {
  useEffect(() => { void refreshSession().catch(() => {}) }, [])
  return <RouterProvider router={router} />
}
