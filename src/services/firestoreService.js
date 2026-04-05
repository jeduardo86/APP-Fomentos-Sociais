import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'

function mapFirestoreError(error) {
  const code = error?.code || ''

  switch (code) {
    case 'permission-denied':
      return 'Sem permissão para acessar dados no Firestore. Verifique regras e perfil de acesso.'
    case 'unauthenticated':
      return 'Sessão expirada ou usuário não autenticado.'
    case 'unavailable':
      return 'Servico temporariamente indisponivel. Tente novamente em instantes.'
    default:
      return error?.message || 'Falha ao carregar perfil de acesso.'
  }
}

function toProfileError(error) {
  const code = error?.code || ''
  const reason = mapFirestoreError(error)
  const message = code ? `${reason} (codigo: ${code})` : reason
  return new Error(message)
}

export const collections = {
  empresas: collection(db, 'empresas'),
  entidades: collection(db, 'entidades'),
  destinacoes: collection(db, 'destinacoes'),
  baseCsv: collection(db, 'base_csv'),
  users: collection(db, 'users'),
  appSettings: collection(db, 'app_settings'),
}

export function subscribeCollection(collectionRef, callback, sortField = 'nome', onError) {
  const q = query(collectionRef, orderBy(sortField))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
    },
    (error) => {
      if (onError) {
        onError(toProfileError(error))
        return
      }

      console.error('Snapshot error on collection subscription:', error)
    },
  )
}

function toSafeDocId(value) {
  return encodeURIComponent(String(value || '').trim())
}

function normalizeMoney(value) {
  const parsed = Number(value || 0)
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0
}

function shouldRetryProfileLoad(error) {
  const code = String(error?.code || '').toLowerCase()
  return code.includes('permission-denied') || code.includes('unauthenticated')
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export async function syncBaseCsv(records, userId) {
  const batch = writeBatch(db)

  records.forEach((record) => {
    const safeId = toSafeDocId(record.processoId)
    const ref = doc(db, 'base_csv', safeId)
    batch.set(
      ref,
      {
        ...record,
        updatedAt: new Date().toISOString(),
        updatedBy: userId || '',
      },
      { merge: true },
    )
  })

  await batch.commit()
}

export async function createDestinacao(payload) {
  const processoId = String(payload?.processoId || '').trim()
  const valorDestinado = normalizeMoney(payload?.valorDestinado)

  if (!processoId) {
    throw new Error('Processo inválido para destinação.')
  }

  if (valorDestinado <= 0) {
    throw new Error('Valor destinado deve ser maior que zero.')
  }

  const createdAt = new Date().toISOString()

  return runTransaction(db, async (transaction) => {
    const baseRef = doc(db, 'base_csv', toSafeDocId(processoId))
    const baseSnapshot = await transaction.get(baseRef)

    const limiteProcesso = normalizeMoney(
      baseSnapshot.exists() ? baseSnapshot.data()?.valorFomento : payload?.valorFomento,
    )

    if (limiteProcesso <= 0) {
      throw new Error('Não foi possível determinar o limite de fomento para este processo.')
    }

    const existentesQuery = query(collections.destinacoes, where('processoId', '==', processoId))
    const existentesSnapshot = await transaction.get(existentesQuery)

    const totalJaDestinado = normalizeMoney(
      existentesSnapshot.docs.reduce((acc, entry) => acc + Number(entry.data().valorDestinado || 0), 0),
    )

    if (totalJaDestinado + valorDestinado > limiteProcesso) {
      throw new Error('Saldo insuficiente para este processo no momento da gravação.')
    }

    const newRef = doc(collections.destinacoes)
    transaction.set(newRef, {
      ...payload,
      valorFomento: limiteProcesso,
      valorDestinado,
      createdAt: payload?.createdAt || createdAt,
      updatedAt: createdAt,
    })

    return newRef
  })
}

export async function registerDestinacaoPayment(destinacaoId, pgtoData, formaPgto, valorPago, userId) {
  const pagamento = normalizeMoney(valorPago)

  if (!destinacaoId) {
    throw new Error('Destinação inválida para pagamento.')
  }

  if (!pgtoData || !formaPgto) {
    throw new Error('Informe data e forma de pagamento.')
  }

  if (pagamento <= 0) {
    throw new Error('O valor pago deve ser maior que zero.')
  }

  const updatedAt = new Date().toISOString()

  return runTransaction(db, async (transaction) => {
    const ref = doc(db, 'destinacoes', destinacaoId)
    const snapshot = await transaction.get(ref)

    if (!snapshot.exists()) {
      throw new Error('Destinação não encontrada.')
    }

    const data = snapshot.data()
    const valorDestinado = normalizeMoney(data?.valorDestinado)
    const valorPagoAcumuladoAtual = normalizeMoney(data?.valorPagoAcumulado)

    if (valorDestinado <= 0) {
      throw new Error('Destinação com valor inválido para pagamento.')
    }

    const saldoRestante = normalizeMoney(valorDestinado - valorPagoAcumuladoAtual)

    if (pagamento > saldoRestante) {
      throw new Error('Valor pago excede o saldo restante da destinação.')
    }

    const novoPagoAcumulado = normalizeMoney(valorPagoAcumuladoAtual + pagamento)
    const quitado = novoPagoAcumulado >= valorDestinado

    transaction.update(ref, {
      statusPagamento: quitado ? 'pago' : 'parcial',
      pgtoData,
      formaPgto,
      valorPagoAcumulado: novoPagoAcumulado,
      qtdPagamentos: Number(data?.qtdPagamentos || 0) + 1,
      updatedAt,
      updatedBy: userId,
    })

    return {
      valorDestinado,
      valorPagoAcumulado: novoPagoAcumulado,
      saldoRestante: normalizeMoney(valorDestinado - novoPagoAcumulado),
      statusPagamento: quitado ? 'pago' : 'parcial',
    }
  })
}

export async function createEmpresa(payload) {
  await addDoc(collections.empresas, payload)
}

export async function createEntidade(payload) {
  return addDoc(collections.entidades, payload)
}

export async function updateEntidade(entidadeId, payload) {
  const ref = doc(db, 'entidades', entidadeId)
  await updateDoc(ref, payload)
}

export async function getTotalDestinadoByProcesso(processoId) {
  const q = query(collections.destinacoes, where('processoId', '==', processoId))
  const snapshot = await getDocs(q)
  return snapshot.docs.reduce((acc, entry) => acc + Number(entry.data().valorDestinado || 0), 0)
}

export async function ensureUserProfile(user) {
  const ref = doc(db, 'users', user.uid)
  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const snapshot = await getDoc(ref)

      if (!snapshot.exists()) {
        const now = new Date().toISOString()
        const profile = {
          uid: user.uid,
          nome: String(user?.displayName || '').trim(),
          email: String(user?.email || '').trim().toLowerCase(),
          cargo: '',
          role: 'OPERADOR',
          blocked: false,
          createdAt: now,
          updatedAt: now,
          createdBy: user.uid,
          updatedBy: user.uid,
        }

        await setDoc(ref, profile)
        return profile
      }

      return snapshot.data()
    } catch (error) {
      const isLastAttempt = attempt === maxAttempts
      if (!isLastAttempt && shouldRetryProfileLoad(error)) {
        await user.getIdToken(true).catch(() => {})
        await wait(300 * attempt)
        continue
      }

      throw toProfileError(error)
    }
  }

  throw new Error('Não foi possível confirmar o perfil de acesso após várias tentativas.')
}

