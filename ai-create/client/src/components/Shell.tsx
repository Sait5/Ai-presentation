import { useState } from 'react'
import { Link, Navigate, Outlet, useNavigate } from 'react-router-dom'
import { Brand } from './Brand'
import { messageOf, signOut, useSession } from '../features/auth/session'
import { useEditor } from '../features/editor/store'

export function Shell() {
  const { user, ready } = useSession()
  const [error, setError] = useState('')
  const navigate = useNavigate()
  if (!ready) return <div className="loading">Восстанавливаем сессию…</div>
  if (!user) return <Navigate to="/login" replace />
  async function logout() {
    if (useEditor.getState().dirty && !window.confirm('В документе есть несохранённые изменения. Выйти без сохранения?')) return
    try { await signOut(); useEditor.setState({ dirty: false }); navigate('/login') }
    catch (error) { setError(messageOf(error)) }
  }
  return <div className="app-shell"><aside className="sidebar"><Link to="/app" aria-label="Forma — документы"><Brand /></Link>
    <div className="workspace-label"><span className="workspace-avatar">Л</span><div>Личное пространство<small>Только для вас</small></div></div>
    <span className="nav-caption">РАБОЧЕЕ ПРОСТРАНСТВО</span><Link className="nav-link active" to="/app"><span aria-hidden="true">▤</span> Мои документы</Link>
    <div className="sidebar-note"><span className="note-icon">✧</span><strong>Больше места для мыслей</strong><p>Начните с чистого листа.<br />Придайте идее форму.</p></div>
    <div className="account"><span className="avatar">{user.email.charAt(0).toUpperCase()}</span><div><strong>Мой аккаунт</strong><small title={user.email}>{user.email}</small></div><button className="icon-button" onClick={logout} aria-label="Выйти" title="Выйти">↗</button></div>
  </aside><div className="main-area"><header className="topbar"><span>Личное пространство <span className="breadcrumb-slash">/</span> <strong>Документы</strong></span><span className="private-badge">● Только вы</span></header>
    {error && <div className="notice error" role="alert">{error}</div>}<Outlet /></div></div>
}
