import toast from 'react-hot-toast'
import { createUserByAdmin } from '../services/authService'
import {
  createUserProfileByAdmin,
  updateUserAccess,
  updateUserName,
  updateUserRole,
} from '../services/firestoreService'

export function useUserAdminActions({
  isAdmin,
  newUserForm,
  setAccessBusyUserId,
  setEditingUserCargo,
  setEditingUserId,
  setEditingUserName,
  setIsCreatingUser,
  setNameBusyUserId,
  setNewUserForm,
  setRoleBusyUserId,
  user,
  usersList,
}) {
  function handleStartEditUserName(entry) {
    setEditingUserId(entry.uid)
    setEditingUserName(String(entry.nome || ''))
    setEditingUserCargo(String(entry.cargo || ''))
  }

  function handleCancelEditUserName() {
    setEditingUserId('')
    setEditingUserName('')
    setEditingUserCargo('')
  }

  async function handleUpdateRole(targetUserId, nextRole) {
    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem alterar perfis.')
      return
    }

    if (targetUserId === user.uid) {
      toast.error('Não é permitido alterar o próprio perfil.')
      return
    }

    setRoleBusyUserId(targetUserId)

    try {
      await updateUserRole(targetUserId, nextRole, user.uid)
      toast.success('Perfil de acesso atualizado.')
    } catch {
      toast.error('Falha ao atualizar perfil do usuario.')
    } finally {
      setRoleBusyUserId('')
    }
  }

  async function handleToggleUserAccess(targetUserId, shouldBlock) {
    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem bloquear acesso.')
      return
    }

    if (targetUserId === user.uid) {
      toast.error('Não é permitido bloquear o próprio acesso.')
      return
    }

    setAccessBusyUserId(targetUserId)

    try {
      await updateUserAccess(targetUserId, shouldBlock, user.uid)
      toast.success(shouldBlock ? 'Acesso bloqueado com sucesso.' : 'Acesso liberado com sucesso.')
    } catch {
      toast.error('Falha ao atualizar status de acesso do usuario.')
    } finally {
      setAccessBusyUserId('')
    }
  }

  async function handleUpdateUserName(targetUserId, nextName, nextCargo) {
    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem atualizar nomes.')
      return
    }

    const normalizedName = String(nextName || '').trim()
    const normalizedCargo = String(nextCargo || '').trim()

    if (!normalizedName) {
      toast.error('Informe um nome válido para o usuário.')
      return
    }

    setNameBusyUserId(targetUserId)

    try {
      await updateUserName(targetUserId, normalizedName, normalizedCargo, user.uid)
      toast.success('Dados do usuário atualizados com sucesso.')
      handleCancelEditUserName()
    } catch {
      toast.error('Falha ao atualizar os dados do usuário.')
    } finally {
      setNameBusyUserId('')
    }
  }

  async function handleCadastrarUsuario(event) {
    event.preventDefault()

    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem cadastrar usuários.')
      return
    }

    const normalizedNome = newUserForm.nome.trim()
    const normalizedCargo = newUserForm.cargo.trim()
    const normalizedEmail = newUserForm.email.trim().toLowerCase()
    const normalizedPassword = newUserForm.password.trim()

    if (!normalizedNome || !normalizedEmail || !normalizedPassword) {
      toast.error('Informe nome, email e senha para o novo usuário.')
      return
    }

    if (normalizedPassword.length < 6) {
      toast.error('A senha deve conter pelo menos 6 caracteres.')
      return
    }

    const emailAlreadyRegistered = usersList.some(
      (entry) => String(entry?.email || '').trim().toLowerCase() === normalizedEmail,
    )

    if (emailAlreadyRegistered) {
      toast.error('Este email já está cadastrado.')
      return
    }

    setIsCreatingUser(true)

    try {
      const createdUser = await createUserByAdmin(normalizedEmail, normalizedPassword)
      await createUserProfileByAdmin(
        createdUser.uid,
        normalizedNome,
        normalizedEmail,
        normalizedCargo,
        newUserForm.role,
        user.uid,
      )

      setNewUserForm({ nome: '', cargo: '', email: '', password: '', role: 'OPERADOR' })
      toast.success('Usuário cadastrado com sucesso.')
    } catch (error) {
      toast.error(error.message || 'Não foi possível cadastrar o usuário.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  return {
    handleCadastrarUsuario,
    handleCancelEditUserName,
    handleStartEditUserName,
    handleToggleUserAccess,
    handleUpdateRole,
    handleUpdateUserName,
  }
}
