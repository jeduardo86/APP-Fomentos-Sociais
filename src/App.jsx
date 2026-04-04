import { useEffect, useMemo, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import toast, { Toaster } from 'react-hot-toast'
import { categoriaDescriptions, categoriaOptions, pagamentoOptions } from './lib/constants'
import {
  formatCurrency,
  formatDateBR,
  maskCNPJ,
  sanitizeCNPJ,
  toCompetenciaMask,
} from './lib/formatters'
import { fetchAndParseCsv } from './services/csvService'
import {
  createUserByAdmin,
  loginWithEmail,
  loginWithGoogle,
  logout,
  subscribeAuthState,
} from './services/authService'
import {
  collections,
  createUserProfileByAdmin,
  createDestinacao,
  createEmpresa,
  createEntidade,
  ensureUserProfile,
  registerDestinacaoPayment,
  saveCsvLinkConfig,
  subscribeAppSettings,
  subscribeCollection,
  subscribeUserProfile,
  subscribeUsers,
  syncBaseCsv,
  updateUserAccess,
  updateUserRole,
} from './services/firestoreService'

const operationalTabs = [
  { id: 'gerencial', label: 'Painel gerencial' },
  { id: 'destinacao', label: 'Destinacoes' },
  { id: 'pagamento', label: 'Confirmacao de pagamento' },
]

const cadastroTabs = [
  { id: 'empresas', label: 'Cadastro de empresas' },
  { id: 'entidades', label: 'Cadastro de entidades' },
  { id: 'usuarios', label: 'Cadastro de usuarios' },
]

function getValorFomentoFromProcess(item) {
  const premio = Number(item?.valorPremio || 0)
  const incentivo = Number(item?.incentivo || 0)

  if (premio > 0 || incentivo > 0) {
    return (premio + incentivo) * 0.075
  }

  return Number(item?.valorFomento || 0)
}

function formatCurrencyCompact(value) {
  const amount = Number(value || 0)
  const abs = Math.abs(amount)

  if (abs >= 1_000_000_000) {
    return `${formatCurrency(amount / 1_000_000_000)} bi`
  }

  if (abs >= 1_000_000) {
    return `${formatCurrency(amount / 1_000_000)} mi`
  }

  if (abs >= 1_000) {
    return `${formatCurrency(amount / 1_000)} mil`
  }

  return formatCurrency(amount)
}

function App() {
  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })

  const [activeMenu, setActiveMenu] = useState('operacional')
  const [activeTab, setActiveTab] = useState('destinacao')
  const [activeCadastroTab, setActiveCadastroTab] = useState('empresas')
  const [csvUrl, setCsvUrl] = useState('')
  const [isSyncing, setIsSyncing] = useState(false)
  const [isSavingCsvLink, setIsSavingCsvLink] = useState(false)

  const [baseCsv, setBaseCsv] = useState([])
  const [destinacoes, setDestinacoes] = useState([])
  const [entidades, setEntidades] = useState([])
  const [empresas, setEmpresas] = useState([])

  const [empresaSelecionada, setEmpresaSelecionada] = useState('')
  const [selectedProcessIds, setSelectedProcessIds] = useState([])
  const [filtroProcessoDestinacao, setFiltroProcessoDestinacao] = useState('')

  const [destForm, setDestForm] = useState({
    solicitacaoData: '',
    entidadeId: '',
    competencia: '',
  })

  const [pagamentoForm, setPagamentoForm] = useState({
    destinacaoId: '',
    pgtoData: '',
    formaPgto: 'PIX',
    valorPago: 0,
  })

  const [empresaForm, setEmpresaForm] = useState({ razaoSocial: '', cnpj: '' })
  const [entidadeForm, setEntidadeForm] = useState({ nome: '', categoria: 'Assistencia' })
  const [usersList, setUsersList] = useState([])
  const [roleBusyUserId, setRoleBusyUserId] = useState('')
  const [accessBusyUserId, setAccessBusyUserId] = useState('')
  const [isRevokingBlockedSession, setIsRevokingBlockedSession] = useState(false)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    email: '',
    password: '',
    role: 'OPERADOR',
  })

  const isAdmin = userProfile?.role === 'admin' && userProfile?.blocked !== true
  const canAccessCadastroBase = Boolean(user && userProfile && userProfile?.blocked !== true)
  const visibleCadastroTabs = isAdmin
    ? cadastroTabs
    : cadastroTabs.filter((tab) => tab.id === 'empresas' || tab.id === 'entidades')

  function handleRealtimeAccessError(error) {
    const message = error?.message || 'Nao foi possivel acompanhar atualizacoes em tempo real.'
    toast.error(message, { id: 'firestore-realtime-error' })

    const rawMessage = String(error?.message || '')
    const lostAccess =
      rawMessage.includes('permission-denied') ||
      rawMessage.includes('unauthenticated') ||
      rawMessage.toLowerCase().includes('sem permissao')

    if (lostAccess) {
      logout().catch(() => {})
    }
  }

  useEffect(() => {
    const unsub = subscribeAuthState((sessionUser) => {
      setUser(sessionUser)
      setAuthLoading(false)
    })

    return () => unsub()
  }, [])

  useEffect(() => {
    if (!user) {
      setUserProfile(null)
      setUsersList([])
      setBaseCsv([])
      setDestinacoes([])
      setEntidades([])
      setEmpresas([])
      setCsvUrl('')
      return undefined
    }

    let stopProfile = () => {}
    let stopAppSettings = () => {}

    ensureUserProfile(user)
      .then(() => {
        stopProfile = subscribeUserProfile(user.uid, setUserProfile, handleRealtimeAccessError)
        stopAppSettings = subscribeAppSettings((settings) => {
          setCsvUrl(settings?.csvLink || '')
        }, handleRealtimeAccessError)
      })
      .catch((error) => {
        toast.error(error?.message || 'Nao foi possivel carregar perfil de acesso.')
        logout().catch(() => {})
      })

    return () => {
      stopProfile()
      stopAppSettings()
    }
  }, [user])

  useEffect(() => {
    if (!user || !userProfile || userProfile.blocked === true) {
      setBaseCsv([])
      setDestinacoes([])
      setEntidades([])
      setEmpresas([])
      return undefined
    }

    const unsubs = [
      subscribeCollection(collections.baseCsv, setBaseCsv, 'processoId', handleRealtimeAccessError),
      subscribeCollection(
        collections.destinacoes,
        setDestinacoes,
        'solicitacaoData',
        handleRealtimeAccessError,
      ),
      subscribeCollection(collections.entidades, setEntidades, 'nome', handleRealtimeAccessError),
      subscribeCollection(collections.empresas, setEmpresas, 'razaoSocial', handleRealtimeAccessError),
    ]

    return () => {
      unsubs.forEach((stop) => stop())
    }
  }, [user, userProfile])

  useEffect(() => {
    if (!user || !userProfile || userProfile.blocked !== true || isRevokingBlockedSession) {
      return
    }

    setIsRevokingBlockedSession(true)
    toast.error('Seu acesso foi bloqueado. Entre em contato com o administrador.')

    logout()
      .catch(() => {
        toast.error('Nao foi possivel encerrar a sessao bloqueada.')
      })
      .finally(() => {
        setIsRevokingBlockedSession(false)
      })
  }, [user, userProfile, isRevokingBlockedSession])

  useEffect(() => {
    if (!user || !isAdmin || userProfile?.blocked === true) {
      setUsersList([])
      return undefined
    }

    const stopUsers = subscribeUsers(setUsersList, handleRealtimeAccessError)
    return () => stopUsers()
  }, [user, isAdmin, userProfile])

  const totalDestinadoPorProcesso = useMemo(() => {
    return destinacoes.reduce((acc, item) => {
      const key = String(item.processoId || '').trim()
      if (!key) {
        return acc
      }

      acc[key] = (acc[key] || 0) + Number(item.valorDestinado || 0)
      return acc
    }, {})
  }, [destinacoes])

  const empresasComProcessos = useMemo(() => {
    return Array.from(
      new Set(baseCsv.map((item) => String(item.empresa || '').trim()).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))
  }, [baseCsv])

  const processosEmpresa = useMemo(() => {
    if (!empresaSelecionada) {
      return []
    }

    return baseCsv
      .filter((item) => String(item.empresa || '').trim() === empresaSelecionada)
      .map((item) => {
        const valorFomento = Number(getValorFomentoFromProcess(item) || 0)
        const jaDestinado = Number(totalDestinadoPorProcesso[item.processoId] || 0)
        const saldoDisponivel = Math.max(0, valorFomento - jaDestinado)

        return {
          ...item,
          valorFomento,
          saldoDisponivel,
        }
      })
      .filter((item) => item.saldoDisponivel > 0)
      .sort((a, b) => String(a.processoId || '').localeCompare(String(b.processoId || '')))
  }, [empresaSelecionada, baseCsv, totalDestinadoPorProcesso])

  const totalSelecionadoParaDestinar = useMemo(
    () =>
      processosEmpresa
        .filter((item) => selectedProcessIds.includes(item.processoId))
        .reduce((acc, item) => acc + Number(item.saldoDisponivel || 0), 0),
    [processosEmpresa, selectedProcessIds],
  )

  const processosEmpresaFiltrados = useMemo(() => {
    const termoBusca = String(filtroProcessoDestinacao || '').toLowerCase().trim()

    if (!termoBusca) {
      return processosEmpresa
    }

    return processosEmpresa.filter((item) => {
      const processoId = String(item.processoId || '').toLowerCase()
      const termo = String(item.termo || '').toLowerCase()
      const produto = String(item.produto || '').toLowerCase()

      return (
        processoId.includes(termoBusca) || termo.includes(termoBusca) || produto.includes(termoBusca)
      )
    })
  }, [processosEmpresa, filtroProcessoDestinacao])

  const totalEmFomentos = useMemo(
    () => baseCsv.reduce((acc, item) => acc + getValorFomentoFromProcess(item), 0),
    [baseCsv],
  )

  const totalDestinado = useMemo(
    () => destinacoes.reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoes],
  )

  const totalDestinadoEmTransito = useMemo(
    () =>
      destinacoes
        .filter((item) => item.statusPagamento !== 'pago')
        .reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoes],
  )

  const totalDestinadoPagos = useMemo(
    () =>
      destinacoes
        .filter((item) => item.statusPagamento === 'pago')
        .reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoes],
  )

  const saldoAPagar = useMemo(
    () =>
      destinacoes
        .filter((item) => item.statusPagamento !== 'pago')
        .reduce(
          (acc, item) =>
            acc + Math.max(0, Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0)),
          0,
        ),
    [destinacoes],
  )

  const saldoSemDestinacao = useMemo(
    () => totalEmFomentos - totalDestinado,
    [totalEmFomentos, totalDestinado],
  )

  const pendentes = useMemo(
    () => destinacoes.filter((item) => item.statusPagamento !== 'pago'),
    [destinacoes],
  )

  const resumoEmpresas = useMemo(() => {
    const mapa = new Map()

    baseCsv.forEach((processo) => {
      const empresa = String(processo.empresa || '').trim() || 'Empresa nao informada'
      const processoId = String(processo.processoId || '').trim()

      if (!mapa.has(empresa)) {
        mapa.set(empresa, {
          empresa,
          totalFomento: 0,
          totalDestinado: 0,
          totalPago: 0,
          processosTotal: 0,
          processosComSaldo: 0,
        })
      }

      const item = mapa.get(empresa)
      const valorFomento = Number(getValorFomentoFromProcess(processo) || 0)
      const totalDestinadoProcesso = destinacoes
        .filter((dest) => String(dest.processoId || '').trim() === processoId)
        .reduce((acc, dest) => acc + Number(dest.valorDestinado || 0), 0)

      item.totalFomento += valorFomento
      item.totalDestinado += totalDestinadoProcesso
      item.processosTotal += 1

      if (valorFomento - totalDestinadoProcesso > 0) {
        item.processosComSaldo += 1
      }
    })

    destinacoes.forEach((destinacao) => {
      const empresa = String(destinacao.empresa || '').trim() || 'Empresa nao informada'

      if (!mapa.has(empresa)) {
        mapa.set(empresa, {
          empresa,
          totalFomento: 0,
          totalDestinado: 0,
          totalPago: 0,
          processosTotal: 0,
          processosComSaldo: 0,
        })
      }

      const item = mapa.get(empresa)
      item.totalPago += Number(destinacao.valorPagoAcumulado || 0)
    })

    return Array.from(mapa.values())
      .map((item) => ({
        ...item,
        saldoADestinar: Math.max(0, item.totalFomento - item.totalDestinado),
        saldoAPagar: Math.max(0, item.totalDestinado - item.totalPago),
      }))
      .sort((a, b) => a.empresa.localeCompare(b.empresa))
  }, [baseCsv, destinacoes])

  const categoriaTexto = categoriaDescriptions[entidadeForm.categoria] || ''

  async function handleSyncCsv(event) {
    event?.preventDefault?.()

    if (!user) {
      toast.error('Autenticacao obrigatoria para sincronizar dados.')
      return
    }

    if (!isAdmin) {
      toast.error('Apenas administradores podem sincronizar a base CSV.')
      return
    }

    if (!csvUrl.trim()) {
      toast.error('Informe a URL do CSV para sincronizar.')
      return
    }

    setIsSyncing(true)

    try {
      const records = await fetchAndParseCsv(csvUrl)
      if (!records.length) {
        throw new Error('CSV sem registros validos.')
      }

      await syncBaseCsv(records, user.uid)
      toast.success(`Base CSV sincronizada: ${records.length} processos.`)
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel sincronizar o CSV.')
    } finally {
      setIsSyncing(false)
    }
  }

  async function handleSalvarCsvLink(event) {
    event.preventDefault()

    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem salvar o link do CSV.')
      return
    }

    if (!csvUrl.trim()) {
      toast.error('Informe o link do CSV.')
      return
    }

    setIsSavingCsvLink(true)

    try {
      await saveCsvLinkConfig(csvUrl.trim(), user.uid)
      toast.success('Link do CSV salvo com sucesso.')
    } catch {
      toast.error('Nao foi possivel salvar o link do CSV.')
    } finally {
      setIsSavingCsvLink(false)
    }
  }

  async function handleSalvarDestinacao(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticacao obrigatoria para registrar destinacao.')
      return
    }

    if (!empresaSelecionada) {
      toast.error('Selecione a empresa para destinacao.')
      return
    }

    if (!selectedProcessIds.length) {
      toast.error('Selecione ao menos um processo para destinacao.')
      return
    }

    if (!destForm.solicitacaoData || !destForm.entidadeId || !destForm.competencia) {
      toast.error('Preencha os campos obrigatorios da destinacao.')
      return
    }

    const entidade = entidades.find((entry) => entry.id === destForm.entidadeId)
    const processosSelecionados = processosEmpresa.filter((item) =>
      selectedProcessIds.includes(item.processoId),
    )

    if (!processosSelecionados.length) {
      toast.error('Nenhum processo valido selecionado para destinacao.')
      return
    }

    try {
      for (const processo of processosSelecionados) {
        await createDestinacao({
          processoId: processo.processoId,
          termo: processo.termo,
          empresa: processo.empresa,
          produto: processo.produto,
          valorFomento: getValorFomentoFromProcess(processo),
          solicitacaoData: destForm.solicitacaoData,
          entidadeId: entidade?.id || '',
          entidadeNome: entidade?.nome || '',
          valorDestinado: processo.saldoDisponivel,
          competencia: destForm.competencia,
          statusPagamento: 'pendente',
          pgtoData: '',
          formaPgto: '',
          valorPagoAcumulado: 0,
          qtdPagamentos: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: user.uid,
          updatedBy: user.uid,
        })
      }

      setDestForm({ solicitacaoData: '', entidadeId: '', competencia: '' })
      setSelectedProcessIds([])
      toast.success(`Destinacoes registradas: ${processosSelecionados.length}`)
    } catch (error) {
      toast.error(error.message || 'Falha ao salvar a destinacao.')
    }
  }

  async function handleConfirmarPagamento(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticacao obrigatoria para confirmar pagamento.')
      return
    }

    if (!pagamentoForm.destinacaoId || !pagamentoForm.pgtoData || !pagamentoForm.formaPgto) {
      toast.error('Preencha os dados de pagamento.')
      return
    }

    const valorPago = Number(pagamentoForm.valorPago || 0)
    if (valorPago <= 0) {
      toast.error('Informe um valor de pagamento maior que zero.')
      return
    }

    try {
      await registerDestinacaoPayment(
        pagamentoForm.destinacaoId,
        pagamentoForm.pgtoData,
        pagamentoForm.formaPgto,
        valorPago,
        user.uid,
      )

      setPagamentoForm({ destinacaoId: '', pgtoData: '', formaPgto: 'PIX', valorPago: 0 })
      toast.success('Pagamento registrado.')
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel confirmar o pagamento.')
    }
  }

  async function handleSalvarEmpresa(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticacao obrigatoria para cadastrar empresa.')
      return
    }

    const cnpjLimpo = sanitizeCNPJ(empresaForm.cnpj)

    if (!empresaForm.razaoSocial.trim() || cnpjLimpo.length !== 14) {
      toast.error('Informe razao social e CNPJ valido.')
      return
    }

    try {
      await createEmpresa({
        razaoSocial: empresaForm.razaoSocial.trim(),
        cnpj: maskCNPJ(cnpjLimpo),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.uid,
        updatedBy: user.uid,
      })
      setEmpresaForm({ razaoSocial: '', cnpj: '' })
      toast.success('Empresa cadastrada.')
    } catch {
      toast.error('Nao foi possivel cadastrar empresa.')
    }
  }

  async function handleSalvarEntidade(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticacao obrigatoria para cadastrar entidade.')
      return
    }

    if (!entidadeForm.nome.trim() || !entidadeForm.categoria) {
      toast.error('Informe nome e categoria da entidade.')
      return
    }

    try {
      await createEntidade({
        nome: entidadeForm.nome.trim(),
        categoria: entidadeForm.categoria,
        descricaoCategoria: categoriaDescriptions[entidadeForm.categoria] || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.uid,
        updatedBy: user.uid,
      })
      setEntidadeForm({ nome: '', categoria: 'Assistencia' })
      toast.success('Entidade cadastrada.')
    } catch {
      toast.error('Nao foi possivel cadastrar entidade.')
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault()

    if (!authForm.email.trim() || !authForm.password.trim()) {
      toast.error('Informe email e senha.')
      return
    }

    setAuthBusy(true)

    try {
      await loginWithEmail(authForm.email.trim(), authForm.password)
      toast.success('Credenciais validadas. Verificando permissao de acesso...')
      setAuthForm({ email: '', password: '' })
    } catch (error) {
      toast.error(error.message || 'Falha na autenticacao.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleGoogleAuth() {
    setAuthBusy(true)

    try {
      await loginWithGoogle()
      toast.success('Login realizado. Verificando permissao de acesso...')
    } catch (error) {
      toast.error(error.message || 'Falha no login com Google.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
      toast.success('Sessao encerrada.')
    } catch {
      toast.error('Nao foi possivel encerrar a sessao.')
    }
  }

  async function handleUpdateRole(targetUserId, nextRole) {
    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem alterar perfis.')
      return
    }

    if (targetUserId === user.uid) {
      toast.error('Nao e permitido alterar o proprio perfil.')
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
      toast.error('Nao e permitido bloquear o proprio acesso.')
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

  async function handleCadastrarUsuario(event) {
    event.preventDefault()

    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem cadastrar usuarios.')
      return
    }

    const normalizedEmail = newUserForm.email.trim().toLowerCase()
    const normalizedPassword = newUserForm.password.trim()

    if (!normalizedEmail || !normalizedPassword) {
      toast.error('Informe email e senha para o novo usuario.')
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
      toast.error('Este email ja esta cadastrado.')
      return
    }

    setIsCreatingUser(true)

    try {
      const createdUser = await createUserByAdmin(normalizedEmail, normalizedPassword)
      await createUserProfileByAdmin(
        createdUser.uid,
        normalizedEmail,
        newUserForm.role,
        user.uid,
      )

      setNewUserForm({ email: '', password: '', role: 'OPERADOR' })
      toast.success('Usuario cadastrado com sucesso.')
    } catch (error) {
      toast.error(error.message || 'Nao foi possivel cadastrar o usuario.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  if (authLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-soft">
          <p className="text-sm font-medium text-zinc-600">Validando sessao...</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />

        <main className="relative z-10 mx-auto max-w-lg">
          <section className="panel panel-hero">
            <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">Acesso protegido</p>
            <h1 className="headline mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
              Entrar no sistema de fomentos
            </h1>
            <p className="mt-3 text-sm text-zinc-600">
              Apenas usuarios autenticados podem escrever em destinacoes, entidades e empresas.
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleAuthSubmit}>
              <div>
                <label className="field-label" htmlFor="authEmail">
                  Email
                </label>
                <input
                  id="authEmail"
                  className="field-input"
                  type="email"
                  value={authForm.email}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="usuario@dominio.com"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="authPassword">
                  Senha
                </label>
                <input
                  id="authPassword"
                  className="field-input"
                  type="password"
                  value={authForm.password}
                  onChange={(event) =>
                    setAuthForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="********"
                />
              </div>

              <button className="btn-primary w-full" type="submit" disabled={authBusy}>
                {authBusy ? 'Processando...' : 'Entrar'}
              </button>
            </form>

            <button
              className="mt-3 btn-primary w-full"
              type="button"
              onClick={handleGoogleAuth}
              disabled={authBusy}
            >
              Entrar com Google
            </button>

            <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm text-zinc-600">
              Novos acessos sao criados somente por administradores.
            </p>
          </section>
        </main>
      </div>
    )
  }

  if (!userProfile) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-soft">
          <p className="text-sm font-medium text-zinc-600">Validando permissao de acesso...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 pb-24 pt-6 text-zinc-900 sm:px-6 lg:px-8 lg:pb-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

      <main className="relative z-10 mx-auto flex w-full max-w-7xl gap-6 lg:items-start">
        <aside className="hidden w-72 shrink-0 lg:sticky lg:top-6 lg:block">
          <div className="panel panel-soft space-y-5">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">Navegacao</p>
              <h2 className="mt-2 text-2xl font-semibold text-zinc-900">Menu principal</h2>
            </div>

            <nav className="space-y-2" aria-label="Menu principal">
              <button
                type="button"
                className={activeMenu === 'operacional' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => setActiveMenu('operacional')}
              >
                Operacional
              </button>
              <button
                type="button"
                className={activeMenu === 'cadastros' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => setActiveMenu('cadastros')}
              >
                Cadastros
              </button>
              <button
                type="button"
                className={activeMenu === 'configuracoes' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => setActiveMenu('configuracoes')}
              >
                Configuracoes
              </button>
            </nav>

            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700">Operacao ativa</p>
              <p className="mt-1 break-all text-sm font-semibold text-cyan-900">{user.email || user.uid}</p>
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                Perfil: {isAdmin ? 'ADMIN' : 'OPERADOR'}
              </p>
            </div>

            <button
              type="button"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
              onClick={handleLogout}
            >
              Sair
            </button>
          </div>
        </aside>

        <section className="flex-1 space-y-6">
          <section className="panel panel-hero">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">Gestao de fomentos sociais</p>
                <h1 className="headline mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  Controle de Destinação de Fomentos Sociais
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-zinc-600 sm:text-base">
                  Use o menu para alternar entre a operacao diaria e as configuracoes do sistema.
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-right lg:hidden">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700">Operacao ativa</p>
                <p className="mt-1 break-all text-sm font-semibold text-cyan-900">{user.email || user.uid}</p>
                <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-700">
                  Perfil: {isAdmin ? 'ADMIN' : 'OPERADOR'}
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <article className="card-metric">
                <p>Total em fomentos</p>
                <strong title={formatCurrency(totalEmFomentos)}>
                  {formatCurrencyCompact(totalEmFomentos)}
                </strong>
              </article>
              <article className="card-metric">
                <p>Total destinado em transito</p>
                <strong title={formatCurrency(totalDestinadoEmTransito)}>
                  {formatCurrencyCompact(totalDestinadoEmTransito)}
                </strong>
              </article>
              <article className="card-metric">
                <p>Total destinado pagos</p>
                <strong title={formatCurrency(totalDestinadoPagos)}>
                  {formatCurrencyCompact(totalDestinadoPagos)}
                </strong>
              </article>
              <article className="card-metric">
                <p>Saldo a pagar</p>
                <strong title={formatCurrency(saldoAPagar)}>{formatCurrencyCompact(saldoAPagar)}</strong>
              </article>
              <article className="card-metric">
                <p>Saldo sem destinacao</p>
                <strong title={formatCurrency(saldoSemDestinacao)}>
                  {formatCurrencyCompact(saldoSemDestinacao)}
                </strong>
              </article>
            </div>
          </section>

          {activeMenu === 'operacional' && (
            <article className="panel panel-soft sm:p-6">
              <nav className="rounded-2xl border border-slate-200/70 bg-white/70 p-2" aria-label="Navegacao operacional">
                <div className="flex flex-wrap gap-2">
                  {operationalTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={activeTab === tab.id ? 'tab tab-active' : 'tab'}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </nav>

              {activeTab === 'destinacao' && (
                <section className="mt-5 space-y-5 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Formulario de destinacao</h2>

                  <div>
                    <label className="field-label" htmlFor="empresaSelecionada">
                      Empresa
                    </label>
                    <select
                      id="empresaSelecionada"
                      className="field-input"
                      value={empresaSelecionada}
                      onChange={(event) => {
                        setEmpresaSelecionada(event.target.value)
                        setSelectedProcessIds([])
                      }}
                    >
                      <option value="">Selecione</option>
                      {empresasComProcessos.map((empresa) => (
                        <option key={empresa} value={empresa}>
                          {empresa}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-cyan-50 p-4 text-sm sm:grid-cols-2">
                    <div>
                      <p className="text-zinc-500">Empresa selecionada</p>
                      <p className="font-medium text-zinc-900">{empresaSelecionada || '--'}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Processos disponiveis</p>
                      <p className="font-medium text-zinc-900">{processosEmpresa.length}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Processos selecionados</p>
                      <p className="font-medium text-zinc-900">{selectedProcessIds.length}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Valor total calculado</p>
                      <p className="font-semibold text-emerald-700">{formatCurrency(totalSelecionadoParaDestinar)}</p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-zinc-800">Processos para destinacao</p>
                      {processosEmpresaFiltrados.length > 0 && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-cyan-700 hover:underline"
                          onClick={() =>
                            setSelectedProcessIds((current) => {
                              const merged = new Set([...current, ...processosEmpresaFiltrados.map((item) => item.processoId)])
                              return Array.from(merged)
                            })
                          }
                        >
                          Marcar todos
                        </button>
                      )}
                    </div>

                    {processosEmpresa.length > 0 && (
                      <input
                        className="field-input"
                        value={filtroProcessoDestinacao}
                        onChange={(event) => setFiltroProcessoDestinacao(event.target.value)}
                        placeholder="Filtrar por processo, termo ou produto"
                      />
                    )}

                    {processosEmpresa.length === 0 && (
                      <p className="text-sm text-zinc-500">Nenhum processo com saldo disponivel para a empresa.</p>
                    )}

                    {processosEmpresa.length > 0 && processosEmpresaFiltrados.length === 0 && (
                      <p className="text-sm text-zinc-500">Nenhum processo encontrado para o filtro informado.</p>
                    )}

                    {processosEmpresaFiltrados.length > 0 && (
                      <ul className="max-h-56 space-y-2 overflow-auto">
                        {processosEmpresaFiltrados.map((item) => {
                          const checked = selectedProcessIds.includes(item.processoId)

                          return (
                            <li key={item.processoId} className="rounded-xl border border-slate-200 p-3">
                              <label className="flex cursor-pointer items-start gap-3 text-sm">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={(event) => {
                                    setSelectedProcessIds((current) => {
                                      if (event.target.checked) {
                                        return [...current, item.processoId]
                                      }
                                      return current.filter((id) => id !== item.processoId)
                                    })
                                  }}
                                />
                                <span>
                                  <span className="font-semibold text-zinc-900">{item.processoId}</span>
                                  <span className="ml-2 text-zinc-500">{item.termo || 'Sem termo'}</span>
                                  <span className="mt-1 block text-emerald-700">
                                    Saldo disponivel: {formatCurrency(item.saldoDisponivel)}
                                  </span>
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>

                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSalvarDestinacao}>
                    <div>
                      <label className="field-label" htmlFor="solicitacaoData">
                        Data de solicitacao
                      </label>
                      <input
                        id="solicitacaoData"
                        className="field-input"
                        type="date"
                        value={destForm.solicitacaoData}
                        onChange={(event) =>
                          setDestForm((current) => ({ ...current, solicitacaoData: event.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="entidadeId">
                        Entidade
                      </label>
                      <select
                        id="entidadeId"
                        className="field-input"
                        value={destForm.entidadeId}
                        onChange={(event) =>
                          setDestForm((current) => ({ ...current, entidadeId: event.target.value }))
                        }
                      >
                        <option value="">Selecione</option>
                        {entidades.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="competencia">
                        Competencia (MM/AAAA)
                      </label>
                      <input
                        id="competencia"
                        className="field-input"
                        value={destForm.competencia}
                        onChange={(event) =>
                          setDestForm((current) => ({
                            ...current,
                            competencia: toCompetenciaMask(event.target.value),
                          }))
                        }
                        placeholder="04/2026"
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button className="btn-primary w-full" type="submit">
                        Salvar destinacao
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {activeTab === 'pagamento' && (
                <section className="mt-5 space-y-4 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Confirmacao de pagamento</h2>
                  <p className="text-sm text-zinc-600">A lista exibe destinacoes em aberto (pendente ou parcial).</p>

                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleConfirmarPagamento}>
                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="destinacaoId">
                        Destinacao pendente
                      </label>
                      <select
                        id="destinacaoId"
                        className="field-input"
                        value={pagamentoForm.destinacaoId}
                        onChange={(event) =>
                          setPagamentoForm((current) => ({ ...current, destinacaoId: event.target.value }))
                        }
                      >
                        <option value="">Selecione</option>
                        {pendentes.map((item) => (
                          <option key={item.id} value={item.id}>
                            {`${item.processoId} | ${item.entidadeNome} | Saldo: ${formatCurrency(
                              Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0),
                            )}`}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="pgtoData">
                        Data de pagamento
                      </label>
                      <input
                        id="pgtoData"
                        className="field-input"
                        type="date"
                        value={pagamentoForm.pgtoData}
                        onChange={(event) =>
                          setPagamentoForm((current) => ({ ...current, pgtoData: event.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="formaPgto">
                        Forma de pagamento
                      </label>
                      <select
                        id="formaPgto"
                        className="field-input"
                        value={pagamentoForm.formaPgto}
                        onChange={(event) =>
                          setPagamentoForm((current) => ({ ...current, formaPgto: event.target.value }))
                        }
                      >
                        {pagamentoOptions.map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="valorPago">
                        Valor pago
                      </label>
                      <NumericFormat
                        id="valorPago"
                        className="field-input"
                        thousandSeparator="."
                        decimalSeparator="," 
                        prefix="R$ "
                        decimalScale={2}
                        fixedDecimalScale
                        allowNegative={false}
                        value={pagamentoForm.valorPago}
                        onValueChange={(values) =>
                          setPagamentoForm((current) => ({ ...current, valorPago: values.floatValue || 0 }))
                        }
                      />
                    </div>

                    <div className="sm:col-span-2">
                      <button className="btn-primary w-full" type="submit">
                        Confirmar pagamento
                      </button>
                    </div>
                  </form>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100/90 text-zinc-600">
                        <tr>
                          <th className="px-4 py-3">Processo</th>
                          <th className="px-4 py-3">Entidade</th>
                          <th className="px-4 py-3">Destinado</th>
                          <th className="px-4 py-3">Pago</th>
                          <th className="px-4 py-3">Saldo</th>
                          <th className="px-4 py-3">Solicitacao</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendentes.length === 0 && (
                          <tr>
                            <td colSpan="6" className="px-4 py-4 text-zinc-500">
                              Sem pagamentos pendentes.
                            </td>
                          </tr>
                        )}
                        {pendentes.map((item) => (
                          <tr key={item.id} className="border-t border-slate-100/80 even:bg-slate-50/70">
                            <td className="px-4 py-3 font-medium text-zinc-900">{item.processoId}</td>
                            <td className="px-4 py-3 text-zinc-600">{item.entidadeNome}</td>
                            <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.valorDestinado)}</td>
                            <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.valorPagoAcumulado || 0)}</td>
                            <td className="px-4 py-3 text-zinc-600">
                              {formatCurrency(
                                Math.max(0, Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0)),
                              )}
                            </td>
                            <td className="px-4 py-3 text-zinc-600">{formatDateBR(item.solicitacaoData)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {activeTab === 'gerencial' && (
                <section className="mt-5 space-y-4 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Painel gerencial por empresa</h2>
                  <p className="text-sm text-zinc-600">
                    Visao consolidada para acompanhamento de saldo a destinar e saldo a pagar por empresa.
                  </p>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <article className="card-metric">
                      <p>Empresas no painel</p>
                      <strong>{resumoEmpresas.length}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Fomento total</p>
                      <strong title={formatCurrency(totalEmFomentos)}>{formatCurrencyCompact(totalEmFomentos)}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Saldo total a destinar</p>
                      <strong title={formatCurrency(saldoSemDestinacao)}>{formatCurrencyCompact(saldoSemDestinacao)}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Saldo total a pagar</p>
                      <strong title={formatCurrency(saldoAPagar)}>{formatCurrencyCompact(saldoAPagar)}</strong>
                    </article>
                  </div>

                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100/90 text-zinc-600">
                        <tr>
                          <th className="px-4 py-3">Empresa</th>
                          <th className="px-4 py-3">Fomento</th>
                          <th className="px-4 py-3">Destinado</th>
                          <th className="px-4 py-3">Pago</th>
                          <th className="px-4 py-3">Saldo a destinar</th>
                          <th className="px-4 py-3">Saldo a pagar</th>
                          <th className="px-4 py-3">Processos com saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumoEmpresas.length === 0 && (
                          <tr>
                            <td colSpan="7" className="px-4 py-4 text-zinc-500">
                              Sem dados para exibicao.
                            </td>
                          </tr>
                        )}

                        {resumoEmpresas.map((item) => (
                          <tr key={item.empresa} className="border-t border-slate-100/80 even:bg-slate-50/70">
                            <td className="px-4 py-3 font-medium text-zinc-900">{item.empresa}</td>
                            <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.totalFomento)}</td>
                            <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.totalDestinado)}</td>
                            <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.totalPago)}</td>
                            <td className="px-4 py-3 font-semibold text-emerald-700">{formatCurrency(item.saldoADestinar)}</td>
                            <td className="px-4 py-3 font-semibold text-amber-700">{formatCurrency(item.saldoAPagar)}</td>
                            <td className="px-4 py-3 text-zinc-600">
                              {item.processosComSaldo}/{item.processosTotal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

            </article>
          )}

          {activeMenu === 'cadastros' && (
            <section className="panel panel-soft sm:p-6">
              <nav className="rounded-2xl border border-slate-200/70 bg-white/70 p-2" aria-label="Submenu de cadastros">
                <div className="flex flex-wrap gap-2">
                  {visibleCadastroTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      className={activeCadastroTab === tab.id ? 'tab tab-active' : 'tab'}
                      onClick={() => setActiveCadastroTab(tab.id)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </nav>

              {!isAdmin && activeCadastroTab === 'usuarios' && (
                <section className="mt-5 animate-in rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  Seu perfil atual nao possui permissao para acessar os cadastros.
                </section>
              )}

              {canAccessCadastroBase && activeCadastroTab === 'empresas' && (
                <section className="mt-5 animate-in">
                  <form
                    className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                    onSubmit={handleSalvarEmpresa}
                  >
                    <h2 className="text-lg font-semibold text-zinc-900">Cadastro de empresas</h2>
                    <div>
                      <label className="field-label" htmlFor="razaoSocial">
                        Razao social
                      </label>
                      <input
                        id="razaoSocial"
                        className="field-input"
                        value={empresaForm.razaoSocial}
                        onChange={(event) =>
                          setEmpresaForm((current) => ({ ...current, razaoSocial: event.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label" htmlFor="cnpj">
                        CNPJ
                      </label>
                      <input
                        id="cnpj"
                        className="field-input"
                        value={empresaForm.cnpj}
                        onChange={(event) =>
                          setEmpresaForm((current) => ({ ...current, cnpj: maskCNPJ(event.target.value) }))
                        }
                        placeholder="00.000.000/0000-00"
                      />
                    </div>
                    <button className="btn-primary w-full" type="submit">
                      Cadastrar empresa
                    </button>

                    <div className="rounded-xl bg-white p-3 text-sm text-zinc-600">
                      Empresas cadastradas: {empresas.length}
                    </div>
                  </form>
                </section>
              )}

              {canAccessCadastroBase && activeCadastroTab === 'entidades' && (
                <section className="mt-5 animate-in">
                  <form
                    className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                    onSubmit={handleSalvarEntidade}
                  >
                    <h2 className="text-lg font-semibold text-zinc-900">Cadastro de entidades</h2>
                    <div>
                      <label className="field-label" htmlFor="entidadeNome">
                        Nome da entidade
                      </label>
                      <input
                        id="entidadeNome"
                        className="field-input"
                        value={entidadeForm.nome}
                        onChange={(event) =>
                          setEntidadeForm((current) => ({ ...current, nome: event.target.value }))
                        }
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="categoria">
                        Categoria
                      </label>
                      <select
                        id="categoria"
                        className="field-input"
                        value={entidadeForm.categoria}
                        onChange={(event) =>
                          setEntidadeForm((current) => ({ ...current, categoria: event.target.value }))
                        }
                      >
                        {categoriaOptions.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                      {categoriaTexto}
                    </div>

                    <button className="btn-primary w-full" type="submit">
                      Cadastrar entidade
                    </button>
                  </form>
                </section>
              )}

              {isAdmin && activeCadastroTab === 'usuarios' && (
                <section className="mt-5 animate-in space-y-4">
                  <h2 className="text-lg font-semibold text-zinc-900">Cadastro de usuarios</h2>
                  <p className="text-sm text-zinc-600">
                    Promova ou reverta perfis entre OPERADOR e admin, e bloqueie ou libere o acesso.
                  </p>

                  <form
                    className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-3"
                    onSubmit={handleCadastrarUsuario}
                  >
                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="novoUsuarioEmail">
                        Email
                      </label>
                      <input
                        id="novoUsuarioEmail"
                        className="field-input"
                        type="email"
                        value={newUserForm.email}
                        onChange={(event) =>
                          setNewUserForm((current) => ({ ...current, email: event.target.value }))
                        }
                        placeholder="usuario@dominio.com"
                      />
                    </div>

                    <div>
                      <label className="field-label" htmlFor="novoUsuarioRole">
                        Perfil
                      </label>
                      <select
                        id="novoUsuarioRole"
                        className="field-input"
                        value={newUserForm.role}
                        onChange={(event) =>
                          setNewUserForm((current) => ({ ...current, role: event.target.value }))
                        }
                      >
                        <option value="OPERADOR">OPERADOR</option>
                        <option value="admin">ADMIN</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="novoUsuarioSenha">
                        Senha provisoria
                      </label>
                      <input
                        id="novoUsuarioSenha"
                        className="field-input"
                        type="password"
                        value={newUserForm.password}
                        onChange={(event) =>
                          setNewUserForm((current) => ({ ...current, password: event.target.value }))
                        }
                        placeholder="Minimo 6 caracteres"
                      />
                    </div>

                    <div className="sm:col-span-1 sm:self-end">
                      <button className="btn-primary w-full" type="submit" disabled={isCreatingUser}>
                        {isCreatingUser ? 'Cadastrando...' : 'Cadastrar usuario'}
                      </button>
                    </div>
                  </form>

                  <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white/80">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100/90 text-zinc-600">
                        <tr>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">UID</th>
                          <th className="px-4 py-3">Perfil</th>
                          <th className="px-4 py-3">Acesso</th>
                          <th className="px-4 py-3 text-right">Acoes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.length === 0 && (
                          <tr>
                            <td colSpan="5" className="px-4 py-4 text-zinc-500">
                              Nenhum usuario encontrado.
                            </td>
                          </tr>
                        )}

                        {usersList.map((entry) => {
                          const isSelf = entry.uid === user.uid
                          const nextRole = entry.role === 'admin' ? 'OPERADOR' : 'admin'
                          const isBlocked = entry.blocked === true
                          const isRoleBusy = roleBusyUserId === entry.uid
                          const isAccessBusy = accessBusyUserId === entry.uid

                          return (
                            <tr key={entry.uid} className="border-t border-slate-100/80 even:bg-slate-50/70">
                              <td className="px-4 py-3 font-medium text-zinc-900">{entry.email || '--'}</td>
                              <td className="px-4 py-3 text-xs text-zinc-500">{entry.uid}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    entry.role === 'admin'
                                      ? 'rounded-full bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800'
                                      : 'rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800'
                                  }
                                >
                                  {(entry.role || 'OPERADOR').toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    isBlocked
                                      ? 'rounded-full bg-rose-100 px-2 py-1 text-xs font-semibold text-rose-800'
                                      : 'rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800'
                                  }
                                >
                                  {isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => handleUpdateRole(entry.uid, nextRole)}
                                    disabled={isSelf || isRoleBusy || isAccessBusy}
                                  >
                                    {isRoleBusy
                                      ? 'Atualizando perfil...'
                                      : isSelf
                                        ? 'Usuario atual'
                                        : `Tornar ${nextRole.toUpperCase()}`}
                                  </button>

                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => handleToggleUserAccess(entry.uid, !isBlocked)}
                                    disabled={isSelf || isAccessBusy || isRoleBusy}
                                  >
                                    {isAccessBusy
                                      ? 'Atualizando acesso...'
                                      : isSelf
                                        ? 'Usuario atual'
                                        : isBlocked
                                          ? 'Liberar acesso'
                                          : 'Bloquear acesso'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </section>
          )}

          {activeMenu === 'configuracoes' && (
            <section>
              <article className="panel panel-soft">
                <h2 className="text-lg font-semibold text-zinc-900">Configuracao do CSV</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Defina e salve o link publico para sincronizacao da base.
                </p>

                <form className="mt-5 space-y-3" onSubmit={handleSalvarCsvLink}>
                  <label className="field-label" htmlFor="csvUrl">
                    Link publico do CSV
                  </label>
                  <input
                    id="csvUrl"
                    className="field-input"
                    type="url"
                    value={csvUrl}
                    onChange={(event) => setCsvUrl(event.target.value)}
                    placeholder="https://dominio.com/base.csv"
                  />
                  <button className="btn-primary w-full" type="submit" disabled={isSavingCsvLink || !isAdmin}>
                    {isSavingCsvLink ? 'Salvando link...' : 'Salvar link do CSV'}
                  </button>
                </form>

                <button
                  className="mt-3 btn-primary w-full"
                  type="button"
                  onClick={handleSyncCsv}
                  disabled={isSyncing || !isAdmin}
                >
                  {isSyncing ? 'Sincronizando...' : 'Sincronizar base agora'}
                </button>

                {!isAdmin && (
                  <p className="mt-2 text-xs font-medium text-amber-700">
                    Somente usuarios com perfil ADMIN podem alterar configuracoes.
                  </p>
                )}

                <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-100/80 p-4 text-sm text-zinc-700">
                  <p>Processos em cache: {baseCsv.length}</p>
                  <p>Destinacoes registradas: {destinacoes.length}</p>
                  <p>Pagamentos pendentes: {pendentes.length}</p>
                </div>
              </article>
            </section>
          )}
        </section>
      </main>

      <nav
        className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden"
        aria-label="Menu mobile"
      >
        <div className="mx-auto grid max-w-2xl grid-cols-3 gap-2">
          <button
            type="button"
            className={activeMenu === 'operacional' ? 'tab tab-active w-full' : 'tab w-full'}
            onClick={() => setActiveMenu('operacional')}
          >
            Operacional
          </button>
          <button
            type="button"
            className={activeMenu === 'cadastros' ? 'tab tab-active w-full' : 'tab w-full'}
            onClick={() => setActiveMenu('cadastros')}
          >
            Cadastros
          </button>
          <button
            type="button"
            className={activeMenu === 'configuracoes' ? 'tab tab-active w-full' : 'tab w-full'}
            onClick={() => setActiveMenu('configuracoes')}
          >
            Configuracoes
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App
