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
  { id: 'destinacao', label: 'Destinações' },
  { id: 'pagamento', label: 'Confirmação de pagamento' },
]

const cadastroTabs = [
  { id: 'empresas', label: 'Cadastro de empresas' },
  { id: 'entidades', label: 'Cadastro de entidades' },
  { id: 'usuarios', label: 'Cadastro de usuários' },
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

function getTodayInputDate() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().split('T')[0]
}

function competenciaFromDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return ''
  }

  const [year, month] = isoDate.split('-')
  return `${month}/${year}`
}

function App() {
  const todayInputDate = getTodayInputDate()

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
  const [selectedProcessValues, setSelectedProcessValues] = useState({})
  const [filtroProcessoDestinacao, setFiltroProcessoDestinacao] = useState('')

  const [destForm, setDestForm] = useState({
    solicitacaoData: todayInputDate,
    entidadeId: '',
    competencia: competenciaFromDate(todayInputDate),
  })

  const [pagamentoForm, setPagamentoForm] = useState({
    destinacaoId: '',
    pgtoData: '',
    formaPgto: 'PIX',
    valorPago: 0,
  })

  const [empresaForm, setEmpresaForm] = useState({ razaoSocial: '', cnpj: '' })
  const [entidadeForm, setEntidadeForm] = useState({ nome: '', categoria: 'Assistencia' })
  const [isEntidadeModalOpen, setIsEntidadeModalOpen] = useState(false)
  const [isSavingEntidadeModal, setIsSavingEntidadeModal] = useState(false)
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
    const message = error?.message || 'Não foi possível acompanhar atualizações em tempo real.'
    toast.error(message, { id: 'firestore-realtime-error' })

    const rawMessage = String(error?.message || '')
    const lostAccess =
      rawMessage.includes('permission-denied') ||
      rawMessage.includes('unauthenticated') ||
      rawMessage.toLowerCase().includes('sem permissão')

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

    ensureUserProfile(user)
      .then((profile) => {
        setUserProfile(profile)
        stopProfile = subscribeUserProfile(user.uid, setUserProfile, handleRealtimeAccessError)
      })
      .catch((error) => {
        toast.error(error?.message || 'Não foi possível carregar perfil de acesso.')
        logout().catch(() => {})
      })

    return () => {
      stopProfile()
    }
  }, [user])

  useEffect(() => {
    if (!user || !userProfile || userProfile.blocked === true) {
      setCsvUrl('')
      return undefined
    }

    const stopAppSettings = subscribeAppSettings((settings) => {
      setCsvUrl(settings?.csvLink || '')
    }, handleRealtimeAccessError)

    return () => {
      stopAppSettings()
    }
  }, [user, userProfile])

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
        toast.error('Não foi possível encerrar a sessão bloqueada.')
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

  const processosEmpresaById = useMemo(
    () =>
      processosEmpresa.reduce((acc, item) => {
        acc[item.processoId] = item
        return acc
      }, {}),
    [processosEmpresa],
  )

  useEffect(() => {
    setSelectedProcessValues((current) => {
      const next = {}

      selectedProcessIds.forEach((processoId) => {
        const processo = processosEmpresaById[processoId]
        if (!processo) {
          return
        }

        const saldoDisponivel = Number(processo.saldoDisponivel || 0)
        const currentValue = Number(current[processoId] || 0)
        const normalizedValue =
          currentValue > 0
            ? Math.min(Number(currentValue.toFixed(2)), saldoDisponivel)
            : Number(saldoDisponivel.toFixed(2))

        next[processoId] = normalizedValue
      })

      if (JSON.stringify(next) === JSON.stringify(current)) {
        return current
      }

      return next
    })
  }, [selectedProcessIds, processosEmpresaById])

  function getValorSelecionadoParaProcesso(item) {
    const processoId = String(item?.processoId || '')
    const saldoDisponivel = Number(item?.saldoDisponivel || 0)
    const valorSelecionado = Number(selectedProcessValues[processoId] || 0)

    if (valorSelecionado <= 0 || saldoDisponivel <= 0) {
      return 0
    }

    return Math.min(Number(valorSelecionado.toFixed(2)), saldoDisponivel)
  }

  const totalSelecionadoParaDestinar = useMemo(
    () =>
      processosEmpresa
        .filter((item) => selectedProcessIds.includes(item.processoId))
        .reduce((acc, item) => acc + getValorSelecionadoParaProcesso(item), 0),
    [processosEmpresa, selectedProcessIds, selectedProcessValues],
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
      const empresa = String(processo.empresa || '').trim() || 'Empresa não informada'
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
      const empresa = String(destinacao.empresa || '').trim() || 'Empresa não informada'

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

  function handleIniciarDestinacaoPorEmpresa(empresa) {
    const normalizedEmpresa = String(empresa || '').trim()

    if (!normalizedEmpresa || !empresasComProcessos.includes(normalizedEmpresa)) {
      toast.error('Não foi possível abrir a destinação para esta empresa.')
      return
    }

    setActiveMenu('operacional')
    setActiveTab('destinacao')
    setEmpresaSelecionada(normalizedEmpresa)
    setSelectedProcessIds([])
    setSelectedProcessValues({})
    setFiltroProcessoDestinacao('')
  }

  useEffect(() => {
    if (!isEntidadeModalOpen) {
      return undefined
    }

    function handleEscapeClose(event) {
      if (event.key === 'Escape') {
        setIsEntidadeModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscapeClose)
    return () => window.removeEventListener('keydown', handleEscapeClose)
  }, [isEntidadeModalOpen])

  async function handleSyncCsv(event) {
    event?.preventDefault?.()

    if (!user) {
      toast.error('Autenticação obrigatória para sincronizar dados.')
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
        throw new Error('CSV sem registros válidos.')
      }

      await syncBaseCsv(records, user.uid)
      toast.success(`Base CSV sincronizada: ${records.length} processos.`)
    } catch (error) {
      toast.error(error.message || 'Não foi possível sincronizar o CSV.')
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
      toast.error('Não foi possível salvar o link do CSV.')
    } finally {
      setIsSavingCsvLink(false)
    }
  }

  async function handleSalvarDestinacao(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticação obrigatória para registrar destinação.')
      return
    }

    if (!empresaSelecionada) {
      toast.error('Selecione a empresa para destinação.')
      return
    }

    if (!selectedProcessIds.length) {
      toast.error('Selecione ao menos um processo para destinação.')
      return
    }

    if (!destForm.solicitacaoData || !destForm.entidadeId || !destForm.competencia) {
      toast.error('Preencha os campos obrigatórios da destinação.')
      return
    }

    const entidade = entidades.find((entry) => entry.id === destForm.entidadeId)
    const processosSelecionados = processosEmpresa.filter((item) =>
      selectedProcessIds.includes(item.processoId),
    )

    const processosSelecionadosComValor = processosSelecionados.map((processo) => ({
      ...processo,
      valorDestinadoSelecionado: getValorSelecionadoParaProcesso(processo),
    }))

    if (!processosSelecionadosComValor.length) {
      toast.error('Nenhum processo válido selecionado para destinação.')
      return
    }

    const processoComValorInvalido = processosSelecionadosComValor.find(
      (processo) =>
        Number(processo.valorDestinadoSelecionado || 0) <= 0 ||
        Number(processo.valorDestinadoSelecionado || 0) > Number(processo.saldoDisponivel || 0),
    )

    if (processoComValorInvalido) {
      toast.error('Revise os valores destinados. O valor deve ser maior que zero e respeitar o saldo.')
      return
    }

    try {
      for (const processo of processosSelecionadosComValor) {
        await createDestinacao({
          processoId: processo.processoId,
          termo: processo.termo,
          empresa: processo.empresa,
          produto: processo.produto,
          valorFomento: getValorFomentoFromProcess(processo),
          solicitacaoData: destForm.solicitacaoData,
          entidadeId: entidade?.id || '',
          entidadeNome: entidade?.nome || '',
          valorDestinado: processo.valorDestinadoSelecionado,
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

      const nextDate = getTodayInputDate()
      setDestForm({
        solicitacaoData: nextDate,
        entidadeId: '',
        competencia: competenciaFromDate(nextDate),
      })
      setSelectedProcessIds([])
      setSelectedProcessValues({})
      toast.success(`Destinações registradas: ${processosSelecionadosComValor.length}`)
    } catch (error) {
      toast.error(error.message || 'Falha ao salvar a destinação.')
    }
  }

  async function handleConfirmarPagamento(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticação obrigatória para confirmar pagamento.')
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
      toast.error(error.message || 'Não foi possível confirmar o pagamento.')
    }
  }

  async function handleSalvarEmpresa(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticação obrigatória para cadastrar empresa.')
      return
    }

    const cnpjLimpo = sanitizeCNPJ(empresaForm.cnpj)

    if (!empresaForm.razaoSocial.trim() || cnpjLimpo.length !== 14) {
      toast.error('Informe razão social e CNPJ válido.')
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
      toast.error('Não foi possível cadastrar empresa.')
    }
  }

  async function handleSalvarEntidade(event, options = {}) {
    event.preventDefault()

    const { closeModalOnSuccess = false, selectOnDestinacao = false } = options

    if (!user) {
      toast.error('Autenticação obrigatória para cadastrar entidade.')
      return
    }

    const normalizedEntidadeNome = entidadeForm.nome.trim().toLowerCase()

    if (!normalizedEntidadeNome || !entidadeForm.categoria) {
      toast.error('Informe nome e categoria da entidade.')
      return
    }

    const entidadeDuplicada = entidades.some(
      (entry) => String(entry?.nome || '').trim().toLowerCase() === normalizedEntidadeNome,
    )

    if (entidadeDuplicada) {
      toast.error('Já existe uma entidade cadastrada com este nome.')
      return
    }

    setIsSavingEntidadeModal(true)

    try {
      const createdEntidade = await createEntidade({
        nome: entidadeForm.nome.trim(),
        categoria: entidadeForm.categoria,
        descricaoCategoria: categoriaDescriptions[entidadeForm.categoria] || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.uid,
        updatedBy: user.uid,
      })

      if (selectOnDestinacao && createdEntidade?.id) {
        setDestForm((current) => ({ ...current, entidadeId: createdEntidade.id }))
      }

      setEntidadeForm({ nome: '', categoria: 'Assistencia' })

      if (closeModalOnSuccess) {
        setIsEntidadeModalOpen(false)
      }

      toast.success('Entidade cadastrada.')
    } catch {
      toast.error('Não foi possível cadastrar entidade.')
    } finally {
      setIsSavingEntidadeModal(false)
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
      toast.success('Credenciais validadas. Verificando permissão de acesso...')
      setAuthForm({ email: '', password: '' })
    } catch (error) {
      toast.error(error.message || 'Falha na autenticação.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleGoogleAuth() {
    setAuthBusy(true)

    try {
      await loginWithGoogle()
      toast.success('Login realizado. Verificando permissão de acesso...')
    } catch (error) {
      toast.error(error.message || 'Falha no login com Google.')
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleLogout() {
    try {
      await logout()
      toast.success('Sessão encerrada.')
    } catch {
      toast.error('Não foi possível encerrar a sessão.')
    }
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

  async function handleCadastrarUsuario(event) {
    event.preventDefault()

    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem cadastrar usuários.')
      return
    }

    const normalizedEmail = newUserForm.email.trim().toLowerCase()
    const normalizedPassword = newUserForm.password.trim()

    if (!normalizedEmail || !normalizedPassword) {
      toast.error('Informe email e senha para o novo usuário.')
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
        normalizedEmail,
        newUserForm.role,
        user.uid,
      )

      setNewUserForm({ email: '', password: '', role: 'OPERADOR' })
      toast.success('Usuário cadastrado com sucesso.')
    } catch (error) {
      toast.error(error.message || 'Não foi possível cadastrar o usuário.')
    } finally {
      setIsCreatingUser(false)
    }
  }

  if (authLoading) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
        <div className="mx-auto max-w-lg rounded-3xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-soft">
          <p className="text-sm font-medium text-zinc-600">Validando sessão...</p>
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
              Apenas usuários autenticados podem escrever em destinações, entidades e empresas.
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
              Novos acessos são criados somente por administradores.
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
          <p className="text-sm font-medium text-zinc-600">Validando permissão de acesso...</p>
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
              <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">Navegação</p>
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
                Configurações
              </button>
            </nav>

            <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3">
              <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700">Operação ativa</p>
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
                <p className="text-xs uppercase tracking-[0.22em] text-cyan-700">Gestão de fomentos sociais</p>
                <h1 className="headline mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  Controle de Destinação de Fomentos Sociais
                </h1>
                <p className="mt-3 max-w-2xl text-sm text-zinc-600 sm:text-base">
                  Use o menu para alternar entre a operação diária e as configurações do sistema.
                </p>
              </div>

              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3 text-right lg:hidden">
                <p className="text-[11px] uppercase tracking-[0.16em] text-cyan-700">Operação ativa</p>
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
                <p>Total destinado em trânsito</p>
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
                <p>Saldo sem destinação</p>
                <strong title={formatCurrency(saldoSemDestinacao)}>
                  {formatCurrencyCompact(saldoSemDestinacao)}
                </strong>
              </article>
            </div>
          </section>

          {activeMenu === 'operacional' && (
            <article className="panel panel-soft sm:p-6">
              <nav className="rounded-2xl border border-slate-200/70 bg-white/70 p-2" aria-label="Navegação operacional">
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
                  <h2 className="text-lg font-semibold text-zinc-900">Formulário de destinação</h2>

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
                        setSelectedProcessValues({})
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
                      <p className="text-zinc-500">Processos disponíveis</p>
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
                      <p className="text-sm font-semibold text-zinc-800">Processos para destinação</p>
                      {processosEmpresaFiltrados.length > 0 && (
                        <button
                          type="button"
                          className="text-xs font-semibold text-cyan-700 hover:underline"
                          onClick={() =>
                            {
                              const processIds = processosEmpresaFiltrados.map((item) => item.processoId)
                              const merged = new Set([...selectedProcessIds, ...processIds])
                              setSelectedProcessIds(Array.from(merged))
                              setSelectedProcessValues((current) => {
                                const next = { ...current }
                                processosEmpresaFiltrados.forEach((item) => {
                                  if (!next[item.processoId] || next[item.processoId] <= 0) {
                                    next[item.processoId] = Number(item.saldoDisponivel.toFixed(2))
                                  }
                                })
                                return next
                              })
                            }
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
                      <p className="text-sm text-zinc-500">Nenhum processo com saldo disponível para a empresa.</p>
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
                                        setSelectedProcessValues((values) => ({
                                          ...values,
                                          [item.processoId]: Number(item.saldoDisponivel.toFixed(2)),
                                        }))
                                        return [...current, item.processoId]
                                      }

                                      setSelectedProcessValues((values) => {
                                        const next = { ...values }
                                        delete next[item.processoId]
                                        return next
                                      })

                                      return current.filter((id) => id !== item.processoId)
                                    })
                                  }}
                                />
                                <span>
                                  <span className="font-semibold text-zinc-900">{item.processoId}</span>
                                  <span className="ml-2 text-zinc-500">{item.termo || 'Sem termo'}</span>
                                  <span className="mt-1 block text-emerald-700">
                                    Saldo disponível: {formatCurrency(item.saldoDisponivel)}
                                  </span>
                                  {checked && (
                                    <span className="mt-2 block">
                                      <span className="mb-1 block text-xs font-medium text-zinc-600">
                                        Valor destinado para este processo
                                      </span>
                                      <NumericFormat
                                        className="field-input"
                                        thousandSeparator="."
                                        decimalSeparator=","
                                        prefix="R$ "
                                        decimalScale={2}
                                        fixedDecimalScale
                                        allowNegative={false}
                                        value={selectedProcessValues[item.processoId] || 0}
                                        onValueChange={(values) => {
                                          const value = Math.max(
                                            0,
                                            Math.min(
                                              Number(values.floatValue || 0),
                                              Number(item.saldoDisponivel || 0),
                                            ),
                                          )

                                          setSelectedProcessValues((current) => ({
                                            ...current,
                                            [item.processoId]: Number(value.toFixed(2)),
                                          }))
                                        }}
                                      />
                                    </span>
                                  )}
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
                        Data de solicitação
                      </label>
                      <input
                        id="solicitacaoData"
                        className="field-input"
                        type="date"
                        value={destForm.solicitacaoData}
                        onChange={(event) =>
                          setDestForm((current) => {
                            const solicitacaoData = event.target.value
                            return {
                              ...current,
                              solicitacaoData,
                              competencia: competenciaFromDate(solicitacaoData),
                            }
                          })
                        }
                      />
                    </div>

                    <div>
                      <div className="mb-1 flex items-center justify-between gap-2">
                        <label className="field-label mb-0" htmlFor="entidadeId">
                          Entidade
                        </label>
                        <button
                          type="button"
                          className="text-xs font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline"
                          onClick={() => {
                            setEntidadeForm({ nome: '', categoria: 'Assistencia' })
                            setIsEntidadeModalOpen(true)
                          }}
                        >
                          Nova entidade
                        </button>
                      </div>
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
                        Competência (MM/AAAA)
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
                        Salvar destinação
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {activeTab === 'pagamento' && (
                <section className="mt-5 space-y-4 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Confirmação de pagamento</h2>
                  <p className="text-sm text-zinc-600">A lista exibe destinações em aberto (pendente ou parcial).</p>

                  <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleConfirmarPagamento}>
                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="destinacaoId">
                        Destinação pendente
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
                          <th className="px-4 py-3">Solicitação</th>
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
                    Visão consolidada para acompanhamento de saldo a destinar e saldo a pagar por empresa.
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
                              Sem dados para exibição.
                            </td>
                          </tr>
                        )}

                        {resumoEmpresas.map((item) => (
                          <tr key={item.empresa} className="border-t border-slate-100/80 even:bg-slate-50/70">
                            <td className="px-4 py-3 font-medium text-zinc-900">
                              <button
                                type="button"
                                className="w-full text-left font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline"
                                onClick={() => handleIniciarDestinacaoPorEmpresa(item.empresa)}
                                title="Abrir nova destinação para esta empresa"
                              >
                                {item.empresa}
                              </button>
                            </td>
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
                  Seu perfil atual não possui permissão para acessar os cadastros.
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
                        Razão social
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
                  <h2 className="text-lg font-semibold text-zinc-900">Cadastro de usuários</h2>
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
                        Senha provisória
                      </label>
                      <input
                        id="novoUsuarioSenha"
                        className="field-input"
                        type="password"
                        value={newUserForm.password}
                        onChange={(event) =>
                          setNewUserForm((current) => ({ ...current, password: event.target.value }))
                        }
                        placeholder="Mínimo 6 caracteres"
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
                          <th className="px-4 py-3 text-right">Ações</th>
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
                                        ? 'Usuário atual'
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
                                        ? 'Usuário atual'
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
                <h2 className="text-lg font-semibold text-zinc-900">Configuração do CSV</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Defina e salve o link público para sincronização da base.
                </p>

                <form className="mt-5 space-y-3" onSubmit={handleSalvarCsvLink}>
                  <label className="field-label" htmlFor="csvUrl">
                    Link público do CSV
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
                    Somente usuários com perfil ADMIN podem alterar configurações.
                  </p>
                )}

                <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-100/80 p-4 text-sm text-zinc-700">
                  <p>Processos em cache: {baseCsv.length}</p>
                  <p>Destinações registradas: {destinacoes.length}</p>
                  <p>Pagamentos pendentes: {pendentes.length}</p>
                </div>
              </article>
            </section>
          )}
        </section>
      </main>

      {isEntidadeModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-900/45 p-4">
          <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Cadastrar nova entidade</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Cadastre sem sair da destinação. O formulário preenchido permanece na tela.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-slate-50"
                onClick={() => setIsEntidadeModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <form
              className="space-y-4"
              onSubmit={(event) =>
                handleSalvarEntidade(event, {
                  closeModalOnSuccess: true,
                  selectOnDestinacao: true,
                })
              }
            >
              <div>
                <label className="field-label" htmlFor="modalEntidadeNome">
                  Nome da entidade
                </label>
                <input
                  id="modalEntidadeNome"
                  className="field-input"
                  value={entidadeForm.nome}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, nome: event.target.value }))
                  }
                  autoFocus
                />
              </div>

              <div>
                <label className="field-label" htmlFor="modalCategoriaEntidade">
                  Categoria
                </label>
                <select
                  id="modalCategoriaEntidade"
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

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                  onClick={() => setIsEntidadeModalOpen(false)}
                  disabled={isSavingEntidadeModal}
                >
                  Cancelar
                </button>
                <button className="btn-primary" type="submit" disabled={isSavingEntidadeModal}>
                  {isSavingEntidadeModal ? 'Cadastrando...' : 'Cadastrar e usar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
            Configurações
          </button>
        </div>
      </nav>
    </div>
  )
}

export default App

