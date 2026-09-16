import { useEffect, useRef } from 'react'

export function UnsavedDialog({ onStay, onLeave, onSave }: { onStay: () => void; onLeave: () => void; onSave: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={dialog} className="dialog" aria-labelledby="leave-title" onCancel={onStay}>
    <h2 id="leave-title">Есть несохранённые изменения</h2><p>Сохраните документ перед переходом или останьтесь в редакторе.</p>
    <div><button onClick={onStay}>Остаться</button><button onClick={onLeave}>Уйти без сохранения</button><button className="primary" onClick={() => void onSave()}>Сохранить и перейти</button></div>
  </dialog>
}
