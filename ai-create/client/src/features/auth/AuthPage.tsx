import { useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Brand } from '../../components/Brand'
import { messageOf, signIn, useSession } from './session'

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const user = useSession((state) => state.user)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (user) return <Navigate to="/app" replace />
  const register = mode === 'register'
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    setBusy(true); setError('')
    try { await signIn(mode, String(data.get('email')).trim(), String(data.get('password'))) }
    catch (error) { setError(messageOf(error)) }
    finally { setBusy(false) }
  }
  return <main className="auth-page"><section className="auth-story"><Brand />
    <div><span className="eyebrow">ПРОСТРАНСТВО ДЛЯ ВАШИХ ИДЕЙ</span><h1>Хорошие мысли<br />заслуживают<br /><em>хорошей формы.</em></h1>
      <p>Создавайте документы, которые хочется читать.<br />Всё важное — в одном спокойном пространстве.</p></div>
    <span className="small-note">Документы · Редактирование · PDF</span>
  </section><section className="auth-form-panel"><div className="auth-form-wrap"><span className="eyebrow">НАЧНЁМ С ГЛАВНОГО</span>
    <h2>{register ? 'Ваше новое пространство' : 'С возвращением'}</h2><p className="muted">{register ? 'Создайте аккаунт и свой первый документ.' : 'Войдите, чтобы продолжить работу с документами.'}</p>
    <form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="email" placeholder="you@company.ru" required maxLength={254} /></label>
      <label>Пароль<input name="password" type="password" autoComplete={register ? 'new-password' : 'current-password'} required minLength={10} placeholder="Не менее 10 символов" /></label>
      {error && <p className="notice error" role="alert">{error}</p>}<button className="primary" disabled={busy}>{busy ? 'Подождите…' : register ? 'Создать аккаунт →' : 'Войти в пространство →'}</button>
    </form><p className="auth-switch">{register ? 'Уже есть аккаунт?' : 'Ещё нет аккаунта?'} <Link to={register ? '/login' : '/register'}>{register ? 'Войти' : 'Зарегистрироваться'}</Link></p>
    <p className="small-note">Ваши документы доступны только вам.</p></div></section></main>
}
