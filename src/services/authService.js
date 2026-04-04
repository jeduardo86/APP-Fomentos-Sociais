import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { getApps, initializeApp } from 'firebase/app'
import { app, auth } from '../lib/firebase'

const googleProvider = new GoogleAuthProvider()

export function subscribeAuthState(callback) {
  return onAuthStateChanged(auth, callback)
}

export async function loginWithEmail(email, password) {
  return signInWithEmailAndPassword(auth, email, password)
}

export async function registerWithEmail(email, password) {
  return createUserWithEmailAndPassword(auth, email, password)
}

export async function loginWithGoogle() {
  return signInWithPopup(auth, googleProvider)
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
  const credentials = await createUserWithEmailAndPassword(secondaryAuth, email, password)
  await signOut(secondaryAuth)
  return credentials.user
}
