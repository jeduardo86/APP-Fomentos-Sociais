import { useEffect, useMemo, useRef, useState } from 'react'
import toast, { Toaster } from 'react-hot-toast'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { AuthLoadingView, LoginView, ProfileLoadingView } from './components/AppAuthViews'
import { CadastroMenuSection } from './components/CadastroMenuSection'
import { EntidadeModal } from './components/EntidadeModal'
import { MobileBottomNav } from './components/MobileBottomNav'
import { OperationalMenuSection } from './components/OperationalMenuSection'
import { ReportsMenuSection } from './components/ReportsMenuSection'
import { SettingsMenuSection } from './components/SettingsMenuSection'
import { useOperationalData } from './hooks/useOperationalData'
import { useUserAdminActions } from './hooks/useUserAdminActions'
import { useReportData } from './hooks/useReportData'
import { categoriaDescriptions, categoriaOptions } from './lib/constants'
import {
  cadastroTabs,
  competenciaFromDate,
  createInitialEntidadeForm,
  FONT_SIZE_STORAGE_KEY,
  formatCurrencyCompact,
  getBaseCalculoFomentoFromProcess,
  getEmpresaGroupKey,
  getTodayInputDate,
  getValorFomentoFromProcess,
  operationalTabs,
  slugifyFileName,
} from './lib/appUtils'
import {
  formatCurrency,
  formatDateBR,
  maskCNPJ,
  sanitizeCNPJ,
  toCompetenciaMask,
} from './lib/formatters'
import { fetchAndParseCsv } from './services/csvService'
import {
  loginWithEmail,
  loginWithGoogle,
  logout,
  subscribeAuthState,
} from './services/authService'
import {
  collections,
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
  updateEntidade,
} from './services/firestoreService'

