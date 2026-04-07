import {
  addDoc,
  collection,
  deleteDoc,
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

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.round((parsed + Number.EPSILON) * 100) / 100
}

function toMoneyCents(value) {
  const parsed = Number(value || 0)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.round((parsed + Number.EPSILON) * 100)
}

function fromMoneyCents(cents) {
  const parsed = Number(cents || 0)

  if (!Number.isFinite(parsed)) {
    return 0
  }

  return normalizeMoney(parsed / 100)
}

function getLimiteProcessoCents(source) {
  const premio = Number(source?.valorPremio || 0)
  const incentivo = Number(source?.incentivo || 0)

  if (Number.isFinite(premio) && Number.isFinite(incentivo) && (premio > 0 || incentivo > 0)) {
    const incentivoBase = Math.max(0, incentivo - premio * 0.15)
    const baseCalculo = premio + incentivoBase
    return toMoneyCents(baseCalculo * 0.075)
  }

  return toMoneyCents(source?.valorFomento)
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

export async function createManualResourceSource(payload, userId) {
  const processoId = String(payload?.processoId || '').trim()
  const empresa = String(payload?.empresa || '').trim()
  const tipoFomento = String(payload?.tipoFomento || '').trim() || 'Instantâneas'
  const valorFomentoCents = toMoneyCents(payload?.valorFomento)

  if (!processoId) {
    throw new Error('Informe um identificador de processo para a origem manual.')
  }

  if (!empresa) {
    throw new Error('Selecione uma empresa válida para a origem manual.')
  }

  if (valorFomentoCents <= 0) {
    throw new Error('Informe um valor de fomento maior que zero.')
  }

  const ref = doc(db, 'base_csv', toSafeDocId(processoId))
  const snapshot = await getDoc(ref)

  if (snapshot.exists()) {
    throw new Error('Já existe um processo com este identificador na base. Use outro código.')
  }

  const now = new Date().toISOString()

  await setDoc(ref, {
    processoId,
    termo: tipoFomento,
    tipoFomento,
    cnpj: String(payload?.cnpj || '').trim(),
    empresa,
    produto: String(payload?.produto || tipoFomento).trim() || tipoFomento,
    valorPremio: 0,
    incentivo: 0,
    valorFomento: fromMoneyCents(valorFomentoCents),
    origemTipo: 'manual',
    syncedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: userId || '',
    updatedBy: userId || '',
  })
}

export async function createDestinacao(payload) {
  const processoId = String(payload?.processoId || '').trim()
  const valorDestinadoCents = toMoneyCents(payload?.valorDestinado)
  const valorDestinado = fromMoneyCents(valorDestinadoCents)

  if (!processoId) {
    throw new Error('Processo inválido para destinação.')
  }

  if (valorDestinadoCents <= 0) {
    throw new Error('Valor destinado deve ser maior que zero.')
  }

  const createdAt = new Date().toISOString()

  const baseRef = doc(db, 'base_csv', toSafeDocId(processoId))
  const baseSnapshot = await getDoc(baseRef)

  const limiteProcessoCents = baseSnapshot.exists()
    ? getLimiteProcessoCents(baseSnapshot.data())
    : getLimiteProcessoCents(payload)
  const limiteProcesso = fromMoneyCents(limiteProcessoCents)

  if (limiteProcessoCents <= 0) {
    throw new Error('Não foi possível determinar o limite de fomento para este processo.')
  }

  const existentesQuery = query(collections.destinacoes, where('processoId', '==', processoId))
  const existentesSnapshot = await getDocs(existentesQuery)

  const totalJaDestinadoCents = existentesSnapshot.docs.reduce(
    (acc, entry) => acc + toMoneyCents(entry.data().valorDestinado),
    0,
  )

  if (totalJaDestinadoCents + valorDestinadoCents > limiteProcessoCents) {
    const disponivelCents = Math.max(0, limiteProcessoCents - totalJaDestinadoCents)
    throw new Error(
      `Saldo insuficiente para este processo no momento da gravação. Limite: ${fromMoneyCents(limiteProcessoCents).toFixed(2)} | já destinado: ${fromMoneyCents(totalJaDestinadoCents).toFixed(2)} | disponível: ${fromMoneyCents(disponivelCents).toFixed(2)} | solicitado: ${fromMoneyCents(valorDestinadoCents).toFixed(2)}.`,
    )
  }

  return addDoc(collections.destinacoes, {
    ...payload,
    valorFomento: limiteProcesso,
    valorDestinado,
    createdAt: payload?.createdAt || createdAt,
    updatedAt: createdAt,
  })
}

export async function updateDestinacao(destinacaoId, payload, userId) {
  if (!destinacaoId) {
    throw new Error('Destinação inválida para edição.')
  }

  const ref = doc(db, 'destinacoes', destinacaoId)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    throw new Error('Destinação não encontrada para edição.')
  }

  const atual = snapshot.data()
  const valorPagoAcumuladoCents = toMoneyCents(atual?.valorPagoAcumulado)
  const qtdPagamentos = Number(atual?.qtdPagamentos || 0)
  const hasPayment = valorPagoAcumuladoCents > 0 || qtdPagamentos > 0

  const processoId = String(atual?.processoId || '').trim()

  if (!processoId) {
    throw new Error('Processo inválido para edição da destinação.')
  }

  const valorDestinadoCents = toMoneyCents(payload?.valorDestinado)
  const valorDestinado = fromMoneyCents(valorDestinadoCents)

  if (valorDestinadoCents <= 0) {
    throw new Error('Valor destinado deve ser maior que zero.')
  }

  if (hasPayment) {
    const valorAtualCents = toMoneyCents(atual?.valorDestinado)

    if (valorDestinadoCents !== valorAtualCents) {
      throw new Error('Valor destinado não pode ser alterado quando já houver pagamento registrado.')
    }

    await updateDoc(ref, {
      entidadeId: String(payload?.entidadeId || '').trim(),
      entidadeNome: String(payload?.entidadeNome || '').trim(),
      competencia: String(payload?.competencia || '').trim(),
      processoSolicitacaoEntidade: String(payload?.processoSolicitacaoEntidade || '').trim(),
      observacao: String(payload?.observacao || '').trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: userId || '',
    })

    return
  }

  const baseRef = doc(db, 'base_csv', toSafeDocId(processoId))
  const baseSnapshot = await getDoc(baseRef)

  const limiteProcessoCents = baseSnapshot.exists()
    ? getLimiteProcessoCents(baseSnapshot.data())
    : getLimiteProcessoCents(atual)

  if (limiteProcessoCents <= 0) {
    throw new Error('Não foi possível determinar o limite de fomento para este processo.')
  }

  const existentesQuery = query(collections.destinacoes, where('processoId', '==', processoId))
  const existentesSnapshot = await getDocs(existentesQuery)

  const totalOutrasDestinacoesCents = existentesSnapshot.docs.reduce((acc, entry) => {
    if (entry.id === destinacaoId) {
      return acc
    }

    return acc + toMoneyCents(entry.data().valorDestinado)
  }, 0)

  if (totalOutrasDestinacoesCents + valorDestinadoCents > limiteProcessoCents) {
    const disponivelCents = Math.max(0, limiteProcessoCents - totalOutrasDestinacoesCents)
    throw new Error(
      `Saldo insuficiente para este processo no momento da edição. Limite: ${fromMoneyCents(limiteProcessoCents).toFixed(2)} | já destinado: ${fromMoneyCents(totalOutrasDestinacoesCents).toFixed(2)} | disponível: ${fromMoneyCents(disponivelCents).toFixed(2)} | solicitado: ${fromMoneyCents(valorDestinadoCents).toFixed(2)}.`,
    )
  }

  await updateDoc(ref, {
    entidadeId: String(payload?.entidadeId || '').trim(),
    entidadeNome: String(payload?.entidadeNome || '').trim(),
    competencia: String(payload?.competencia || '').trim(),
    processoSolicitacaoEntidade: String(payload?.processoSolicitacaoEntidade || '').trim(),
    observacao: String(payload?.observacao || '').trim(),
    valorDestinado,
    updatedAt: new Date().toISOString(),
    updatedBy: userId || '',
  })
}

