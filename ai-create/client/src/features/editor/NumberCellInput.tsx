import { useState } from 'react'

export function NumberCellInput({ value, update }: { value: number; update: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value))
  const [error, setError] = useState('')
  return <><input aria-label="Значение выбранной ячейки" inputMode="decimal" value={draft} onChange={event => {
    const text = event.target.value
    setDraft(text); setError('')
    if (text.trim() && Number.isFinite(Number(text.replace(',', '.')))) update(Number(text.replace(',', '.')))
  }} onBlur={() => {
    if (!draft.trim() || !Number.isFinite(Number(draft.replace(',', '.')))) setError('Введите число. В ячейке осталось последнее корректное значение.')
    setDraft(String(value))
  }} />{error && <span role="alert" className="notice error">{error}</span>}</>
}