function App() {
  const todayInputDate = getTodayInputDate()

  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })

  const [activeMenu, setActiveMenu] = useState('operacional')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('destinacao')
  const [activeCadastroTab, setActiveCadastroTab] = useState('empresas')
  const [reportProcessoId, setReportProcessoId] = useState('')
  const [reportDataEmissao, setReportDataEmissao] = useState(todayInputDate)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
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
  const [filtroEmpresaDestinacao, setFiltroEmpresaDestinacao] = useState('')
  const [filtroEmpresaGerencial, setFiltroEmpresaGerencial] = useState('')

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
  const [isEmpresaFormVisible, setIsEmpresaFormVisible] = useState(false)
  const [entidadeForm, setEntidadeForm] = useState(createInitialEntidadeForm())
  const [isEntidadeFormVisible, setIsEntidadeFormVisible] = useState(false)
  const [editingEntidadeId, setEditingEntidadeId] = useState('')
  const [isEntidadeModalOpen, setIsEntidadeModalOpen] = useState(false)
  const [isSavingEntidadeModal, setIsSavingEntidadeModal] = useState(false)
  const [usersList, setUsersList] = useState([])
  const [roleBusyUserId, setRoleBusyUserId] = useState('')
  const [accessBusyUserId, setAccessBusyUserId] = useState('')
  const [nameBusyUserId, setNameBusyUserId] = useState('')
  const [editingUserId, setEditingUserId] = useState('')
  const [editingUserName, setEditingUserName] = useState('')
  const [editingUserCargo, setEditingUserCargo] = useState('')
  const [isRevokingBlockedSession, setIsRevokingBlockedSession] = useState(false)
  const [isCreatingUser, setIsCreatingUser] = useState(false)
  const [isCreateUserFormVisible, setIsCreateUserFormVisible] = useState(false)
  const [newUserForm, setNewUserForm] = useState({
    nome: '',
    cargo: '',
    email: '',
    password: '',
    role: 'OPERADOR',
  })
  const [isLargeFontEnabled, setIsLargeFontEnabled] = useState(() => {
    if (typeof window === 'undefined') {
      return false
    }

    return window.localStorage.getItem(FONT_SIZE_STORAGE_KEY) === 'large'
  })

  const isAdmin = userProfile?.role === 'admin' && userProfile?.blocked !== true
  const reportContentRef = useRef(null)
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
    const root = document.documentElement
    root.setAttribute('data-font-size', isLargeFontEnabled ? 'large' : 'default')
    window.localStorage.setItem(FONT_SIZE_STORAGE_KEY, isLargeFontEnabled ? 'large' : 'default')
  }, [isLargeFontEnabled])

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
      setEditingUserId('')
      setEditingUserName('')
      setEditingUserCargo('')
      setIsCreateUserFormVisible(false)
      return undefined
    }

    const stopUsers = subscribeUsers(setUsersList, handleRealtimeAccessError)
    return () => stopUsers()
  }, [user, isAdmin, userProfile])

  const {
    empresaSelecionadaInfo,
    empresasDestinacaoFiltradas,
    empresasDestinacaoOptions,
    pendentes,
    processosEmpresa,
    processosEmpresaFiltrados,
    resumoEmpresas,
    resumoEmpresasFiltradas,
    resumoFiltroGerencial,
    saldoAPagar,
    saldoSemDestinacao,
    totalDestinado,
    totalDestinadoEmTransito,
    totalDestinadoPagos,
    totalEmFomentos,
    totalSelecionadoParaDestinar,
  } = useOperationalData({
    baseCsv,
    destinacoes,
    empresaSelecionada,
    filtroEmpresaDestinacao,
    filtroEmpresaGerencial,
    filtroProcessoDestinacao,
    getEmpresaGroupKey,
    getValorFomentoFromProcess,
    maskCNPJ,
    sanitizeCNPJ,
    selectedProcessIds,
    selectedProcessValues,
    setSelectedProcessValues,
  })

  const {
    areasDestinacaoRelatorio,
    dataEmissaoRelatorioExtenso,
    destinacoesRelatorio,
    isProcessoRelatorioValido,
    processosParaRelatorio,
    reportProcessoIdNormalizado,
    saldoPagamentoRelatorio,
    statusPagamentoRelatorio,
    totalDestinadoRelatorio,
    totalPagoRelatorio,
    usuarioAssinaturaRelatorio,
  } = useReportData({
    baseCsv,
    categoriaOptions,
    destinacoes,
    entidades,
    reportDataEmissao,
    reportProcessoId,
    user,
    userProfile,
  })

  const categoriaTexto = categoriaDescriptions[entidadeForm.categoria] || ''

  const {
    handleCadastrarUsuario,
    handleCancelEditUserName,
    handleStartEditUserName,
    handleToggleUserAccess,
    handleUpdateRole,
    handleUpdateUserName,
  } = useUserAdminActions({
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
  })

  function handleSelectMobileMenu(nextMenu) {
    setActiveMenu(nextMenu)
    setIsMobileMenuOpen(false)
  }

  function handleIniciarDestinacaoPorEmpresa(empresaKey) {
    const normalizedEmpresaKey = String(empresaKey || '').trim()

    if (!normalizedEmpresaKey || !empresasDestinacaoOptions.some((item) => item.key === normalizedEmpresaKey)) {
      toast.error('Não foi possível abrir a destinação para esta empresa.')
      return
    }

    setActiveMenu('operacional')
    setActiveTab('destinacao')
    setEmpresaSelecionada(normalizedEmpresaKey)
    setSelectedProcessIds([])
    setSelectedProcessValues({})
    setFiltroEmpresaDestinacao('')
    setFiltroProcessoDestinacao('')
  }

  async function handleBaixarRelatorioPdf() {
    if (isGeneratingPdf) {
      return
    }

    if (!isProcessoRelatorioValido) {
      toast.error('Selecione um processo válido da lista para baixar o relatório.')
      return
    }

    const reportContent = reportContentRef.current

    if (!reportContent) {
      toast.error('Não foi possível localizar o conteúdo do relatório para gerar PDF.')
      return
    }

    setIsGeneratingPdf(true)

    try {
      const canvas = await html2canvas(reportContent, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width

      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight)
      } else {
        let heightLeft = imgHeight
        let position = 0

        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight

        while (heightLeft > 0) {
          position = heightLeft - imgHeight
          pdf.addPage()
          pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
          heightLeft -= pageHeight
        }
      }

      const safeProcessoId = String(reportProcessoIdNormalizado).replace(/[^a-zA-Z0-9-_]/g, '_')
      pdf.save(`relatorio-destinacao-social-${safeProcessoId}.pdf`)
      toast.success('PDF gerado com sucesso.')
    } catch {
      toast.error('Não foi possível gerar o PDF do relatório.')
    } finally {
      setIsGeneratingPdf(false)
    }
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

      let documentoGerado = false

      try {
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        const marginX = 14
        const contentWidth = pageWidth - marginX * 2
        const lineHeight = 5.5
        const sectionGap = 3.5
        let cursorY = 16

        function ensurePage(requiredHeight = lineHeight) {
          if (cursorY + requiredHeight > pageHeight - 16) {
            pdf.addPage()
            cursorY = 16
          }
        }

        function writeLines(text, options = {}) {
          const size = options.size || 11
          const fontStyle = options.fontStyle || 'normal'
          const gapAfter = options.gapAfter ?? 2
          const lines = Array.isArray(text) ? text : [text]

          pdf.setFont('helvetica', fontStyle)
          pdf.setFontSize(size)

          lines.forEach((line) => {
            const chunks = pdf.splitTextToSize(String(line || ''), contentWidth)
            const blockHeight = Math.max(lineHeight, chunks.length * lineHeight)
            ensurePage(blockHeight)
            pdf.text(chunks, marginX, cursorY)
            cursorY += blockHeight
          })

          cursorY += gapAfter
        }

        const valorTotalDestinado = processosSelecionadosComValor.reduce(
          (acc, processo) => acc + Number(processo.valorDestinadoSelecionado || 0),
          0,
        )

        const nomeEmpresa = String(empresaSelecionadaInfo?.empresa || 'Empresa não informada').trim()
        const cnpjEmpresa = String(empresaSelecionadaInfo?.cnpj || '').trim() || 'Não informado'
        const nomeEntidade = String(entidade?.nome || '').trim() || 'Não informado'
        const cnpjEntidade = String(entidade?.cnpj || '').trim() || 'Não informado'
        const chavePixEntidade = String(entidade?.chavePix || '').trim() || 'Não informada'
        const dadosBancariosEntidade =
          String(entidade?.dadosBancarios || '').trim() || 'Não informados'
        const contatoEntidade = String(entidade?.contato || '').trim() || 'Não informado'
        const responsavelEntidade = String(entidade?.responsavel || '').trim() || 'Não informado'

        const competenciaDocumento = String(destForm.competencia || '').trim() || '--/----'
        const solicitacaoDataDocumento = formatDateBR(destForm.solicitacaoData)
        const dataEmissaoDocumento = formatDateBR(new Date().toISOString())
        const usuarioResponsavelDocumento =
          userProfile?.nome || user?.displayName || user?.email || 'Usuário responsável'

        writeLines('Documento de Encaminhamento de Destinação Social', {
          size: 14,
          fontStyle: 'bold',
          gapAfter: sectionGap,
        })

        writeLines([
          '�? empresa responsável,',
          `Encaminhamos as informações da destinação social registrada na competência ${competenciaDocumento}.`,
          `Data da solicitação: ${solicitacaoDataDocumento}.`,
        ])

        writeLines('Dados da empresa', { fontStyle: 'bold', gapAfter: 1 })
        writeLines([`Razão social: ${nomeEmpresa}`, `CNPJ: ${cnpjEmpresa}`], {
          gapAfter: sectionGap,
        })

        writeLines('Dados da entidade destinatária', { fontStyle: 'bold', gapAfter: 1 })
        writeLines(
          [
            `Entidade: ${nomeEntidade}`,
            `CNPJ: ${cnpjEntidade}`,
            `Responsável: ${responsavelEntidade}`,
            `Contato: ${contatoEntidade}`,
            `Chave Pix: ${chavePixEntidade}`,
            `Dados bancários: ${dadosBancariosEntidade}`,
          ],
          { gapAfter: sectionGap },
        )

        writeLines('Processos e valores destinados', { fontStyle: 'bold', gapAfter: 1 })

        processosSelecionadosComValor.forEach((processo, index) => {
          writeLines(
            [
              `${index + 1}. Processo: ${String(processo.processoId || '').trim() || 'Não informado'}`,
              `Produto: ${String(processo.produto || '').trim() || 'Não informado'}`,
              `Termo: ${String(processo.termo || '').trim() || 'Não informado'}`,
              `Valor destinado: ${formatCurrency(processo.valorDestinadoSelecionado)}`,
            ],
            { gapAfter: 1 },
          )
        })

        writeLines(`Valor total destinado: ${formatCurrency(valorTotalDestinado)}`, {
          fontStyle: 'bold',
          gapAfter: sectionGap,
        })

        writeLines(
          [
            `Documento emitido em: ${dataEmissaoDocumento}.`,
            `Responsável pelo registro: ${usuarioResponsavelDocumento}.`,
          ],
          { gapAfter: sectionGap },
        )

        writeLines('Este documento deve ser encaminhado à empresa para ciência e providências cabíveis.')

        const empresaSlug = slugifyFileName(nomeEmpresa) || 'empresa'
        const competenciaSlug = slugifyFileName(competenciaDocumento.replace('/', '-')) || 'sem-competencia'
        pdf.save(`encaminhamento-destinacao-${empresaSlug}-${competenciaSlug}.pdf`)
        documentoGerado = true
      } catch {
        toast.error('Destinações salvas, mas não foi possível gerar o documento de encaminhamento.')
      }

      const nextDate = getTodayInputDate()
      setDestForm({
        solicitacaoData: nextDate,
        entidadeId: '',
        competencia: competenciaFromDate(nextDate),
      })
      setSelectedProcessIds([])
      setSelectedProcessValues({})
      toast.success(
        documentoGerado
          ? `Destinações registradas: ${processosSelecionadosComValor.length}. Documento gerado.`
          : `Destinações registradas: ${processosSelecionadosComValor.length}`,
      )
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
      setIsEmpresaFormVisible(false)
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
    const cnpjLimpo = sanitizeCNPJ(entidadeForm.cnpj)
    const chavePix = entidadeForm.chavePix.trim()
    const dadosBancarios = entidadeForm.dadosBancarios.trim()

    if (!normalizedEntidadeNome || !entidadeForm.categoria) {
      toast.error('Informe nome e categoria da entidade.')
      return
    }

    if (cnpjLimpo.length !== 14) {
      toast.error('Informe um CNPJ valido para a entidade.')
      return
    }

    if (!chavePix && !dadosBancarios) {
      toast.error('Informe a chave Pix ou os dados bancários para transferência.')
      return
    }

    const entidadeDuplicada = entidades.some(
      (entry) =>
        entry.id !== editingEntidadeId && String(entry?.nome || '').trim().toLowerCase() === normalizedEntidadeNome,
    )

    const entidadeComCnpjDuplicado = entidades.some(
      (entry) =>
        entry.id !== editingEntidadeId &&
        sanitizeCNPJ(entry?.cnpj).length === 14 &&
        sanitizeCNPJ(entry?.cnpj) === cnpjLimpo,
    )

    if (entidadeDuplicada) {
      toast.error('Já existe uma entidade cadastrada com este nome.')
      return
    }

    if (entidadeComCnpjDuplicado) {
      toast.error('Já existe uma entidade cadastrada com este CNPJ.')
      return
    }

    setIsSavingEntidadeModal(true)

    try {
      const basePayload = {
        nome: entidadeForm.nome.trim(),
        categoria: entidadeForm.categoria,
        cnpj: maskCNPJ(cnpjLimpo),
        contato: entidadeForm.contato.trim(),
        responsavel: entidadeForm.responsavel.trim(),
        chavePix,
        dadosBancarios,
        descricaoCategoria: categoriaDescriptions[entidadeForm.categoria] || '',
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      }

      let createdEntidade = null

      if (editingEntidadeId) {
        await updateEntidade(editingEntidadeId, basePayload)
      } else {
        createdEntidade = await createEntidade({
          ...basePayload,
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
        })
      }

      if (selectOnDestinacao && createdEntidade?.id) {
        setDestForm((current) => ({ ...current, entidadeId: createdEntidade.id }))
      }

      setEntidadeForm(createInitialEntidadeForm())
      setEditingEntidadeId('')

      if (!closeModalOnSuccess) {
        setIsEntidadeFormVisible(false)
      }

      if (closeModalOnSuccess) {
        setIsEntidadeModalOpen(false)
      }

      toast.success(editingEntidadeId ? 'Entidade atualizada.' : 'Entidade cadastrada.')
    } catch {
      toast.error(editingEntidadeId ? 'Não foi possível atualizar entidade.' : 'Não foi possível cadastrar entidade.')
    } finally {
      setIsSavingEntidadeModal(false)
    }
  }

  function handleEditEntidade(entry) {
    setActiveCadastroTab('entidades')
    setIsEntidadeFormVisible(true)
    setEditingEntidadeId(entry.id)
    setEntidadeForm({
      nome: String(entry?.nome || ''),
      categoria: String(entry?.categoria || 'Assistencia'),
      cnpj: maskCNPJ(entry?.cnpj || ''),
      contato: String(entry?.contato || ''),
      responsavel: String(entry?.responsavel || ''),
      chavePix: String(entry?.chavePix || ''),
      dadosBancarios: String(entry?.dadosBancarios || ''),
    })
    setIsEntidadeModalOpen(false)
  }

  function handleCancelarEdicaoEntidade() {
    setEditingEntidadeId('')
    setEntidadeForm(createInitialEntidadeForm())
    setIsEntidadeFormVisible(false)
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

  function handleToggleFontSize() {
    setIsLargeFontEnabled((current) => !current)
  }

  if (authLoading) {
    return <AuthLoadingView />
  }

  if (!user) {
    return (
      <LoginView
        authBusy={authBusy}
        authForm={authForm}
        onEmailChange={(email) => setAuthForm((current) => ({ ...current, email }))}
        onGoogleAuth={handleGoogleAuth}
        onPasswordChange={(password) => setAuthForm((current) => ({ ...current, password }))}
        onSubmit={handleAuthSubmit}
      />
    )
  }

  if (!userProfile) {
    return <ProfileLoadingView />
  }

  return (
    <div className="app-shell relative min-h-screen overflow-hidden bg-app-pattern px-4 pb-24 pt-6 text-zinc-900 sm:px-6 lg:px-8 lg:pb-6">
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />

      <main className="relative z-10 mx-auto flex w-full max-w-[1720px] gap-6 lg:items-stretch">
        <aside className="hidden w-64 shrink-0 lg:block lg:self-stretch xl:w-72">
          <div className="panel panel-soft flex h-full flex-col">
            <div className="space-y-5">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-cyan-700">Navegação</p>
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
                  className={activeMenu === 'relatorios' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => setActiveMenu('relatorios')}
                >
                  Relatórios
                </button>
                <button
                  type="button"
                  className={activeMenu === 'configuracoes' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => setActiveMenu('configuracoes')}
                >
                  Configurações
                </button>
              </nav>
            </div>

            <div className="mt-auto space-y-5 pt-5">
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3">
                <p className="text-sm uppercase tracking-[0.14em] text-cyan-700">Operação ativa</p>
                <p className="mt-1 break-all text-sm font-semibold text-cyan-900">{user.email || user.uid}</p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700">
                  Perfil: {isAdmin ? 'ADMIN' : 'OPERADOR'}
                </p>
              </div>

              <button
                type="button"
                className={
                  isLargeFontEnabled
                    ? 'w-full rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-left text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100'
                    : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-sm font-semibold text-zinc-700 transition hover:bg-slate-50'
                }
                onClick={handleToggleFontSize}
                aria-pressed={isLargeFontEnabled}
                title="Alternar modo de fonte grande"
              >
                {isLargeFontEnabled ? 'Fonte grande: ligada' : 'Fonte grande: desligada'}
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                onClick={handleLogout}
              >
                Sair
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <section className="panel panel-hero">
            <div className="flex flex-wrap items-end justify-between gap-5">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-cyan-700">Gestão de fomentos sociais</p>
                <h1 className="headline mt-3 break-words text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
                  Controle de Destinação de Fomentos Sociais
                </h1>
                <p className="mt-3 max-w-2xl break-words text-sm text-zinc-600 sm:text-base">
                  Use o menu para alternar entre operação diária, cadastros, relatórios e configurações do sistema.
                </p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
              <article className="card-metric text-center sm:col-span-2 xl:col-span-4">
                <p>Saldo sem destinação</p>
                <strong title={formatCurrency(saldoSemDestinacao)}>
                  {formatCurrency(saldoSemDestinacao)}
                </strong>
              </article>
            </div>
          </section>

          {activeMenu === 'operacional' && (
            <OperationalMenuSection
              activeTab={activeTab}
              competenciaFromDate={competenciaFromDate}
              createInitialEntidadeForm={createInitialEntidadeForm}
              destForm={destForm}
              empresasDestinacaoFiltradas={empresasDestinacaoFiltradas}
              empresaSelecionada={empresaSelecionada}
              empresaSelecionadaInfo={empresaSelecionadaInfo}
              entidades={entidades}
              filtroEmpresaDestinacao={filtroEmpresaDestinacao}
              filtroEmpresaGerencial={filtroEmpresaGerencial}
              filtroProcessoDestinacao={filtroProcessoDestinacao}
              formatCurrency={formatCurrency}
              formatCurrencyCompact={formatCurrencyCompact}
              formatDateBR={formatDateBR}
              getBaseCalculoFomentoFromProcess={getBaseCalculoFomentoFromProcess}
              handleConfirmarPagamento={handleConfirmarPagamento}
              handleIniciarDestinacaoPorEmpresa={handleIniciarDestinacaoPorEmpresa}
              handleSalvarDestinacao={handleSalvarDestinacao}
              operationalTabs={operationalTabs}
              pagamentoForm={pagamentoForm}
              pendentes={pendentes}
              processosEmpresa={processosEmpresa}
              processosEmpresaFiltrados={processosEmpresaFiltrados}
              resumoEmpresas={resumoEmpresas}
              resumoEmpresasFiltradas={resumoEmpresasFiltradas}
              resumoFiltroGerencial={resumoFiltroGerencial}
              selectedProcessIds={selectedProcessIds}
              selectedProcessValues={selectedProcessValues}
              setActiveTab={setActiveTab}
              setDestForm={setDestForm}
              setEditingEntidadeId={setEditingEntidadeId}
              setEmpresaSelecionada={setEmpresaSelecionada}
              setEntidadeForm={setEntidadeForm}
              setFiltroEmpresaDestinacao={setFiltroEmpresaDestinacao}
              setFiltroEmpresaGerencial={setFiltroEmpresaGerencial}
              setFiltroProcessoDestinacao={setFiltroProcessoDestinacao}
              setIsEntidadeModalOpen={setIsEntidadeModalOpen}
              setPagamentoForm={setPagamentoForm}
              setSelectedProcessIds={setSelectedProcessIds}
              setSelectedProcessValues={setSelectedProcessValues}
              toCompetenciaMask={toCompetenciaMask}
              totalSelecionadoParaDestinar={totalSelecionadoParaDestinar}
            />
          )}
          {activeMenu === 'cadastros' && (
            <CadastroMenuSection
              activeCadastroTab={activeCadastroTab}
              canAccessCadastroBase={canAccessCadastroBase}
              categoriaOptions={categoriaOptions}
              categoriaTexto={categoriaTexto}
              createInitialEntidadeForm={createInitialEntidadeForm}
              editingEntidadeId={editingEntidadeId}
              editingUserCargo={editingUserCargo}
              editingUserId={editingUserId}
              editingUserName={editingUserName}
              empresaForm={empresaForm}
              empresas={empresas}
              entidades={entidades}
              entidadeForm={entidadeForm}
              handleCadastrarUsuario={handleCadastrarUsuario}
              handleCancelEditUserName={handleCancelEditUserName}
              handleCancelarEdicaoEntidade={handleCancelarEdicaoEntidade}
              handleEditEntidade={handleEditEntidade}
              handleSalvarEmpresa={handleSalvarEmpresa}
              handleSalvarEntidade={handleSalvarEntidade}
              handleStartEditUserName={handleStartEditUserName}
              handleToggleUserAccess={handleToggleUserAccess}
              handleUpdateRole={handleUpdateRole}
              handleUpdateUserName={handleUpdateUserName}
              isAdmin={isAdmin}
              isCreateUserFormVisible={isCreateUserFormVisible}
              isCreatingUser={isCreatingUser}
              isEmpresaFormVisible={isEmpresaFormVisible}
              isEntidadeFormVisible={isEntidadeFormVisible}
              maskCNPJ={maskCNPJ}
              nameBusyUserId={nameBusyUserId}
              newUserForm={newUserForm}
              roleBusyUserId={roleBusyUserId}
              accessBusyUserId={accessBusyUserId}
              setActiveCadastroTab={setActiveCadastroTab}
              setEditingEntidadeId={setEditingEntidadeId}
              setEditingUserCargo={setEditingUserCargo}
              setEditingUserName={setEditingUserName}
              setEmpresaForm={setEmpresaForm}
              setEntidadeForm={setEntidadeForm}
              setIsCreateUserFormVisible={setIsCreateUserFormVisible}
              setIsEmpresaFormVisible={setIsEmpresaFormVisible}
              setIsEntidadeFormVisible={setIsEntidadeFormVisible}
              setNewUserForm={setNewUserForm}
              user={user}
              usersList={usersList}
              visibleCadastroTabs={visibleCadastroTabs}
            />
          )}
          {activeMenu === 'configuracoes' && (
            <SettingsMenuSection
              baseCsv={baseCsv}
              csvUrl={csvUrl}
              destinacoes={destinacoes}
              handleSalvarCsvLink={handleSalvarCsvLink}
              handleSyncCsv={handleSyncCsv}
              isAdmin={isAdmin}
              isSavingCsvLink={isSavingCsvLink}
              isSyncing={isSyncing}
              pendentes={pendentes}
              setCsvUrl={setCsvUrl}
            />
          )}

          {activeMenu === 'relatorios' && (
            <ReportsMenuSection
              areasDestinacaoRelatorio={areasDestinacaoRelatorio}
              dataEmissaoRelatorioExtenso={dataEmissaoRelatorioExtenso}
              destinacoesRelatorio={destinacoesRelatorio}
              formatCurrency={formatCurrency}
              handleBaixarRelatorioPdf={handleBaixarRelatorioPdf}
              isGeneratingPdf={isGeneratingPdf}
              isProcessoRelatorioValido={isProcessoRelatorioValido}
              processosParaRelatorio={processosParaRelatorio}
              reportContentRef={reportContentRef}
              reportDataEmissao={reportDataEmissao}
              reportProcessoId={reportProcessoId}
              saldoPagamentoRelatorio={saldoPagamentoRelatorio}
              setReportDataEmissao={setReportDataEmissao}
              setReportProcessoId={setReportProcessoId}
              statusPagamentoRelatorio={statusPagamentoRelatorio}
              totalDestinadoRelatorio={totalDestinadoRelatorio}
              totalPagoRelatorio={totalPagoRelatorio}
              userProfile={userProfile}
              usuarioAssinaturaRelatorio={usuarioAssinaturaRelatorio}
            />
          )}
        </section>
      </main>

      <EntidadeModal
        categoriaOptions={categoriaOptions}
        categoriaTexto={categoriaTexto}
        entidadeForm={entidadeForm}
        handleSalvarEntidade={handleSalvarEntidade}
        isOpen={isEntidadeModalOpen}
        isSavingEntidadeModal={isSavingEntidadeModal}
        maskCNPJ={maskCNPJ}
        setEntidadeForm={setEntidadeForm}
        setIsEntidadeModalOpen={setIsEntidadeModalOpen}
      />

      <MobileBottomNav
        activeMenu={activeMenu}
        handleLogout={handleLogout}
        handleSelectMobileMenu={handleSelectMobileMenu}
        handleToggleFontSize={handleToggleFontSize}
        isAdmin={isAdmin}
        isLargeFontEnabled={isLargeFontEnabled}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
        user={user}
      />

    </div>
  )
}

export default App



