import { useState } from 'react'
import toast from 'react-hot-toast'
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth'
import { auth } from '../lib/firebase'

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleChangePassword(e) {
    e.preventDefault()
    if (!currentPassword || currentPassword.length < 6) {
      toast.error('Informe sua senha atual (mínimo 6 caracteres).')
      return
    }
    if (!newPassword || newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres.')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem.')
      return
    }
    setLoading(true)
    try {
      const user = auth.currentUser
      if (!user) throw new Error('Usuário não autenticado.')
      // Reautenticação
      const credential = EmailAuthProvider.credential(user.email, currentPassword)
      await reauthenticateWithCredential(user, credential)
      await updatePassword(user, newPassword)
      toast.success('Senha alterada com sucesso!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onClose()
    } catch (err) {
      toast.error(err.message || 'Erro ao alterar senha.')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="panel panel-soft w-full max-w-md p-6 relative">
        <button
          className="absolute top-2 right-2 text-zinc-400 hover:text-zinc-700"
          onClick={onClose}
          aria-label="Fechar"
        >
          ×
        </button>
        <h2 className="text-lg font-semibold mb-4">Alterar senha</h2>
        <form className="space-y-4" onSubmit={handleChangePassword}>
          <div>
            <label className="field-label" htmlFor="currentPassword">Senha atual</label>
            <input
              id="currentPassword"
              className="field-input"
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Digite sua senha atual"
              required
              autoComplete="current-password"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="newPassword">Nova senha</label>
            <input
              id="newPassword"
              className="field-input"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              required
              autoComplete="new-password"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="confirmPassword">Confirmar nova senha</label>
            <input
              id="confirmPassword"
              className="field-input"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
            />
          </div>
          <button className="btn-primary w-full" type="submit" disabled={loading}>
            {loading ? 'Alterando...' : 'Alterar senha'}
          </button>
        </form>
      </div>
    </div>
  )
}