export function subscribeUserProfile(uid, callback, onError) {
  const ref = doc(db, 'users', uid)
  return onSnapshot(
    ref,
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null)
    },
    (error) => {
      if (onError) {
        onError(toProfileError(error))
        return
      }

      console.error('Snapshot error on user profile subscription:', error)
    },
  )
}

export function subscribeUsers(callback, onError) {
  const q = query(collections.users, orderBy('email'))
  return onSnapshot(
    q,
    (snapshot) => {
      callback(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() })))
    },
    (error) => {
      if (onError) {
        onError(toProfileError(error))
        return
      }

      console.error('Snapshot error on users subscription:', error)
    },
  )
}

export async function updateUserRole(userId, role, adminUid) {
  const ref = doc(db, 'users', userId)
  await updateDoc(ref, {
    role,
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid,
  })
}

export async function updateUserAccess(userId, blocked, adminUid) {
  const ref = doc(db, 'users', userId)
  await updateDoc(ref, {
    blocked: Boolean(blocked),
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid,
  })
}

export async function updateUserName(userId, nome, cargo, adminUid) {
  const ref = doc(db, 'users', userId)
  await updateDoc(ref, {
    nome: String(nome || '').trim(),
    cargo: String(cargo || '').trim(),
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid,
  })
}

export async function createUserProfileByAdmin(userId, nome, email, cargo, role, adminUid) {
  const ref = doc(db, 'users', userId)
  await setDoc(ref, {
    uid: userId,
    nome: String(nome || '').trim(),
    email: email || '',
    cargo: String(cargo || '').trim(),
    role,
    blocked: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: adminUid,
    updatedBy: adminUid,
  })
}

export function subscribeAppSettings(callback, onError) {
  const ref = doc(db, 'app_settings', 'global')
  return onSnapshot(
    ref,
    (snapshot) => {
      callback(snapshot.exists() ? snapshot.data() : null)
    },
    (error) => {
      if (onError) {
        onError(toProfileError(error))
        return
      }

      console.error('Snapshot error on app settings subscription:', error)
    },
  )
}

export async function saveCsvLinkConfig(csvLink, userId) {
  const ref = doc(db, 'app_settings', 'global')
  await setDoc(
    ref,
    {
      csvLink,
      updatedAt: new Date().toISOString(),
      updatedBy: userId,
    },
    { merge: true },
  )
}
