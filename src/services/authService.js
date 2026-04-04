import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithRedirect,
  signOut,
} from 'firebase/auth'
import { getApps, initializeApp } from 'firebase/app'
import { app, auth } from '../lib/firebase'

const googleProvider = new GoogleAuthProvider()

function mapAuthError(error) {
  const code = error?.code || ''

  switch (code) {
    case 'auth/invalid-email':
      return 'Email invalido. Confira o formato (ex: usuario@dominio.com).'
    case 'auth/missing-email':
      return 'Informe um email valido.'
    case 'auth/missing-password':
      return 'Informe uma senha para continuar.'
    case 'auth/weak-password':
      return 'A senha e muito fraca. Use pelo menos 6 caracteres.'
    case 'auth/email-already-in-use':
      return 'Este email ja esta em uso.'
    case 'auth/user-not-found':
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
      return 'Email ou senha invalidos.'
    case 'auth/too-many-requests':
      return 'Muitas tentativas seguidas. Aguarde alguns minutos e tente novamente.'
    case 'auth/operation-not-allowed':
      return 'Login por email/senha desativado no Firebase. Ative em Authentication > Sign-in method.'
    case 'auth/api-key-not-valid':
      return 'Chave da API do Firebase invalida. Revise VITE_FIREBASE_API_KEY no arquivo .env.'
    default:
      return error?.message || 'Falha ao autenticar no Firebase.'
  }
}

function toAuthError(error) {
  const code = error?.code || ''
  const reason = mapAuthError(error)
  const message = code ? `${reason} (codigo: ${code})` : reason
  return new Error(message)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}

export async function loginWithEmail(email, password) {
  try {
    return await signInWithEmailAndPassword(auth, normalizeEmail(email), password)
  } catch (error) {
    throw toAuthError(error)
  }
}

export async function registerWithEmail(email, password) {
  try {
    return await createUserWithEmailAndPassword(auth, normalizeEmail(email), password)
  } catch (error) {
    throw toAuthError(error)
  }
}

export async function loginWithGoogle() {
  // Redirect flow avoids popup window polling that triggers COOP warnings in some browsers.
  return signInWithRedirect(auth, googleProvider)
}

export async function logout() {
  return signOut(auth)
}

function getSecondaryAuth() {
  const secondaryName = 'secondary-auth'
  const secondaryApp =
    getApps().find((entry) => entry.name === secondaryName) ||
    initializeApp(app.options, secondaryName)

  return getAuth(secondaryApp)
}

export async function createUserByAdmin(email, password) {
  const secondaryAuth = getSecondaryAuth()
  try {
    const credentials = await createUserWithEmailAndPassword(
      secondaryAuth,
      normalizeEmail(email),
      password,
    )
    return credentials.user
  } catch (error) {
    throw toAuthError(error)
  } finally {
    await signOut(secondaryAuth).catch(() => {})
  }
}