export async function deleteDestinacao(destinacaoId, userId) {
  if (!destinacaoId) {
    throw new Error('Destinação inválida para exclusão.')
  }

  const ref = doc(db, 'destinacoes', destinacaoId)
  const snapshot = await getDoc(ref)

  if (!snapshot.exists()) {
    throw new Error('Destinação não encontrada para exclusão.')
  }

  const atual = snapshot.data()
  const valorPagoAcumuladoCents = toMoneyCents(atual?.valorPagoAcumulado)
  const qtdPagamentos = Number(atual?.qtdPagamentos || 0)

  if (valorPagoAcumuladoCents > 0 || qtdPagamentos > 0) {
    throw new Error('Destinações com pagamento registrado não podem ser excluídas.')
  }

  await deleteDoc(ref)

  if (userId) {
    console.info(`Destinação ${destinacaoId} excluída por ${userId}.`)
  }
}

export async function registerDestinacaoPayment(destinacaoId, pgtoData, formaPgto, valorPago, userId) {
  const pagamentoCents = toMoneyCents(valorPago)
  const pagamento = fromMoneyCents(pagamentoCents)

  if (!destinacaoId) {
    throw new Error('Destinação inválida para pagamento.')
  }

  if (!pgtoData || !formaPgto) {
    throw new Error('Informe data e forma de pagamento.')
  }

  if (pagamentoCents <= 0) {
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
    const valorDestinadoCents = toMoneyCents(data?.valorDestinado)
    const valorPagoAcumuladoAtualCents = toMoneyCents(data?.valorPagoAcumulado)
    const valorDestinado = fromMoneyCents(valorDestinadoCents)
    const valorPagoAcumuladoAtual = fromMoneyCents(valorPagoAcumuladoAtualCents)

    if (valorDestinadoCents <= 0) {
      throw new Error('Destinação com valor inválido para pagamento.')
    }

    const saldoRestanteCents = Math.max(0, valorDestinadoCents - valorPagoAcumuladoAtualCents)
    const saldoRestante = fromMoneyCents(saldoRestanteCents)

    if (pagamentoCents > saldoRestanteCents) {
      throw new Error('Valor pago excede o saldo restante da destinação.')
    }

    const novoPagoAcumuladoCents = valorPagoAcumuladoAtualCents + pagamentoCents
    const novoPagoAcumulado = fromMoneyCents(novoPagoAcumuladoCents)
    const quitado = novoPagoAcumuladoCents >= valorDestinadoCents

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
      saldoRestante: fromMoneyCents(Math.max(0, valorDestinadoCents - novoPagoAcumuladoCents)),
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
  const totalCents = snapshot.docs.reduce((acc, entry) => acc + toMoneyCents(entry.data().valorDestinado), 0)
  return fromMoneyCents(totalCents)
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
