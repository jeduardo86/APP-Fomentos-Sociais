import { useEffect, useMemo, useRef, useState } from 'react'
import { NumericFormat } from 'react-number-format'
import toast, { Toaster } from 'react-hot-toast'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { categoriaDescriptions, categoriaOptions, pagamentoOptions } from './lib/constants'
import { ConfirmacaoAcaoModal } from './components/ConfirmacaoAcaoModal'
import {
  formatCurrency,
  formatDateBR,
  maskCNPJ,
  sanitizeCNPJ,
  toCompetenciaMask,
} from './lib/formatters'
import { BRAZIL_STATES, fetchMunicipiosByEstado, sortMunicipiosByCapitalFirst } from './lib/brazilLocations'
import { fetchAndParseCsv, validateCsvSourceInput } from './services/csvService'
import { fetchEntidadeByCnpj } from './services/cnpjService'
import {
  createUserByAdmin,
  loginWithEmail,
  loginWithGoogle,
  logout,
  subscribeAuthState,
} from './services/authService'
import {
  collections,
  createManualResourceSource,
  createUserProfileByAdmin,
  createDestinacao,
  deleteEmpresa,
  deleteDestinacao,
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
  updateDestinacao,
  updateEmpresa,
  updateEntidade,
  updateUserAccess,
  updateUserName,
  updateUserRole,
} from './services/firestoreService'

// Import the new UFR-PB Calculator component
import UfrPbCalculator from './components/UfrPbCalculator'

// Add a new menu item for the calculator
const additionalMenuTabs = [
  { id: 'calculadora', label: 'Calculadora UFR-PB' },
]

const destinationTabs = [
  { id: 'gerencial', label: 'Painel gerencial' },
  { id: 'destinacao', label: 'Destinações' },
  { id: 'pagamento', label: 'Pagamento' },
  { id: 'pagas', label: 'Destinações pagas' },
]

const cadastroTabs = [
  { id: 'empresas', label: 'Cadastro de operadores lotéricos' },
  { id: 'entidades', label: 'Cadastro de entidades' },
  { id: 'usuarios', label: 'Cadastro de usuários' },
]

const tipoFomentoOptions = ['Instantâneas', 'Semanais (PP)', 'Passiva']

const FONT_SIZE_STORAGE_KEY = 'app-fomentos-font-size'

function getValorFomentoFromProcess(item) {
  const baseCalculo = getBaseCalculoFomentoFromProcess(item)
  const valorMinimo = Number(item?.valorFomentoMinimo || 0)

  if (baseCalculo > 0) {
    return Math.max(baseCalculo * 0.075, valorMinimo)
  }

  return Math.max(Number(item?.valorFomento || 0), valorMinimo)
}

function getBaseCalculoFomentoFromProcess(item) {
  const premio = Number(item?.valorPremio || 0)
  const incentivo = Number(item?.incentivo || 0)

  if (premio > 0 || incentivo > 0) {
    return premio + Math.max(0, incentivo - premio * 0.15)
  }

  const valorFomento = Number(item?.valorFomento || 0)

  if (valorFomento > 0) {
    return valorFomento / 0.075
  }

  return 0
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

function slugifyFileName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function competenciaFromDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return ''
  }

  const [year, month] = isoDate.split('-')
  return `${month}/${year}`
}

function generateManualProcessId() {
  const now = new Date()
  const year = String(now.getFullYear())
  const random = String(Math.floor(Math.random() * 100000)).padStart(5, '0')

  return `LTP-MAN-${year}/${random}`
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

  return parsed / 100
}

function handleMoneyInputFocus(event) {
  if (typeof event?.target?.select !== 'function') {
    return
  }

  event.target.select()
}

function getAnoFromCompetenciaOrDate(item) {
  const competencia = String(item?.competencia || '').trim()
  const competenciaMatch = competencia.match(/^(\d{2})\/(\d{4})$/)

  if (competenciaMatch) {
    return competenciaMatch[2]
  }

  const solicitacao = String(item?.solicitacaoData || '').trim()
  const solicitacaoMatch = solicitacao.match(/^(\d{4})-\d{2}-\d{2}$/)

  if (solicitacaoMatch) {
    return solicitacaoMatch[1]
  }

  return ''
}

function formatPercent(value) {
  const parsed = Number(value || 0)

  return `${parsed.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`
}

function getStatusPagamentoLabel(value) {
  if (value === 'pago') {
    return 'Pago'
  }

  if (value === 'parcial') {
    return 'Parcial'
  }

  return 'Pendente'
}

function escapeCsvValue(value) {
  const raw = String(value ?? '')

  if (!raw.includes(';') && !raw.includes('"') && !raw.includes('\n') && !raw.includes('\r')) {
    return raw
  }

  return `"${raw.replace(/"/g, '""')}"`
}

function drawInstitutionalPdfHeader(pdf, title) {
  const pageWidth = pdf.internal.pageSize.getWidth()
  const marginX = 14
  const centerX = pageWidth / 2
  let cursorY = 16

  const headerLines = [
    'Governo do Estado da Paraiba',
    'Loteria do Estado da Paraiba',
    'Assessoria de Politicas Publicas',
  ]

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(82, 82, 91)

  headerLines.forEach((line) => {
    pdf.text(line, centerX, cursorY, { align: 'center' })
    cursorY += 5
  })

  cursorY += 4
  pdf.setTextColor(17, 24, 39)
  pdf.setFontSize(13)
  pdf.text(String(title || '').toUpperCase(), centerX, cursorY, { align: 'center' })

  cursorY += 4
  pdf.setDrawColor(212, 212, 216)
  pdf.setLineWidth(0.3)
  pdf.line(marginX, cursorY, pageWidth - marginX, cursorY)
  pdf.setTextColor(0, 0, 0)

  return cursorY + 8
}

function generateDestinacaoPdf(data) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const marginX = 14
  const contentWidth = pageWidth - marginX * 2
  
  let cursorY = drawInstitutionalPdfHeader(pdf, 'Documento de Encaminhamento de Destinação Social')
  cursorY += 6

  function ensurePage(requiredHeight = 10) {
    if (cursorY + requiredHeight > pageHeight - 16) {
      pdf.addPage()
      cursorY = 16
      return true
    }
    return false
  }

  // INTRO
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.setTextColor(51, 65, 85)
  const introText = `Ao operador lotérico autorizado,\nEncaminham-se, para ciência e providências, as informações da destinação social registrada na competência ${data.competenciaDocumento}.\nData da solicitação: ${data.solicitacaoDataDocumento}.`
  const splitIntro = pdf.splitTextToSize(introText, contentWidth)
  pdf.text(splitIntro, marginX, cursorY)
  cursorY += (splitIntro.length * 5) + 4

  function drawSectionTitle(title) {
    ensurePage(12)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(17, 24, 39)
    pdf.text(title, marginX, cursorY)
    cursorY += 4
    
    pdf.setDrawColor(226, 232, 240)
    pdf.setLineWidth(0.3)
    pdf.line(marginX, cursorY, marginX + contentWidth, cursorY)
    cursorY += 4
  }

  function drawInfoGrid(items) {
    const col1X = marginX
    const col2X = marginX + (contentWidth / 2) + 4
    
    let isLeft = true
    let rowMaxY = cursorY
    let startY = cursorY

    items.forEach((item, i) => {
      if (isLeft && i > 0) {
        startY = rowMaxY + 2
        ensurePage(12)
      }
      
      const currentX = isLeft ? col1X : col2X
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(8)
      pdf.setTextColor(100, 116, 139)
      pdf.text(String(item.label || '').toUpperCase(), currentX, startY)
      
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(15, 23, 42)
      const splitValue = pdf.splitTextToSize(String(item.value || ''), (contentWidth / 2) - 8)
      pdf.text(splitValue, currentX, startY + 4)
      
      const bottomY = startY + 4 + (splitValue.length * 4)
      if (bottomY > rowMaxY) {
        rowMaxY = bottomY
      }
      
      isLeft = !isLeft
    })
    
    cursorY = rowMaxY + 6
  }

  drawSectionTitle('Dados do Operador Lotérico')
  drawInfoGrid([
    { label: 'Razão Social', value: data.nomeEmpresa },
    { label: 'CNPJ', value: data.cnpjEmpresa }
  ])

  // SEÇÃO BASEADA NO TIPO DE DESTINO
  if (data.tipoDestino === 'empresa') {
    drawSectionTitle('Dados da Empresa Prestadora de Serviço')
    drawInfoGrid([
      { label: 'Razão Social', value: data.nomeEmpresaPrestadora },
      { label: 'CNPJ', value: data.cnpjEmpresaPrestadora },
      { label: 'Forma de Pagamento', value: data.formaPagamentoDestino },
      { label: 'Dados para Pagamento', value: data.dadosPagamentoDestino },
    ])
  } else {
    drawSectionTitle('Dados da Entidade Destinatária')
    drawInfoGrid([
      { label: 'Entidade', value: data.nomeEntidade },
      { label: 'CNPJ', value: data.cnpjEntidade },
      { label: 'Município / UF', value: `${data.municipioEntidade} / ${data.estadoEntidade}` },
      { label: 'Responsável', value: data.responsavelEntidade },
      { label: 'Contato', value: data.contatoEntidade },
      { label: 'Forma de Recebimento', value: data.recebimentoStr },
    ])
  }

  drawSectionTitle('Processos e Valores Destinados')
  
  ensurePage(15)
  pdf.setFillColor(248, 250, 252)
  pdf.setDrawColor(226, 232, 240)
  pdf.setLineWidth(0.3)
  pdf.rect(marginX, cursorY, contentWidth, 8, 'FD')
  
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(71, 85, 105)
  
  pdf.text('PROCESSO', marginX + 3, cursorY + 5)
  pdf.text('PRODUTO', marginX + 45, cursorY + 5)
  pdf.text('TERMO', marginX + 90, cursorY + 5)
  pdf.text('VALOR DESTINADO', marginX + contentWidth - 3, cursorY + 5, { align: 'right' })
  
  cursorY += 8
  
  data.processos.forEach((p, i) => {
    const rowHeight = 8
    ensurePage(rowHeight)
    
    if (i % 2 === 0) {
      pdf.setFillColor(255, 255, 255)
    } else {
      pdf.setFillColor(248, 250, 252)
    }
    pdf.rect(marginX, cursorY, contentWidth, rowHeight, 'F')
    
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(15, 23, 42)
    
    pdf.text(String(p.processoId || '--'), marginX + 3, cursorY + 5)
    
    const prodStr = String(p.produto || '--')
    const prodTrunc = prodStr.length > 22 ? prodStr.substring(0, 20) + '...' : prodStr
    pdf.text(prodTrunc, marginX + 45, cursorY + 5)

    const termoStr = String(p.termo || '--')
    const termoTrunc = termoStr.length > 25 ? termoStr.substring(0, 23) + '...' : termoStr
    pdf.text(termoTrunc, marginX + 90, cursorY + 5)
    
    pdf.setFont('helvetica', 'bold')
    pdf.text(formatCurrency(p.valorDestinado), marginX + contentWidth - 3, cursorY + 5, { align: 'right' })
    
    pdf.setDrawColor(241, 245, 249)
    pdf.line(marginX, cursorY + rowHeight, marginX + contentWidth, cursorY + rowHeight)
    
    cursorY += rowHeight
  })
  
  ensurePage(12)
  cursorY += 2
  pdf.setFillColor(241, 245, 249)
  pdf.rect(marginX, cursorY, contentWidth, 10, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(15, 23, 42)
  pdf.text('VALOR TOTAL DESTINADO:', marginX + 3, cursorY + 6.5)
  pdf.setFontSize(11)
  pdf.text(formatCurrency(data.valorTotalDestinado), marginX + contentWidth - 3, cursorY + 6.5, { align: 'right' })
  cursorY += 14
  
  if (data.observacaoDocumento) {
    drawSectionTitle('Observação')
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(9)
    pdf.setTextColor(51, 65, 85)
    const splitObs = pdf.splitTextToSize(data.observacaoDocumento, contentWidth)
    pdf.text(splitObs, marginX, cursorY)
    cursorY += (splitObs.length * 4) + 6
  }

  ensurePage(30)
  cursorY += 8
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(100, 116, 139)
  pdf.text('Documento emitido para instrução e comprovação administrativa.', marginX, cursorY, { align: 'left' })
  
  cursorY += 6
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(15, 23, 42)
  pdf.text(`Documento emitido em: ${data.dataEmissaoDocumento}`, marginX, cursorY)
  cursorY += 4
  pdf.text(`Responsável pelo registro: ${data.usuarioResponsavelDocumento}`, marginX, cursorY)

  return pdf
}

function getEmpresaGroupKey(cnpjValue, empresaNome) {
  const cnpjDigits = sanitizeCNPJ(cnpjValue)

  if (cnpjDigits) {
    return `cnpj:${cnpjDigits}`
  }

  return `sem-cnpj:${String(empresaNome || '').trim().toLowerCase()}`
}

function createInitialEntidadeForm() {
  return {
    nome: '',
    categoria: 'Assistencia',
    cnpj: '',
    estado: '',
    municipio: '',
    contato: '',
    responsavel: '',
    formaPagamento: 'PIX',
    chavePix: '',
    dadosBancarios: '',
    banco: '',
    agencia: '',
    conta: '',
  }
}

function createInitialEditDestinacaoForm() {
  return {
    entidadeId: '',
    competencia: '',
    processoSolicitacaoEntidade: '',
    observacao: '',
    valorDestinado: 0,
  }
}

function App() {
  const todayInputDate = getTodayInputDate()

  const [authLoading, setAuthLoading] = useState(true)
  const [authBusy, setAuthBusy] = useState(false)
  const [user, setUser] = useState(null)
  const [userProfile, setUserProfile] = useState(null)
  const [authForm, setAuthForm] = useState({ email: '', password: '' })

  const [activeMenu, setActiveMenu] = useState('destinacoes')
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('gerencial')
  const [activeCadastroTab, setActiveCadastroTab] = useState('empresas')
  const [activeReportTab, setActiveReportTab] = useState('verificacao')
  const [reportProcessoId, setReportProcessoId] = useState('')
  const [reportDataEmissao, setReportDataEmissao] = useState(todayInputDate)
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false)
  const [isGeneratingGerencialPdf, setIsGeneratingGerencialPdf] = useState(false)
  const [isExportingGerencialCsv, setIsExportingGerencialCsv] = useState(false)
  const [reportGerencialAno, setReportGerencialAno] = useState('todos')
  const [reportGerencialCompetencia, setReportGerencialCompetencia] = useState('todos')
  const [reportGerencialDestino, setReportGerencialDestino] = useState('todos')
  const [reportGerencialEntidadeId, setReportGerencialEntidadeId] = useState('todos')
  const [reportGerencialStatus, setReportGerencialStatus] = useState('todos')
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
  const [valorAlvoDestinacao, setValorAlvoDestinacao] = useState(0)
  const [entidadeSearchDestinacao, setEntidadeSearchDestinacao] = useState('')
  const [isEntidadeSearchOpen, setIsEntidadeSearchOpen] = useState(false)
  const [filtroProcessoDestinacao, setFiltroProcessoDestinacao] = useState('')
  const [filtroEmpresaGerencial, setFiltroEmpresaGerencial] = useState('')

  const [destForm, setDestForm] = useState({
    solicitacaoData: todayInputDate,
    entidadeId: '',
    competencia: competenciaFromDate(todayInputDate),
    processoSolicitacaoEntidade: '',
    observacao: '',
    tipoDestino: 'entidade', // 'entidade' ou 'empresa'
    empresaCnpj: '',
    empresaRazaoSocial: '',
    empresaFormaPagamento: 'PIX',
    empresaChavePix: '',
    empresaDadosBancarios: '',
    empresaBanco: '',
    empresaAgencia: '',
    empresaConta: '',
  })

  const [pagamentoForm, setPagamentoForm] = useState({
    destinacaoId: '',
    pgtoData: '',
    formaPgto: 'PIX',
    valorPago: 0,
  })
  const [tipoPagamentoSelecionado, setTipoPagamentoSelecionado] = useState('parcial')
  const [filtroDestinacaoPendente, setFiltroDestinacaoPendente] = useState('')
  const [filtroDestinacaoPaga, setFiltroDestinacaoPaga] = useState('')
  const [editingDestinacaoId, setEditingDestinacaoId] = useState('')
  const [editDestinacaoForm, setEditDestinacaoForm] = useState(createInitialEditDestinacaoForm())
  const [isSavingDestinacao, setIsSavingDestinacao] = useState(false)
  const [isConfirmacaoModalOpen, setIsConfirmacaoModalOpen] = useState(false)

  const [empresaForm, setEmpresaForm] = useState({ razaoSocial: '', cnpj: '' })
  const [isEmpresaFormVisible, setIsEmpresaFormVisible] = useState(false)
  const [editingEmpresaId, setEditingEmpresaId] = useState('')
  const [origemManualForm, setOrigemManualForm] = useState({
    empresaId: '',
    valorFomento: 0,
    processoId: '',
    tipoFomento: 'Instantâneas',
  })
  const [isOrigemManualModalOpen, setIsOrigemManualModalOpen] = useState(false)
  const [entidadeForm, setEntidadeForm] = useState(createInitialEntidadeForm())
  const [isEntidadeFormVisible, setIsEntidadeFormVisible] = useState(false)
  const [editingEntidadeId, setEditingEntidadeId] = useState('')
  const [isEntidadeModalOpen, setIsEntidadeModalOpen] = useState(false)
  const [isSavingEntidadeModal, setIsSavingEntidadeModal] = useState(false)
  const [municipiosByEstado, setMunicipiosByEstado] = useState({})
  const [isLoadingMunicipiosByEstado, setIsLoadingMunicipiosByEstado] = useState(false)
  const [isConsultandoCnpjEntidade, setIsConsultandoCnpjEntidade] = useState(false)
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
  const isLoadingMunicipiosRef = useRef(false)
  const lastCnpjLookupRef = useRef('')
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
    if (!isAdmin && activeReportTab === 'gerencial') {
      setActiveReportTab('verificacao')
    }
  }, [isAdmin, activeReportTab])

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

  const empresasDestinacaoOptions = useMemo(() => {
    const mapa = new Map()

    baseCsv.forEach((item) => {
      const empresaNome = String(item.empresa || '').trim() || 'Operador lotérico não informado'
      const empresaKey = getEmpresaGroupKey(item.cnpj, empresaNome)
      const cnpjDigits = sanitizeCNPJ(item.cnpj)

      if (!mapa.has(empresaKey)) {
        mapa.set(empresaKey, {
          empresaKey,
          cnpjDigits,
          nomes: new Map(),
          fallbackNome: empresaNome,
        })
      }

      const entry = mapa.get(empresaKey)
      entry.nomes.set(empresaNome, (entry.nomes.get(empresaNome) || 0) + 1)

      if (!entry.cnpjDigits && cnpjDigits) {
        entry.cnpjDigits = cnpjDigits
      }
    })

    return Array.from(mapa.values())
      .map((entry) => {
        const empresa =
          Array.from(entry.nomes.entries())
            .sort((a, b) => {
              if (b[1] !== a[1]) {
                return b[1] - a[1]
              }

              return a[0].localeCompare(b[0])
            })
            .at(0)?.[0] || entry.fallbackNome

        const cnpj = entry.cnpjDigits ? maskCNPJ(entry.cnpjDigits) : ''

        return {
          key: entry.empresaKey,
          empresa,
          cnpj,
          label: cnpj ? `${empresa} | ${cnpj}` : `${empresa} | CNPJ não informado`,
          searchIndex: [empresa, cnpj, ...Array.from(entry.nomes.keys())]
            .join(' ')
            .toLowerCase(),
        }
      })
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [baseCsv])

  const empresaSelecionadaInfo = useMemo(
    () => empresasDestinacaoOptions.find((item) => item.key === empresaSelecionada) || null,
    [empresasDestinacaoOptions, empresaSelecionada],
  )

  const processosParaRelatorio = useMemo(
    () =>
      Array.from(
        new Set(baseCsv.map((item) => String(item.processoId || '').trim()).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true, sensitivity: 'base' })),
    [baseCsv],
  )

  const reportProcessoIdNormalizado = useMemo(
    () => String(reportProcessoId || '').trim(),
    [reportProcessoId],
  )

  const isProcessoRelatorioValido = useMemo(
    () =>
      Boolean(reportProcessoIdNormalizado) &&
      processosParaRelatorio.includes(reportProcessoIdNormalizado),
    [processosParaRelatorio, reportProcessoIdNormalizado],
  )

  const processoSelecionadoRelatorio = useMemo(
    () =>
      baseCsv.find((item) => String(item.processoId || '').trim() === reportProcessoIdNormalizado) ||
      null,
    [baseCsv, reportProcessoIdNormalizado],
  )

  const destinacoesRelatorio = useMemo(() => {
    const processoId = reportProcessoIdNormalizado

    if (!processoId) {
      return []
    }

    return destinacoes
      .filter((item) => String(item.processoId || '').trim() === processoId)
      .sort((a, b) => String(a.solicitacaoData || '').localeCompare(String(b.solicitacaoData || '')))
  }, [destinacoes, reportProcessoIdNormalizado])

  const totalDestinadoRelatorio = useMemo(
    () => destinacoesRelatorio.reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoesRelatorio],
  )

  const totalPagoRelatorio = useMemo(
    () => destinacoesRelatorio.reduce((acc, item) => acc + Number(item.valorPagoAcumulado || 0), 0),
    [destinacoesRelatorio],
  )

  const saldoPagamentoRelatorio = useMemo(
    () => Math.max(0, totalDestinadoRelatorio - totalPagoRelatorio),
    [totalDestinadoRelatorio, totalPagoRelatorio],
  )

  const statusPagamentoRelatorio = useMemo(() => {
    if (!destinacoesRelatorio.length) {
      return 'sem-destinacao'
    }

    if (totalPagoRelatorio <= 0) {
      return 'nao-pago'
    }

    if (saldoPagamentoRelatorio <= 0.009) {
      return 'pago'
    }

    return 'parcial'
  }, [destinacoesRelatorio, totalPagoRelatorio, saldoPagamentoRelatorio])

  const entidadesRelatorio = useMemo(() => {
    const entidadesByIdRelatorio = new Map(
      entidades.map((entry) => [String(entry.id || '').trim(), entry]),
    )

    const entidadesUnicas = new Map()

    destinacoesRelatorio.forEach((item) => {
      const entidadeId = String(item.entidadeId || '').trim()
      const entidadeCadastro = entidadesByIdRelatorio.get(entidadeId)
      const nomeEntidade = String(item.entidadeNome || entidadeCadastro?.nome || '').trim()
      const cnpjDigits = sanitizeCNPJ(entidadeCadastro?.cnpj || '')
      const cnpjEntidade = cnpjDigits.length === 14 ? maskCNPJ(cnpjDigits) : ''

      if (!nomeEntidade && !cnpjEntidade) {
        return
      }

      const key = `${nomeEntidade.toLowerCase()}|${cnpjEntidade}`

      if (!entidadesUnicas.has(key)) {
        entidadesUnicas.set(key, {
          nome: nomeEntidade || 'Entidade não identificada',
          cnpj: cnpjEntidade,
        })
      }
    })

    return Array.from(entidadesUnicas.values()).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [destinacoesRelatorio, entidades])

  const areasDestinacaoRelatorio = useMemo(() => {
    const categoriaLabelByValue = new Map(categoriaOptions.map((item) => [item.value, item.label]))

    return Array.from(
      new Set(
        destinacoesRelatorio
          .map((item) => {
            const entidade = entidades.find((entry) => entry.id === item.entidadeId)
            const categoriaValue = String(entidade?.categoria || '').trim()

            if (!categoriaValue) {
              return ''
            }

            return categoriaLabelByValue.get(categoriaValue) || categoriaValue
          })
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))
  }, [destinacoesRelatorio, entidades])

  const usuarioAssinaturaRelatorio =
    userProfile?.nome || user?.displayName || user?.email || userProfile?.email || 'Usuário responsável'

  const dataEmissaoRelatorioExtenso = useMemo(() => {
    const fallbackDate = new Date()
    const date = reportDataEmissao ? new Date(`${reportDataEmissao}T12:00:00`) : fallbackDate
    const validDate = Number.isNaN(date.getTime()) ? fallbackDate : date

    return validDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [reportDataEmissao])

  const gerencialCategoriaLabelByValue = useMemo(
    () => new Map(categoriaOptions.map((item) => [item.value, item.label])),
    [],
  )

  const entidadesById = useMemo(
    () =>
      entidades.reduce((acc, entidade) => {
        acc[entidade.id] = entidade
        return acc
      }, {}),
    [entidades],
  )

  const anosGerencialOptions = useMemo(
    () =>
      Array.from(new Set(destinacoes.map((item) => getAnoFromCompetenciaOrDate(item)).filter(Boolean))).sort(
        (a, b) => Number(b) - Number(a),
      ),
    [destinacoes],
  )

  const competenciasGerencialOptions = useMemo(
    () =>
      Array.from(
        new Set(destinacoes.map((item) => String(item.competencia || '').trim()).filter(Boolean)),
      ).sort((a, b) => {
        const [mesA, anoA] = a.split('/')
        const [mesB, anoB] = b.split('/')
        const valorA = Number(anoA || 0) * 100 + Number(mesA || 0)
        const valorB = Number(anoB || 0) * 100 + Number(mesB || 0)
        return valorB - valorA
      }),
    [destinacoes],
  )

  const destinosGerencialOptions = useMemo(
    () =>
      Array.from(new Set(destinacoes.map((item) => String(item.produto || '').trim()).filter(Boolean))).sort(
        (a, b) => a.localeCompare(b),
      ),
    [destinacoes],
  )

  const entidadesGerencialOptions = useMemo(
    () =>
      entidades
        .map((item) => ({ id: item.id, nome: String(item.nome || '').trim() }))
        .filter((item) => item.id && item.nome)
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    [entidades],
  )

  const statusGerencialOptions = useMemo(() => ['pendente', 'parcial', 'pago'], [])

  const destinacoesGerencialFiltradas = useMemo(() => {
    return destinacoes.filter((item) => {
      const anoAtual = getAnoFromCompetenciaOrDate(item)
      const competenciaAtual = String(item.competencia || '').trim()
      const destinoAtual = String(item.produto || '').trim()
      const entidadeIdAtual = String(item.entidadeId || '').trim()
      const statusAtual = String(item.statusPagamento || 'pendente').trim() || 'pendente'

      if (reportGerencialAno !== 'todos' && anoAtual !== reportGerencialAno) {
        return false
      }

      if (reportGerencialCompetencia !== 'todos' && competenciaAtual !== reportGerencialCompetencia) {
        return false
      }

      if (reportGerencialDestino !== 'todos' && destinoAtual !== reportGerencialDestino) {
        return false
      }

      if (reportGerencialEntidadeId !== 'todos' && entidadeIdAtual !== reportGerencialEntidadeId) {
        return false
      }

      if (reportGerencialStatus !== 'todos' && statusAtual !== reportGerencialStatus) {
        return false
      }

      return true
    })
  }, [
    destinacoes,
    reportGerencialAno,
    reportGerencialCompetencia,
    reportGerencialDestino,
    reportGerencialEntidadeId,
    reportGerencialStatus,
  ])

  const totalDestinadoGerencialCents = useMemo(
    () =>
      destinacoesGerencialFiltradas.reduce((acc, item) => acc + toMoneyCents(item.valorDestinado), 0),
    [destinacoesGerencialFiltradas],
  )

  const totalDestinadoGerencial = useMemo(
    () => fromMoneyCents(totalDestinadoGerencialCents),
    [totalDestinadoGerencialCents],
  )

  const quantidadeDestinacoesGerencial = destinacoesGerencialFiltradas.length

  const totalEntidadesGerencial = useMemo(
    () =>
      new Set(
        destinacoesGerencialFiltradas.map((item) => String(item.entidadeId || '').trim()).filter(Boolean),
      ).size,
    [destinacoesGerencialFiltradas],
  )

  const totaisPorAnoGerencial = useMemo(() => {
    const mapa = new Map()

    destinacoesGerencialFiltradas.forEach((item) => {
      const ano = getAnoFromCompetenciaOrDate(item) || 'Sem ano'
      const valorCents = toMoneyCents(item.valorDestinado)
      mapa.set(ano, (mapa.get(ano) || 0) + valorCents)
    })

    return Array.from(mapa.entries())
      .map(([ano, valorCents]) => ({
        ano,
        valorCents,
        valor: fromMoneyCents(valorCents),
        percentual: totalDestinadoGerencialCents > 0 ? (valorCents / totalDestinadoGerencialCents) * 100 : 0,
      }))
      .sort((a, b) => {
        if (a.ano === 'Sem ano') {
          return 1
        }

        if (b.ano === 'Sem ano') {
          return -1
        }

        return Number(b.ano) - Number(a.ano)
      })
  }, [destinacoesGerencialFiltradas, totalDestinadoGerencialCents])

  const totaisPorCategoriaGerencial = useMemo(() => {
    const mapa = new Map()

    destinacoesGerencialFiltradas.forEach((item) => {
      const entidade = entidadesById[item.entidadeId]
      const categoriaValue = String(entidade?.categoria || '').trim()
      const categoria = gerencialCategoriaLabelByValue.get(categoriaValue) || categoriaValue || 'Não informada'
      const valorCents = toMoneyCents(item.valorDestinado)
      mapa.set(categoria, (mapa.get(categoria) || 0) + valorCents)
    })

    return Array.from(mapa.entries())
      .map(([categoria, valorCents]) => ({
        categoria,
        valorCents,
        valor: fromMoneyCents(valorCents),
        percentual: totalDestinadoGerencialCents > 0 ? (valorCents / totalDestinadoGerencialCents) * 100 : 0,
      }))
      .sort((a, b) => b.valorCents - a.valorCents)
  }, [destinacoesGerencialFiltradas, entidadesById, gerencialCategoriaLabelByValue, totalDestinadoGerencialCents])

  const totaisPorMunicipioGerencial = useMemo(() => {
    const mapa = new Map()

    destinacoesGerencialFiltradas.forEach((item) => {
      const entidade = entidadesById[item.entidadeId]
      const municipio = String(entidade?.municipio || '').trim() || 'Não informado'
      const estado = String(entidade?.estado || '').trim() || '--'
      const chave = `${municipio}/${estado}`
      const valorCents = toMoneyCents(item.valorDestinado)

      const atual = mapa.get(chave) || {
        municipio,
        estado,
        valorCents: 0,
        quantidade: 0,
      }

      atual.valorCents += valorCents
      atual.quantidade += 1
      mapa.set(chave, atual)
    })

    return Array.from(mapa.values())
      .map((item) => ({
        ...item,
        valor: fromMoneyCents(item.valorCents),
      }))
      .sort((a, b) => {
        if (b.valorCents !== a.valorCents) {
          return b.valorCents - a.valorCents
        }

        return `${a.municipio}${a.estado}`.localeCompare(`${b.municipio}${b.estado}`)
      })
  }, [destinacoesGerencialFiltradas, entidadesById])

  const totalMunicipiosGerencial = totaisPorMunicipioGerencial.length

  const linhasDetalhadasGerencial = useMemo(
    () => {
      const cnpjByProcesso = new Map()
      baseCsv.forEach((item) => {
        const id = String(item.processoId || '').trim()
        if (id) {
          cnpjByProcesso.set(id, String(item.cnpj || '').trim())
        }
      })

      return destinacoesGerencialFiltradas
        .map((item) => {
          const entidade = entidadesById[item.entidadeId]
          const categoriaValue = String(entidade?.categoria || '').trim()
          const valorCents = toMoneyCents(item.valorDestinado)
          
          let cnpjEmpresa = cnpjByProcesso.get(String(item.processoId || '').trim()) || item.cnpj || ''
          const cnpjDigits = sanitizeCNPJ(cnpjEmpresa)

          return {
            id: String(item.id || '').trim(),
            solicitacaoData: String(item.solicitacaoData || '').trim(),
            competencia: String(item.competencia || '').trim(),
            ano: getAnoFromCompetenciaOrDate(item) || 'Sem ano',
            processoId: String(item.processoId || '').trim(),
            termo: String(item.termo || '').trim(),
            empresa: String(item.empresa || 'Não informado').trim(),
            cnpjEmpresa: cnpjDigits ? maskCNPJ(cnpjDigits) : 'Não informado',
            destino: String(item.produto || '').trim(),
            entidade: String(item.entidadeNome || entidade?.nome || '').trim(),
            categoria: gerencialCategoriaLabelByValue.get(categoriaValue) || categoriaValue || 'Não informada',
            municipio: String(entidade?.municipio || '').trim() || 'Não informado',
            estado: String(entidade?.estado || '').trim() || '--',
            status: String(item.statusPagamento || 'pendente').trim() || 'pendente',
            valorCents,
            valor: fromMoneyCents(valorCents),
          }
        })
        .sort((a, b) => {
          const dataA = String(a.solicitacaoData || '')
          const dataB = String(b.solicitacaoData || '')

          if (dataB !== dataA) {
            return dataB.localeCompare(dataA)
          }

          const processoA = String(a.processoId || '').trim()
          const processoB = String(b.processoId || '').trim()
          return processoA.localeCompare(processoB, 'pt-BR', { numeric: true, sensitivity: 'base' })
        })
    },
    [destinacoesGerencialFiltradas, entidadesById, gerencialCategoriaLabelByValue, baseCsv],
  )

  const processosEmpresa = useMemo(() => {
    if (!empresaSelecionada) {
      return []
    }

    return baseCsv
      .filter((item) => {
        const empresaNome = String(item.empresa || '').trim() || 'Operador lotérico não informado'
        return getEmpresaGroupKey(item.cnpj, empresaNome) === empresaSelecionada
      })
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
      .sort((a, b) => {
        const processoA = String(a.processoId || '').trim()
        const processoB = String(b.processoId || '').trim()
        return processoA.localeCompare(processoB, 'pt-BR', { numeric: true, sensitivity: 'base' })
      })
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

  useEffect(() => {
    const valorAlvo = Number(valorAlvoDestinacao || 0)

    if (valorAlvo <= 0) {
      return
    }

    let restante = Number(valorAlvo.toFixed(2))
    const nextIds = []
    const nextValues = {}

    selectedProcessIds.forEach((processoId) => {
      const processo = processosEmpresaById[processoId]

      if (!processo || restante <= 0) {
        return
      }

      const saldoDisponivel = Number(processo.saldoDisponivel || 0)
      const valorAtual = Number(selectedProcessValues[processoId] || 0)
      const valorNormalizado = Math.max(0, Math.min(Number(valorAtual.toFixed(2)), saldoDisponivel))

      if (valorNormalizado <= 0) {
        return
      }

      const valorAplicado = Math.min(valorNormalizado, restante)

      if (valorAplicado <= 0) {
        return
      }

      const valorComDuasCasas = Number(valorAplicado.toFixed(2))
      nextIds.push(processoId)
      nextValues[processoId] = valorComDuasCasas
      restante = Number(Math.max(0, restante - valorComDuasCasas).toFixed(2))
    })

    const idsMudaram = JSON.stringify(nextIds) !== JSON.stringify(selectedProcessIds)
    const valoresMudaram = JSON.stringify(nextValues) !== JSON.stringify(selectedProcessValues)

    if (!idsMudaram && !valoresMudaram) {
      return
    }

    if (idsMudaram) {
      setSelectedProcessIds(nextIds)
    }

    if (valoresMudaram) {
      setSelectedProcessValues(nextValues)
    }
  }, [valorAlvoDestinacao, selectedProcessIds, selectedProcessValues, processosEmpresaById])

  function getValorSelecionadoParaProcesso(item) {
    const processoId = String(item?.processoId || '')
    const saldoDisponivel = Number(item?.saldoDisponivel || 0)
    const valorSelecionado = Number(selectedProcessValues[processoId] || 0)

    if (valorSelecionado <= 0 || saldoDisponivel <= 0) {
      return 0
    }

    return Math.min(Number(valorSelecionado.toFixed(2)), saldoDisponivel)
  }

  function handleToggleProcessoDestinacao(item) {
    const processoId = String(item?.processoId || '')

    if (!processoId) {
      return
    }

    setSelectedProcessIds((current) => {
      const jaSelecionado = current.includes(processoId)

      if (jaSelecionado) {
        setSelectedProcessValues((values) => {
          const next = { ...values }
          delete next[processoId]
          return next
        })

        return current.filter((id) => id !== processoId)
      }

      const valorAlvo = Number(valorAlvoDestinacao || 0)
      const saldoProcesso = Number(item.saldoDisponivel || 0)
      const totalAtualSelecionado = current.reduce((acc, id) => {
        const processoAtual = processosEmpresaById[id]

        if (!processoAtual) {
          return acc
        }

        const saldoAtual = Number(processoAtual.saldoDisponivel || 0)
        const valorAtual = Number(selectedProcessValues[id] || 0)
        const normalizado = Math.max(0, Math.min(Number(valorAtual.toFixed(2)), saldoAtual))
        return acc + normalizado
      }, 0)

      const restanteAlvo = Number(Math.max(0, valorAlvo - totalAtualSelecionado).toFixed(2))
      const valorInicial =
        valorAlvo > 0 ? Math.min(saldoProcesso, restanteAlvo) : Number(saldoProcesso.toFixed(2))

      if (valorAlvo > 0 && valorInicial <= 0) {
        toast.error('O valor informado para destinação já foi totalmente distribuído.')
        return current
      }

      setSelectedProcessValues((values) => ({
        ...values,
        [processoId]: Number(valorInicial.toFixed(2)),
      }))

      return [...current, processoId]
    })
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

  const entidadesDestinacaoFiltradas = useMemo(() => {
    const termo = String(entidadeSearchDestinacao || '').toLowerCase().trim()

    if (!termo) {
      return entidades
    }

    return entidades.filter((entry) => {
      const nome = String(entry?.nome || '').toLowerCase()
      const cnpj = String(entry?.cnpj || '').toLowerCase()
      const categoria = String(entry?.categoria || '').toLowerCase()
      const estado = String(entry?.estado || '').toLowerCase()
      const municipio = String(entry?.municipio || '').toLowerCase()

      return (
        nome.includes(termo) ||
        cnpj.includes(termo) ||
        categoria.includes(termo) ||
        estado.includes(termo) ||
        municipio.includes(termo)
      )
    })
  }, [entidades, entidadeSearchDestinacao])

  const municipiosDisponiveis = useMemo(() => {
    const estadoSelecionado = String(entidadeForm.estado || '').trim().toUpperCase()

    if (!estadoSelecionado) {
      return []
    }

    const municipiosEstado = municipiosByEstado[estadoSelecionado] || []
    return sortMunicipiosByCapitalFirst(municipiosEstado, estadoSelecionado)
  }, [entidadeForm.estado, municipiosByEstado])

  const municipiosDisponiveisComSelecionado = useMemo(() => {
    const municipioSelecionado = String(entidadeForm.municipio || '').trim()

    if (!municipioSelecionado || municipiosDisponiveis.includes(municipioSelecionado)) {
      return municipiosDisponiveis
    }

    return [municipioSelecionado, ...municipiosDisponiveis]
  }, [entidadeForm.municipio, municipiosDisponiveis])

  useEffect(() => {
    const estadoSelecionado = String(entidadeForm.estado || '').trim().toUpperCase()

    if (!estadoSelecionado) {
      if (entidadeForm.municipio) {
        setEntidadeForm((current) => ({ ...current, municipio: '' }))
      }
      return
    }
  }, [entidadeForm.estado, entidadeForm.municipio])

  async function handleConsultarDadosCnpjEntidade(rawCnpjValue) {
    const cnpjLimpo = sanitizeCNPJ(rawCnpjValue)

    if (cnpjLimpo.length !== 14) {
      return
    }

    if (isConsultandoCnpjEntidade || lastCnpjLookupRef.current === cnpjLimpo) {
      return
    }

    setIsConsultandoCnpjEntidade(true)

    try {
      const cnpjData = await fetchEntidadeByCnpj(cnpjLimpo)

      setEntidadeForm((current) => {
        if (sanitizeCNPJ(current.cnpj) !== cnpjLimpo) {
          return current
        }

        const nomeAtual = String(current.nome || '').trim()
        const nomeSugerido = String(cnpjData.nome || '').trim()
        const estadoSugerido = String(cnpjData.estado || '').trim().toUpperCase()
        const municipioSugerido = String(cnpjData.municipio || '').trim()
        const responsavelAtual = String(current.responsavel || '').trim()
        const responsavelSugerido = String(cnpjData.responsavel || '').trim()
        const contatoAtual = String(current.contato || '').trim()
        const contatoSugerido = String(cnpjData.contato || '').trim()

        return {
          ...current,
          nome: nomeAtual || nomeSugerido || current.nome,
          estado: estadoSugerido || current.estado,
          municipio: municipioSugerido || current.municipio,
          responsavel: responsavelAtual || responsavelSugerido || current.responsavel,
          contato: contatoAtual || contatoSugerido || current.contato,
        }
      })

      lastCnpjLookupRef.current = cnpjLimpo
      toast.success('Dados do CNPJ carregados automaticamente.')
    } catch (error) {
      toast.error(error?.message || 'Nao foi possivel consultar o CNPJ informado.')
    } finally {
      setIsConsultandoCnpjEntidade(false)
    }
  }

  useEffect(() => {
    if (!destForm.entidadeId) {
      return
    }

    const entidadeSelecionada = entidades.find((entry) => entry.id === destForm.entidadeId)

    if (!entidadeSelecionada) {
      return
    }

    const nomeEntidade = String(entidadeSelecionada.nome || '')

    if (nomeEntidade !== entidadeSearchDestinacao) {
      setEntidadeSearchDestinacao(nomeEntidade)
    }
  }, [destForm.entidadeId, entidades, entidadeSearchDestinacao])

  const totalEmFomentos = useMemo(
    () => baseCsv.reduce((acc, item) => acc + getValorFomentoFromProcess(item), 0),
    [baseCsv],
  )

  const totalDestinado = useMemo(
    () => destinacoes.reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoes],
  )

  const totalDestinadoEmTransito = useMemo(
    () => totalDestinado,
    [totalDestinado],
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

  const pendentes = useMemo(() => {
    return destinacoes
      .filter((item) => item.statusPagamento !== 'pago')
      .sort((a, b) => {
        const processoA = String(a.processoId || '').trim()
        const processoB = String(b.processoId || '').trim()
        const processoCompare = processoA.localeCompare(processoB, 'pt-BR', { numeric: true, sensitivity: 'base' })

        if (processoCompare !== 0) {
          return processoCompare
        }

        const empresaA = String(a.empresa || '').trim()
        const empresaB = String(b.empresa || '').trim()
        return empresaA.localeCompare(empresaB, 'pt-BR', { sensitivity: 'base' })
      })
  }, [destinacoes])

  const pagas = useMemo(
    () => destinacoes.filter((item) => item.statusPagamento === 'pago'),
    [destinacoes],
  )

  const pendentesFiltradosPagamento = useMemo(() => {
    const termo = String(filtroDestinacaoPendente || '').toLowerCase().trim()

    if (!termo) {
      return pendentes
    }

    return pendentes.filter((item) => {
      const empresa = String(item.empresa || '').toLowerCase()
      const entidade = String(item.entidadeNome || '').toLowerCase()
      const processoId = String(item.processoId || '').toLowerCase()

      return empresa.includes(termo) || entidade.includes(termo) || processoId.includes(termo)
    })
  }, [pendentes, filtroDestinacaoPendente])

  const pagasFiltradas = useMemo(() => {
    const termo = String(filtroDestinacaoPaga || '').toLowerCase().trim()

    const base = [...pagas].sort((a, b) => {
      const processoA = String(a.processoId || '').trim()
      const processoB = String(b.processoId || '').trim()
      const processoCompare = processoA.localeCompare(processoB, 'pt-BR', { numeric: true, sensitivity: 'base' })

      if (processoCompare !== 0) {
        return processoCompare
      }

      const empresaA = String(a.empresa || '').trim()
      const empresaB = String(b.empresa || '').trim()
      return empresaA.localeCompare(empresaB, 'pt-BR', { sensitivity: 'base' })
    })

    if (!termo) {
      return base
    }

    return base.filter((item) => {
      const empresa = String(item.empresa || '').toLowerCase()
      const entidade = String(item.entidadeNome || '').toLowerCase()
      const processoId = String(item.processoId || '').toLowerCase()

      return empresa.includes(termo) || entidade.includes(termo) || processoId.includes(termo)
    })
  }, [pagas, filtroDestinacaoPaga])

  const destinacaoSelecionadaPagamento = useMemo(
    () => pendentes.find((item) => item.id === pagamentoForm.destinacaoId) || null,
    [pendentes, pagamentoForm.destinacaoId],
  )

  const resumoEmpresas = useMemo(() => {
    const mapa = new Map()
    const processoToEmpresaKey = new Map()

    function ensureEmpresaItem(empresaKey, empresaNome, cnpjMasked) {
      if (!mapa.has(empresaKey)) {
        mapa.set(empresaKey, {
          empresaKey,
          empresa: empresaNome || 'Operador lotérico não informado',
          cnpj: cnpjMasked || '',
          nomes: new Map(),
          totalFomento: 0,
          totalDestinado: 0,
          totalPago: 0,
          processosTotal: 0,
          processosComSaldo: 0,
        })
      }

      return mapa.get(empresaKey)
    }

    baseCsv.forEach((processo) => {
      const empresa = String(processo.empresa || '').trim() || 'Operador lotérico não informado'
      const cnpjDigits = sanitizeCNPJ(processo.cnpj)
      const cnpjMasked = cnpjDigits ? maskCNPJ(cnpjDigits) : ''
      const empresaKey = getEmpresaGroupKey(cnpjDigits, empresa)
      const processoId = String(processo.processoId || '').trim()
      const item = ensureEmpresaItem(empresaKey, empresa, cnpjMasked)

      if (processoId) {
        processoToEmpresaKey.set(processoId, empresaKey)
      }

      if (empresa) {
        item.nomes.set(empresa, (item.nomes.get(empresa) || 0) + 1)
      }

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
      const processoId = String(destinacao.processoId || '').trim()
      let empresaKey = processoId ? processoToEmpresaKey.get(processoId) : ''

      if (!empresaKey) {
        const empresa = String(destinacao.empresa || '').trim() || 'Operador lotérico não informado'
        const cnpjDigits = sanitizeCNPJ(destinacao.cnpj)
        const cnpjMasked = cnpjDigits ? maskCNPJ(cnpjDigits) : ''
        empresaKey = getEmpresaGroupKey(cnpjDigits, empresa)
        ensureEmpresaItem(empresaKey, empresa, cnpjMasked)
      }

      const item = mapa.get(empresaKey)
      const nomeDestino = String(destinacao.empresa || '').trim()

      if (nomeDestino) {
        item.nomes.set(nomeDestino, (item.nomes.get(nomeDestino) || 0) + 1)
      }

      item.totalPago += Number(destinacao.valorPagoAcumulado || 0)
    })

    return Array.from(mapa.values())
      .map((item) => {
        const empresaPrincipal =
          Array.from(item.nomes.entries())
            .sort((a, b) => {
              if (b[1] !== a[1]) {
                return b[1] - a[1]
              }

              return a[0].localeCompare(b[0])
            })
            .at(0)?.[0] || item.empresa

        return {
          ...item,
          empresa: empresaPrincipal,
          saldoADestinar: Math.max(0, item.totalFomento - item.totalDestinado),
          saldoAPagar: Math.max(0, item.totalDestinado - item.totalPago),
          searchIndex: [
            item.cnpj,
            empresaPrincipal,
            ...Array.from(item.nomes.keys()),
          ]
            .join(' ')
            .toLowerCase(),
        }
      })
      .sort((a, b) => {
        const empresaCompare = String(a.empresa || '').localeCompare(String(b.empresa || ''), 'pt-BR', {
          sensitivity: 'base',
        })

        if (empresaCompare !== 0) {
          return empresaCompare
        }

        return String(a.cnpj || '').localeCompare(String(b.cnpj || ''), 'pt-BR', {
          sensitivity: 'base',
        })
      })
  }, [baseCsv, destinacoes])

  const resumoEmpresasFiltradas = useMemo(() => {
    const filtro = String(filtroEmpresaGerencial || '').toLowerCase().trim()

    if (!filtro) {
      return resumoEmpresas
    }

    return resumoEmpresas.filter((item) => item.searchIndex.includes(filtro))
  }, [resumoEmpresas, filtroEmpresaGerencial])

  const resumoFiltroGerencial = useMemo(
    () =>
      resumoEmpresasFiltradas.reduce(
        (acc, item) => {
          acc.totalFomento += Number(item.totalFomento || 0)
          acc.totalDestinado += Number(item.totalDestinado || 0)
          acc.totalPago += Number(item.totalPago || 0)
          acc.saldoADestinar += Number(item.saldoADestinar || 0)
          acc.saldoAPagar += Number(item.saldoAPagar || 0)
          acc.processosComSaldo += Number(item.processosComSaldo || 0)
          acc.processosTotal += Number(item.processosTotal || 0)
          return acc
        },
        {
          totalFomento: 0,
          totalDestinado: 0,
          totalPago: 0,
          saldoADestinar: 0,
          saldoAPagar: 0,
          processosComSaldo: 0,
          processosTotal: 0,
        },
      ),
    [resumoEmpresasFiltradas],
  )

  const categoriaTexto = categoriaDescriptions[entidadeForm.categoria] || ''

  const empresasCadastroOptions = useMemo(() => {
    // 1. Operadores cadastrados manualmente (coleção empresas)
    const cadastradosManuais = empresas
      .map((item) => ({
        id: String(item.id || '').trim(),
        razaoSocial: String(item.razaoSocial || '').trim(),
        cnpj: String(item.cnpj || '').trim(),
      }))
      .filter((item) => item.id && item.razaoSocial)

    // 2. Operadores extraídos do CSV (baseCsv)
    const mapaCsv = new Map()

    baseCsv.forEach((item) => {
      const empresaNome = String(item.empresa || '').trim() || 'Operador lotérico não informado'
      const empresaKey = getEmpresaGroupKey(item.cnpj, empresaNome)
      const cnpjDigits = sanitizeCNPJ(item.cnpj)

      if (!mapaCsv.has(empresaKey)) {
        mapaCsv.set(empresaKey, {
          empresaKey,
          cnpjDigits,
          nomes: new Map(),
          fallbackNome: empresaNome,
        })
      }

      const entry = mapaCsv.get(empresaKey)
      entry.nomes.set(empresaNome, (entry.nomes.get(empresaNome) || 0) + 1)

      if (!entry.cnpjDigits && cnpjDigits) {
        entry.cnpjDigits = cnpjDigits
      }
    })

    const operadoresCsv = Array.from(mapaCsv.values()).map((entry) => {
      const razaoSocial =
        Array.from(entry.nomes.entries())
          .sort((a, b) => {
            if (b[1] !== a[1]) {
              return b[1] - a[1]
            }
            return a[0].localeCompare(b[0])
          })
          .at(0)?.[0] || entry.fallbackNome

      const cnpj = entry.cnpjDigits ? maskCNPJ(entry.cnpjDigits) : ''
      const id = `csv:${entry.empresaKey}` // ID fictício para operadores do CSV

      return {
        id,
        razaoSocial,
        cnpj,
      }
    })

    // 3. Combinar, dando prioridade aos cadastrados manuais
    const mapaCombinado = new Map()

    // Primeiro adiciona os operadores do CSV
    operadoresCsv.forEach((item) => {
      const chave = item.cnpj || item.razaoSocial.toLowerCase()
      mapaCombinado.set(chave, item)
    })

    // Sobrescreve com operadores cadastrados manualmente (prioridade)
    cadastradosManuais.forEach((item) => {
      const chave = item.cnpj || item.razaoSocial.toLowerCase()
      mapaCombinado.set(chave, item)
    })

    // Converter para array e ordenar
    return Array.from(mapaCombinado.values()).sort((a, b) =>
      a.razaoSocial.localeCompare(b.razaoSocial),
    )
  }, [empresas, baseCsv])

  const empresasCadastroLista = useMemo(() => {
    return empresasCadastroOptions.map((item) => {
      const cnpjDigits = sanitizeCNPJ(item.cnpj)
      const razaoSocialNormalizada = String(item.razaoSocial || '').trim().toLowerCase()

      const processosAtrelados = baseCsv.filter((registro) => {
        const registroCnpj = sanitizeCNPJ(registro?.cnpj)
        const registroEmpresa = String(registro?.empresa || '').trim().toLowerCase()

        if (cnpjDigits.length === 14) {
          return registroCnpj === cnpjDigits
        }

        return Boolean(razaoSocialNormalizada) && registroEmpresa === razaoSocialNormalizada
      }).length

      const destinacoesAtreladas = destinacoes.filter((registro) => {
        const registroEmpresa = String(registro?.empresa || '').trim().toLowerCase()
        return Boolean(razaoSocialNormalizada) && registroEmpresa === razaoSocialNormalizada
      }).length

      const totalLancamentosAtrelados = processosAtrelados + destinacoesAtreladas

      return {
        ...item,
        processosAtrelados,
        destinacoesAtreladas,
        totalLancamentosAtrelados,
        canDelete: totalLancamentosAtrelados === 0,
      }
    })
  }, [empresasCadastroOptions, baseCsv, destinacoes])

  function handleSelectMobileMenu(nextMenu) {
    setActiveMenu(nextMenu)
    setIsMobileMenuOpen(false)
  }

  function handleIniciarDestinacaoPorEmpresa(empresaKey) {
    const normalizedEmpresaKey = String(empresaKey || '').trim()

    if (!normalizedEmpresaKey || !empresasDestinacaoOptions.some((item) => item.key === normalizedEmpresaKey)) {
      toast.error('Não foi possível abrir a destinação para este operador lotérico.')
      return
    }

    setActiveMenu('destinacoes')
    setActiveTab('destinacao')
    setEmpresaSelecionada(normalizedEmpresaKey)
    setSelectedProcessIds([])
    setSelectedProcessValues({})
    setValorAlvoDestinacao(0)
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

    setIsGeneratingPdf(true)

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const marginX = 14
      const contentWidth = pageWidth - marginX * 2
      
      let cursorY = drawInstitutionalPdfHeader(pdf, 'Relatório de Verificação de Destinação Social')
      cursorY += 6

      function ensurePage(requiredHeight = 10) {
        if (cursorY + requiredHeight > pageHeight - 16) {
          pdf.addPage()
          cursorY = 16
          return true
        }
        return false
      }

      function writeText(text, options = {}) {
        const size = options.size || 10
        const fontStyle = options.fontStyle || 'normal'
        const align = options.align || 'justify'
        const gapAfter = options.gapAfter ?? 4

        pdf.setFont('helvetica', fontStyle)
        pdf.setFontSize(size)
        pdf.setTextColor(51, 65, 85) // slate-700

        const lines = pdf.splitTextToSize(text, contentWidth)
        ensurePage(lines.length * 5)
        pdf.text(lines, marginX, cursorY, { align: align === 'justify' ? 'justify' : 'left', maxWidth: contentWidth })
        cursorY += (lines.length * 5) + gapAfter
      }

      // Text block for the decree
      pdf.setFillColor(248, 250, 252) // slate-50
      pdf.setDrawColor(226, 232, 240) // slate-200
      pdf.setLineWidth(0.3)
      pdf.rect(marginX, cursorY, contentWidth, 32, 'FD')
      
      let introY = cursorY + 6
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(71, 85, 105)
      
      const introText1 = 'De acordo com a Instrução Normativa nº 001/2024, que regulamenta a modalidade passiva, os recursos correspondentes a 7,5% da totalidade dos prêmios devem ser destinados ao fomento de ações e projetos nas áreas de Assistência, Desportos, Educação, Saúde e Desenvolvimento Social. Essas ações devem ser executadas pelo operador lotérico autorizado em parceria com a LOTEP. O Decreto nº 44.576/2023 também inclui a Segurança Pública entre as áreas contempladas.'
      const splitIntro1 = pdf.splitTextToSize(introText1, contentWidth - 6)
      pdf.text(splitIntro1, marginX + 3, introY, { align: 'justify', maxWidth: contentWidth - 6 })
      cursorY += 38

      writeText(`Em atendimento à consulta formalizada nos autos do processo administrativo nº ${reportProcessoIdNormalizado}, certifica-se a situação da destinação social a ele vinculada.`, { fontStyle: 'bold' })

      if (destinacoesRelatorio.length > 0) {
        writeText(`Após análise dos registros institucionais disponíveis no sistema de controle de fomentos, constata-se que houve destinação social de recursos para o referido processo, no montante total de ${formatCurrency(totalDestinadoRelatorio)}.`)

        const entidadesTexto = entidadesRelatorio
          .map((item) => item.cnpj ? `${item.nome} (CNPJ ${item.cnpj})` : `${item.nome} (CNPJ não informado)`)
          .join('; ') || 'Entidade não identificada'
        
        writeText(`As entidades recebedoras do fomento são: ${entidadesTexto}.`)

        const areasTexto = areasDestinacaoRelatorio.join('; ') || 'Área não identificada'
        writeText(`As áreas contempladas pela destinação no processo são: ${areasTexto}.`)

        if (statusPagamentoRelatorio === 'pago') {
          writeText(`Quanto ao pagamento, verifica-se que o valor destinado encontra-se integralmente pago, no total de ${formatCurrency(totalPagoRelatorio)}.`)
        } else if (statusPagamentoRelatorio === 'parcial') {
          writeText(`Quanto ao pagamento, verifica-se quitação parcial, com total pago de ${formatCurrency(totalPagoRelatorio)} e saldo pendente de ${formatCurrency(saldoPagamentoRelatorio)}.`)
        } else {
          writeText(`Quanto ao pagamento, não há registro de quitação até a presente data.`)
        }

        cursorY += 6
        ensurePage(15)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(10)
        pdf.setTextColor(15, 23, 42)
        pdf.text('Detalhamento por Entidade', marginX, cursorY)
        cursorY += 5

        const destinacoesPorEntidade = new Map()
        destinacoesRelatorio.forEach(dest => {
          const entId = dest.entidadeId
          const entidadeCadastro = entidadesById[entId]
          const nomeEntidade = String(dest.entidadeNome || entidadeCadastro?.nome || 'Entidade não identificada').trim()
          
          if (!destinacoesPorEntidade.has(nomeEntidade)) {
            destinacoesPorEntidade.set(nomeEntidade, {
              nome: nomeEntidade,
              valorDestinado: 0,
              valorPago: 0
            })
          }
          const item = destinacoesPorEntidade.get(nomeEntidade)
          item.valorDestinado += Number(dest.valorDestinado || 0)
          item.valorPago += Number(dest.valorPagoAcumulado || 0)
        })

        const detalhamento = Array.from(destinacoesPorEntidade.values())

        pdf.setFillColor(241, 245, 249) // slate-100
        pdf.setDrawColor(226, 232, 240) // slate-200
        pdf.setLineWidth(0.3)
        pdf.rect(marginX, cursorY, contentWidth, 7, 'F')
        pdf.line(marginX, cursorY + 7, marginX + contentWidth, cursorY + 7)
        pdf.line(marginX, cursorY, marginX + contentWidth, cursorY)
        
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(71, 85, 105)
        
        pdf.text('ENTIDADE', marginX + 3, cursorY + 5)
        pdf.text('DESTINADO', marginX + contentWidth - 40, cursorY + 5, { align: 'right' })
        pdf.text('PAGO', marginX + contentWidth - 3, cursorY + 5, { align: 'right' })
        cursorY += 7

        detalhamento.forEach((row, rowIndex) => {
          ensurePage(8)
          if (rowIndex % 2 !== 0) {
            pdf.setFillColor(248, 250, 252)
            pdf.rect(marginX, cursorY, contentWidth, 7, 'F')
          }
          
          pdf.setFont('helvetica', 'normal')
          pdf.setFontSize(9)
          pdf.setTextColor(15, 23, 42)
          
          const truncNome = row.nome.length > 50 ? row.nome.substring(0, 47) + '...' : row.nome
          pdf.text(truncNome, marginX + 3, cursorY + 4.8)
          
          pdf.setFont('helvetica', 'bold')
          pdf.text(formatCurrency(row.valorDestinado), marginX + contentWidth - 40, cursorY + 4.8, { align: 'right' })
          pdf.setTextColor(51, 65, 85)
          pdf.setFont('helvetica', 'normal')
          pdf.text(formatCurrency(row.valorPago), marginX + contentWidth - 3, cursorY + 4.8, { align: 'right' })
          
          pdf.setDrawColor(241, 245, 249)
          pdf.line(marginX, cursorY + 7, marginX + contentWidth, cursorY + 7)
          cursorY += 7
        })
        cursorY += 4
      } else {
        writeText(`Após análise dos registros institucionais disponíveis no sistema de controle de fomentos, não foram localizadas destinações sociais registradas para o processo informado até a presente data.`)
        writeText(`O presente relatório é emitido para fins de instrução processual, com vistas à comprovação formal da inexistência de destinação social registrada no âmbito do processo em epígrafe.`)
      }

      cursorY += 10
      writeText(`João Pessoa, ${dataEmissaoRelatorioExtenso}.`, { align: 'left' })

      ensurePage(40)
      cursorY += 25
      
      pdf.setDrawColor(148, 163, 184)
      pdf.setLineWidth(0.3)
      const sigWidth = 80
      pdf.line((pageWidth - sigWidth) / 2, cursorY, (pageWidth + sigWidth) / 2, cursorY)
      
      cursorY += 5
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(17, 24, 39)
      pdf.text(String(usuarioAssinaturaRelatorio).toUpperCase(), pageWidth / 2, cursorY, { align: 'center' })
      
      cursorY += 4
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(71, 85, 105)
      pdf.text(String(userProfile?.cargo || 'CARGO/FUNÇÃO').toUpperCase(), pageWidth / 2, cursorY, { align: 'center' })

      const safeProcessoId = String(reportProcessoIdNormalizado).replace(/[^a-zA-Z0-9-_]/g, '_')
      pdf.save(`relatorio-verificacao-destinacao-${safeProcessoId}.pdf`)
      toast.success('PDF gerado com sucesso.')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível gerar o PDF do relatório.')
    } finally {
      setIsGeneratingPdf(false)
    }
  }

  function handleExportarGerencialCsv() {
    if (!isAdmin) {
      toast.error('Apenas administradores podem exportar o relatório gerencial.')
      return
    }

    if (!linhasDetalhadasGerencial.length) {
      toast.error('Não há dados para exportar no filtro atual.')
      return
    }

    setIsExportingGerencialCsv(true)

    try {
      const header = [
        'Data solicitação',
        'Competência',
        'Ano',
        'Processo',
        'Termo',
        'Operador lotérico',
        'CNPJ',
        'Destino',
        'Entidade',
        'Categoria',
        'Município',
        'UF',
        'Status',
        'Valor destinado',
      ]

      const detailRows = linhasDetalhadasGerencial.map((item) => [
        formatDateBR(item.solicitacaoData),
        item.competencia,
        item.ano,
        item.processoId,
        item.termo,
        item.empresa,
        item.cnpjEmpresa,
        item.destino,
        item.entidade,
        item.categoria,
        item.municipio,
        item.estado,
        getStatusPagamentoLabel(item.status),
        formatCurrency(item.valor),
      ])

      const lines = [
        header.map((item) => escapeCsvValue(item)).join(';'),
        ...detailRows.map((row) => row.map((item) => escapeCsvValue(item)).join(';')),
      ]

      const csvContent = '\uFEFF' + lines.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')

      link.href = url
      link.setAttribute('download', `relatorio-gerencial-destinacao-fomento-${new Date().toISOString().slice(0, 10)}.csv`)
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      toast.success('CSV gerado com sucesso.')
    } catch (error) {
      console.error(error)
      toast.error('Não foi possível gerar o CSV: ' + String(error.message))
    } finally {
      setIsExportingGerencialCsv(false)
    }
  }

  function handleExportarGerencialPdf() {
    if (!isAdmin) {
      toast.error('Apenas administradores podem exportar o relatório gerencial.')
      return
    }

    if (!linhasDetalhadasGerencial.length) {
      toast.error('Não há dados para exportar no filtro atual.')
      return
    }

    setIsGeneratingGerencialPdf(true)

    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageHeight = pdf.internal.pageSize.getHeight()
      const marginX = 14
      const contentWidth = pdf.internal.pageSize.getWidth() - marginX * 2
      const generatedAt = new Date().toLocaleString('pt-BR')
      const usuarioGerador = userProfile?.nome || user?.displayName || user?.email || 'Usuário responsável'

      let cursorY = drawInstitutionalPdfHeader(pdf, 'Relatório Gerencial de Destinação Social')
      cursorY += 2

      function ensureSpace(requiredHeight) {
        if (cursorY + requiredHeight > pageHeight - 16) {
          pdf.addPage()
          cursorY = 16
          return true
        }
        return false
      }

      // 1. FILTROS APLICADOS
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(10)
      pdf.setTextColor(39, 39, 42)
      pdf.text('Filtros aplicados no relatório', marginX, cursorY)
      cursorY += 5

      const filtrosText = [
        `Ano: ${reportGerencialAno === 'todos' ? 'Todos' : reportGerencialAno}`,
        `Competência: ${reportGerencialCompetencia === 'todos' ? 'Todas' : reportGerencialCompetencia}`,
        `Destino: ${reportGerencialDestino === 'todos' ? 'Todos' : reportGerencialDestino}`,
        `Entidade: ${
          reportGerencialEntidadeId === 'todos'
            ? 'Todas'
            : String(entidadesById[reportGerencialEntidadeId]?.nome || 'Não informada')
        }`,
        `Status: ${
          reportGerencialStatus === 'todos' ? 'Todos' : getStatusPagamentoLabel(reportGerencialStatus)
        }`,
      ].join('   |   ')

      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(82, 82, 91)
      const splitFiltros = pdf.splitTextToSize(filtrosText, contentWidth)
      pdf.text(splitFiltros, marginX, cursorY)
      cursorY += (splitFiltros.length * 4) + 6

      // 2. RESUMO EXECUTIVO (CARDS)
      ensureSpace(30)
      pdf.setFont('helvetica', 'bold')
      pdf.setFontSize(12)
      pdf.setTextColor(17, 24, 39)
      pdf.text('Resumo Executivo', marginX, cursorY)
      cursorY += 6

      const cardW = (contentWidth - 6) / 2
      const cardH = 18

      function drawCard(x, y, w, h, title, value) {
        pdf.setFillColor(248, 250, 252) // slate-50
        pdf.setDrawColor(226, 232, 240) // slate-200
        pdf.setLineWidth(0.3)
        pdf.roundedRect(x, y, w, h, 2, 2, 'FD')
        
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(8)
        pdf.setTextColor(100, 116, 139) // slate-500
        pdf.text(title.toUpperCase(), x + 4, y + 6)
        
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(15)
        pdf.setTextColor(15, 23, 42) // slate-900
        pdf.text(value, x + 4, y + 14)
      }

      drawCard(marginX, cursorY, cardW, cardH, 'Total Destinado', formatCurrency(totalDestinadoGerencial))
      drawCard(marginX + cardW + 6, cursorY, cardW, cardH, 'Volume de Destinações', String(quantidadeDestinacoesGerencial))
      cursorY += cardH + 4

      drawCard(marginX, cursorY, cardW, cardH, 'Entidades Atendidas', String(totalEntidadesGerencial))
      drawCard(marginX + cardW + 6, cursorY, cardW, cardH, 'Municípios Contemplados', String(totalMunicipiosGerencial))
      cursorY += cardH + 10

      // Helper to draw tables
      function drawTable(title, headers, rows, colWidths, alignRights = []) {
        ensureSpace(20)
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(11)
        pdf.setTextColor(17, 24, 39)
        pdf.text(title, marginX, cursorY)
        cursorY += 5

        function drawHeader() {
          pdf.setFillColor(241, 245, 249) // slate-100
          pdf.setDrawColor(226, 232, 240) // slate-200
          pdf.setLineWidth(0.3)
          pdf.rect(marginX, cursorY, contentWidth, 7, 'F')
          pdf.line(marginX, cursorY + 7, marginX + contentWidth, cursorY + 7)
          pdf.line(marginX, cursorY, marginX + contentWidth, cursorY)
          pdf.setFont('helvetica', 'bold')
          pdf.setFontSize(8)
          pdf.setTextColor(71, 85, 105)

          let currentX = marginX + 3
          headers.forEach((h, i) => {
            if (alignRights.includes(i)) {
              pdf.text(h.toUpperCase(), currentX + colWidths[i] - 6, cursorY + 4.8, { align: 'right' })
            } else {
              pdf.text(h.toUpperCase(), currentX, cursorY + 4.8)
            }
            currentX += colWidths[i]
          })
          cursorY += 7
        }

        drawHeader()

        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(9)
        
        rows.forEach((row, rowIndex) => {
          if (ensureSpace(8)) {
             drawHeader()
             pdf.setFont('helvetica', 'normal')
             pdf.setFontSize(9)
          }
          
          if (rowIndex % 2 !== 0) {
            pdf.setFillColor(248, 250, 252) // slate-50
            pdf.rect(marginX, cursorY, contentWidth, 7, 'F')
          }
          
          let cx = marginX + 3
          row.forEach((cell, cellIndex) => {
            if (cellIndex === 0) {
              pdf.setTextColor(15, 23, 42)
              pdf.setFont('helvetica', 'bold')
            } else {
              pdf.setTextColor(51, 65, 85)
              pdf.setFont('helvetica', 'normal')
            }
            const cellStr = String(cell || '')
            
            if (alignRights.includes(cellIndex)) {
              pdf.text(cellStr, cx + colWidths[cellIndex] - 6, cursorY + 4.8, { align: 'right' })
            } else {
              // Simple truncation for long strings
              const truncated = cellStr.length > 55 ? cellStr.substring(0, 52) + '...' : cellStr
              pdf.text(truncated, cx, cursorY + 4.8)
            }
            cx += colWidths[cellIndex]
          })
          
          pdf.setDrawColor(241, 245, 249)
          pdf.line(marginX, cursorY + 7, marginX + contentWidth, cursorY + 7)
          cursorY += 7
        })
        cursorY += 8
      }

      // 3. DESTINAÇÃO POR ANO
      const anoRows = totaisPorAnoGerencial.map((item) => [
        String(item.ano),
        formatCurrency(item.valor),
        formatPercent(item.percentual),
      ])
      drawTable('Distribuição por Ano', ['Ano', 'Valor Destinado', 'Representatividade'], anoRows, [60, 60, 60], [1, 2])

      // 4. DESTINAÇÃO POR CATEGORIA
      const catRows = totaisPorCategoriaGerencial.map((item) => [
        String(item.categoria),
        formatCurrency(item.valor),
        formatPercent(item.percentual),
      ])
      drawTable('Distribuição por Categoria de Assistência', ['Categoria', 'Valor Destinado', 'Representatividade'], catRows, [90, 50, 42], [1, 2])

      // Análise Top 10
      const mapaEntidades = new Map()
      const mapaOperadores = new Map()

      destinacoesGerencialFiltradas.forEach((item) => {
        const entidade = entidadesById[item.entidadeId]
        const nomeEntidade = String(item.entidadeNome || entidade?.nome || 'Não informada').trim()
        const nomeOperador = String(item.empresa || 'Operador não informado').trim()
        const valorCents = toMoneyCents(item.valorDestinado)
        
        mapaEntidades.set(nomeEntidade, (mapaEntidades.get(nomeEntidade) || 0) + valorCents)
        mapaOperadores.set(nomeOperador, (mapaOperadores.get(nomeOperador) || 0) + valorCents)
      })

      const rankingEntidades = Array.from(mapaEntidades.entries())
        .map(([nome, valorCents]) => ({ nome, valorCents }))
        .sort((a, b) => b.valorCents - a.valorCents)
        .slice(0, 10)

      const rankingOperadores = Array.from(mapaOperadores.entries())
        .map(([nome, valorCents]) => ({ nome, valorCents }))
        .sort((a, b) => b.valorCents - a.valorCents)
        .slice(0, 10)

      // 5. TOP 10 ENTIDADES
      if (rankingEntidades.length > 0) {
        const entRows = rankingEntidades.map((item, idx) => [
          `${idx + 1}º`,
          item.nome,
          formatCurrency(fromMoneyCents(item.valorCents)),
          formatPercent(totalDestinadoGerencialCents > 0 ? (item.valorCents / totalDestinadoGerencialCents) * 100 : 0),
        ])
        drawTable('Top 10 Entidades Beneficiadas', ['Rank', 'Entidade', 'Valor Destinado', 'Part.'], entRows, [15, 100, 40, 27], [2, 3])
      }

      // 6. TOP 10 OPERADORES
      if (rankingOperadores.length > 0) {
        const opRows = rankingOperadores.map((item, idx) => [
          `${idx + 1}º`,
          item.nome,
          formatCurrency(fromMoneyCents(item.valorCents)),
          formatPercent(totalDestinadoGerencialCents > 0 ? (item.valorCents / totalDestinadoGerencialCents) * 100 : 0),
        ])
        drawTable('Top 10 Operadores Lotéricos (Origem dos Fomentos)', ['Rank', 'Operador Lotérico', 'Valor Destinado', 'Part.'], opRows, [15, 100, 40, 27], [2, 3])
      }

      // 7. MUNICÍPIOS
      const munRows = totaisPorMunicipioGerencial.map((item) => [
        `${item.municipio}/${item.estado}`,
        String(item.quantidade),
        formatCurrency(item.valor),
      ])
      drawTable('Abrangência Municipal', ['Município / UF', 'Qtd Destinações', 'Valor Destinado'], munRows, [90, 40, 52], [1, 2])

      // Page numbering & Footer
      const totalPages = pdf.internal.getNumberOfPages()
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(8)
        pdf.setTextColor(148, 163, 184) // slate-400
        pdf.text(
          `Emitido em ${generatedAt} por ${usuarioGerador} - Página ${i} de ${totalPages}`,
          marginX,
          pageHeight - 8
        )
      }

      pdf.save(`relatorio-gerencial-destinacao-fomento-${new Date().toISOString().slice(0, 10)}.pdf`)
      toast.success('PDF gerencial gerado com sucesso.')
    } catch (err) {
      console.error(err)
      toast.error('Não foi possível gerar o PDF do relatório gerencial.')
    } finally {
      setIsGeneratingGerencialPdf(false)
    }
  }

  useEffect(() => {
    if (!isEntidadeModalOpen && !isOrigemManualModalOpen) {
      return undefined
    }

    function handleEscapeClose(event) {
      if (event.key === 'Escape') {
        setIsEntidadeModalOpen(false)
        setIsOrigemManualModalOpen(false)
      }
    }

    window.addEventListener('keydown', handleEscapeClose)
    return () => window.removeEventListener('keydown', handleEscapeClose)
  }, [isEntidadeModalOpen, isOrigemManualModalOpen])

  useEffect(() => {
    if (isLoadingMunicipiosRef.current) {
      return
    }

    isLoadingMunicipiosRef.current = true
    setIsLoadingMunicipiosByEstado(true)

    fetchMunicipiosByEstado()
      .then((groupedMunicipios) => {
        setMunicipiosByEstado(groupedMunicipios)
      })
      .catch(() => {
        toast.error('Nao foi possivel carregar a lista de municipios do Brasil.')
      })
      .finally(() => {
        setIsLoadingMunicipiosByEstado(false)
      })
  }, [])

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

    const csvInputValidation = validateCsvSourceInput(csvUrl)

    if (!csvInputValidation.isValid) {
      toast.error(csvInputValidation.message || 'Informe a URL do CSV para sincronizar.')
      return
    }

    setIsSyncing(true)

    try {
      const records = await fetchAndParseCsv(csvInputValidation.normalizedUrl)
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

    const csvInputValidation = validateCsvSourceInput(csvUrl)

    if (!csvInputValidation.isValid) {
      toast.error(csvInputValidation.message || 'Informe o link da planilha ou do CSV.')
      return
    }

    setIsSavingCsvLink(true)

    try {
      await saveCsvLinkConfig(csvInputValidation.normalizedUrl, user.uid)
      setCsvUrl(csvInputValidation.normalizedUrl)
      toast.success('Link salvo com sucesso.')
    } catch {
      toast.error('Não foi possível salvar o link do CSV.')
    } finally {
      setIsSavingCsvLink(false)
    }
  }

  async function handleSalvarDestinacao(acao) {

  if (isSavingDestinacao) {
    // Prevent duplicate submissions
    return
  }

  setIsSavingDestinacao(true)

  try {
    if (!user) {
      toast.error('Autenticação obrigatória para registrar destinação.')
      return
    }

    if (!empresaSelecionada) {
      toast.error('Selecione o operador lotérico para destinação.')
      return
    }

    if (!selectedProcessIds.length) {
      toast.error('Selecione ao menos um processo para destinação.')
      return
    }

    if (!destForm.solicitacaoData || !destForm.competencia || !String(destForm.processoSolicitacaoEntidade || '').trim()) {
      toast.error('Preencha os campos obrigatórios da destinação.')
      return
    }

    if (destForm.tipoDestino === 'entidade' && !destForm.entidadeId) {
      toast.error('Selecione uma entidade para a destinação.')
      return
    }

    if (destForm.tipoDestino === 'empresa') {
      const cnpjLimpo = sanitizeCNPJ(destForm.empresaCnpj)
      if (cnpjLimpo.length !== 14) {
        toast.error('Informe um CNPJ válido para a empresa.')
        return
      }
      if (!destForm.empresaRazaoSocial.trim()) {
        toast.error('Informe a razão social da empresa.')
        return
      }
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
        processoSolicitacaoEntidade: String(destForm.processoSolicitacaoEntidade || '').trim(),
        observacao: String(destForm.observacao || '').trim(),
        statusPagamento: 'pendente',
        pgtoData: '',
        formaPgto: '',
        valorPagoAcumulado: 0,
        qtdPagamentos: 0,
        tipoDestino: destForm.tipoDestino,
        // Dados da empresa prestadora (se for o caso)
        empresaCnpj: destForm.tipoDestino === 'empresa' ? destForm.empresaCnpj : '',
        empresaRazaoSocial: destForm.tipoDestino === 'empresa' ? destForm.empresaRazaoSocial : '',
        empresaFormaPagamento: destForm.tipoDestino === 'empresa' ? destForm.empresaFormaPagamento : '',
        empresaChavePix: destForm.tipoDestino === 'empresa' ? destForm.empresaChavePix : '',
        empresaDadosBancarios: destForm.tipoDestino === 'empresa' ? destForm.empresaDadosBancarios : '',
        empresaBanco: destForm.tipoDestino === 'empresa' ? destForm.empresaBanco : '',
        empresaAgencia: destForm.tipoDestino === 'empresa' ? destForm.empresaAgencia : '',
        empresaConta: destForm.tipoDestino === 'empresa' ? destForm.empresaConta : '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: user.uid,
        updatedBy: user.uid,
      })
    }

    let documentoGerado = false

    try {
      const valorTotalDestinado = processosSelecionadosComValor.reduce(
        (acc, processo) => acc + Number(processo.valorDestinadoSelecionado || 0),
        0,
      )

      const nomeEmpresa = String(empresaSelecionadaInfo?.empresa || 'Operador lotérico não informado').trim()
      const cnpjEmpresa = String(empresaSelecionadaInfo?.cnpj || '').trim() || 'Não informado'
      
      const competenciaDocumento = String(destForm.competencia || '').trim() || '--/----'
      const solicitacaoDataDocumento = formatDateBR(destForm.solicitacaoData)
      const dataEmissaoDocumento = formatDateBR(new Date().toISOString())
      const usuarioResponsavelDocumento =
        userProfile?.nome || user?.displayName || user?.email || 'Usuário responsável'
      const observacaoDocumento = String(destForm.observacao || '').trim()

      let pdfData = {}

      if (destForm.tipoDestino === 'entidade') {
        // Dados da entidade
        const nomeEntidade = String(entidade?.nome || '').trim() || 'Não informado'
        const cnpjEntidade = String(entidade?.cnpj || '').trim() || 'Não informado'
        
        const formaPagamentoEntidade = String(entidade?.formaPagamento || '').trim()
        const bancoEntidade = String(entidade?.banco || '').trim()
        const agenciaEntidade = String(entidade?.agencia || '').trim()
        const contaEntidade = String(entidade?.conta || '').trim()
        const chavePixEntidade = String(entidade?.chavePix || '').trim()
        const dadosBancariosEntidade = String(entidade?.dadosBancarios || '').trim()

        let recebimentoStr = 'Não informado'
        if (formaPagamentoEntidade === 'PIX') recebimentoStr = `PIX - Chave: ${chavePixEntidade}`
        else if (formaPagamentoEntidade === 'Conta Bancária') recebimentoStr = `Conta Bancária - Banco: ${bancoEntidade}, Agência: ${agenciaEntidade}, Conta: ${contaEntidade}`
        else if (formaPagamentoEntidade === 'Boleto') recebimentoStr = `Boleto`
        else if (formaPagamentoEntidade === 'Outro') recebimentoStr = `Outro - ${dadosBancariosEntidade}`
        else if (chavePixEntidade) recebimentoStr = `PIX - Chave: ${chavePixEntidade}`
        else if (dadosBancariosEntidade) recebimentoStr = `Dados bancários: ${dadosBancariosEntidade}`

        const contatoEntidade = String(entidade?.contato || '').trim() || 'Não informado'
        const responsavelEntidade = String(entidade?.responsavel || '').trim() || 'Não informado'
        const municipioEntidade = String(entidade?.municipio || '').trim() || 'Nao informado'
        const estadoEntidade = String(entidade?.estado || '').trim() || 'Nao informado'

        pdfData = {
          tipoDestino: 'entidade',
          nomeEmpresa,
          cnpjEmpresa,
          nomeEntidade,
          cnpjEntidade,
          municipioEntidade,
          estadoEntidade,
          responsavelEntidade,
          contatoEntidade,
          recebimentoStr,
          processos: processosSelecionadosComValor.map(p => ({
            processoId: p.processoId,
            produto: p.produto,
            termo: p.termo,
            valorDestinado: p.valorDestinadoSelecionado
          })),
          valorTotalDestinado,
          competenciaDocumento,
          solicitacaoDataDocumento,
          dataEmissaoDocumento,
          usuarioResponsavelDocumento,
          observacaoDocumento
        }
      } else {
        // Dados da empresa prestadora de serviço
        let dadosPagamentoStr = ''
        if (destForm.empresaFormaPagamento === 'PIX') {
          dadosPagamentoStr = `PIX - Chave: ${destForm.empresaChavePix || 'Não informada'}`
        } else if (destForm.empresaFormaPagamento === 'Conta Bancária') {
          dadosPagamentoStr = `Conta Bancária - Banco: ${destForm.empresaBanco || '--'}, Agência: ${destForm.empresaAgencia || '--'}, Conta: ${destForm.empresaConta || '--'}`
        } else if (destForm.empresaFormaPagamento === 'Boleto') {
          dadosPagamentoStr = 'Boleto Bancário'
        } else {
          dadosPagamentoStr = `Outro - ${destForm.empresaDadosBancarios || 'Sem detalhes'}`
        }

        pdfData = {
          tipoDestino: 'empresa',
          nomeEmpresa,
          cnpjEmpresa,
          nomeEmpresaPrestadora: destForm.empresaRazaoSocial,
          cnpjEmpresaPrestadora: destForm.empresaCnpj,
          formaPagamentoDestino: destForm.empresaFormaPagamento,
          dadosPagamentoDestino: dadosPagamentoStr,
          processos: processosSelecionadosComValor.map(p => ({
            processoId: p.processoId,
            produto: p.produto,
            termo: p.termo,
            valorDestinado: p.valorDestinadoSelecionado
          })),
          valorTotalDestinado,
          competenciaDocumento,
          solicitacaoDataDocumento,
          dataEmissaoDocumento,
          usuarioResponsavelDocumento,
          observacaoDocumento
        }
      }

      if (acao === 'baixar') {
        const pdf = generateDestinacaoPdf(pdfData)
        const empresaSlug = slugifyFileName(nomeEmpresa) || 'operador-loterico'
        const competenciaSlug = slugifyFileName(competenciaDocumento.replace('/', '-')) || 'sem-competencia'
        pdf.save(`encaminhamento-destinacao-${empresaSlug}-${competenciaSlug}.pdf`)
        documentoGerado = true
      }
    } catch (e) {
      console.error(e)
      toast.error('Destinações salvas, mas não foi possível gerar o documento de encaminhamento.')
    }

    const nextDate = getTodayInputDate()
    setDestForm({
      solicitacaoData: nextDate,
      entidadeId: '',
      competencia: competenciaFromDate(nextDate),
      processoSolicitacaoEntidade: '',
      observacao: '',
      tipoDestino: 'entidade',
      empresaCnpj: '',
      empresaRazaoSocial: '',
      empresaFormaPagamento: 'PIX',
      empresaChavePix: '',
      empresaDadosBancarios: '',
      empresaBanco: '',
      empresaAgencia: '',
      empresaConta: '',
    })
    setEntidadeSearchDestinacao('')
    setIsEntidadeSearchOpen(false)
    setSelectedProcessIds([])
    setSelectedProcessValues({})
    setValorAlvoDestinacao(0)
    toast.success(
      documentoGerado
        ? `Destinações registradas: ${processosSelecionadosComValor.length}. Documento gerado.`
        : `Destinações registradas: ${processosSelecionadosComValor.length}`,
    )
  } catch (error) {
    toast.error(error.message || 'Falha ao salvar a destinação.')
  } finally {
    setIsSavingDestinacao(false)
  }
}

  // Abre o modal de confirmação ao submeter o formulário principal
  function handleAbrirConfirmacaoDestinacao(event) {
    event.preventDefault()
    if (isSavingDestinacao) return
    setIsConfirmacaoModalOpen(true)
  }

  // Trata a escolha do usuário e chama o salvamento com a ação desejada
  async function handleEscolhaAcaoDestinacao(tipo) {
    setIsConfirmacaoModalOpen(false)
    await handleSalvarDestinacao(tipo)
  }

  async function handleSalvarOrigemManual(event) {
    event.preventDefault()

    if (!user || !isAdmin) {
      toast.error('Apenas administradores podem cadastrar origem manual de recurso.')
      return
    }

    const empresaSelecionadaCadastro = empresasCadastroOptions.find(
      (item) => item.id === origemManualForm.empresaId,
    )
    const valorFomento = Number(origemManualForm.valorFomento || 0)
    const processoIdDigitado = String(origemManualForm.processoId || '').trim().toUpperCase()
    const processoId = processoIdDigitado || generateManualProcessId()

    if (!empresaSelecionadaCadastro) {
      toast.error('Selecione uma empresa cadastrada para a origem manual.')
      return
    }

    if (valorFomento <= 0) {
      toast.error('Informe um valor de fomento maior que zero.')
      return
    }

    const processoDuplicado = baseCsv.some(
      (item) => String(item?.processoId || '').trim().toUpperCase() === processoId,
    )

    if (processoDuplicado) {
      toast.error('Já existe um processo com esse identificador. Informe outro código.')
      return
    }

    const tipoFomento = tipoFomentoOptions.includes(origemManualForm.tipoFomento)
      ? origemManualForm.tipoFomento
      : 'Instantâneas'

    try {
      await createManualResourceSource(
        {
          processoId,
          empresa: empresaSelecionadaCadastro.razaoSocial,
          cnpj: empresaSelecionadaCadastro.cnpj,
          produto: tipoFomento,
          tipoFomento,
          valorFomento,
        },
        user.uid,
      )

      const empresaKey = getEmpresaGroupKey(
        empresaSelecionadaCadastro.cnpj,
        empresaSelecionadaCadastro.razaoSocial,
      )

      setEmpresaSelecionada(empresaKey)
      setSelectedProcessIds([])
      setSelectedProcessValues({})
      setValorAlvoDestinacao(0)
      setFiltroProcessoDestinacao('')
      setOrigemManualForm({
        empresaId: '',
        valorFomento: 0,
        processoId: '',
        tipoFomento: 'Instantâneas',
      })
      setIsOrigemManualModalOpen(false)

      toast.success('Origem manual cadastrada. Ela já está disponível para destinação.')
    } catch (error) {
      toast.error(error?.message || 'Não foi possível cadastrar a origem manual de recurso.')
    }
  }

  function handleSelecionarDestinacaoPendente(item) {
    if (!item) {
      return
    }

    const saldoPendente = Math.max(0, Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0))

    setPagamentoForm((current) => ({
      ...current,
      destinacaoId: item.id,
      valorPago:
        tipoPagamentoSelecionado === 'total'
          ? Number(saldoPendente.toFixed(2))
          : current.destinacaoId === item.id
            ? current.valorPago
            : 0,
    }))
  }

  function handleIniciarEdicaoDestinacao(item) {
    if (!item) {
      return
    }

    setEditingDestinacaoId(item.id)
    setEditDestinacaoForm({
      entidadeId: String(item.entidadeId || '').trim(),
      solicitacaoData: String(item.solicitacaoData || '').trim(),
      competencia: String(item.competencia || '').trim(),
      processoSolicitacaoEntidade: String(item.processoSolicitacaoEntidade || '').trim(),
      observacao: String(item.observacao || '').trim(),
      valorDestinado: Number(item.valorDestinado || 0),
    })
  }

  function handleCancelarEdicaoDestinacao() {
    setEditingDestinacaoId('')
    setEditDestinacaoForm(createInitialEditDestinacaoForm())
  }

  async function handleSalvarEdicaoDestinacao(event, item) {
    event.preventDefault()
    event.stopPropagation()

    if (!user) {
      toast.error('Autenticação obrigatória para editar destinação.')
      return
    }

    if (!item?.id) {
      toast.error('Destinação inválida para edição.')
      return
    }

    if (!editDestinacaoForm.entidadeId || !editDestinacaoForm.competencia) {
      toast.error('Informe entidade e competência para editar a destinação.')
      return
    }

    const entidade = entidades.find((entry) => entry.id === editDestinacaoForm.entidadeId)
    const valorDestinado = Number(editDestinacaoForm.valorDestinado || 0)

    if (valorDestinado <= 0) {
      toast.error('O valor destinado deve ser maior que zero.')
      return
    }

    try {
      await updateDestinacao(
        item.id,
        {
          entidadeId: editDestinacaoForm.entidadeId,
          entidadeNome: entidade?.nome || '',
          solicitacaoData: editDestinacaoForm.solicitacaoData,
          competencia: toCompetenciaMask(editDestinacaoForm.competencia),
          processoSolicitacaoEntidade: editDestinacaoForm.processoSolicitacaoEntidade,
          observacao: editDestinacaoForm.observacao,
          valorDestinado,
        },
        user.uid,
      )

      handleCancelarEdicaoDestinacao()
      toast.success('Destinação atualizada com sucesso.')
    } catch (error) {
      toast.error(error.message || 'Não foi possível atualizar a destinação.')
    }
  }

  async function handleExcluirDestinacao(item) {
    if (!user) {
      toast.error('Autenticação obrigatória para excluir destinação.')
      return
    }

    if (!item?.id) {
      toast.error('Destinação inválida para exclusão.')
      return
    }

    const valorPagoAcumulado = Number(item.valorPagoAcumulado || 0)
    const qtdPagamentos = Number(item.qtdPagamentos || 0)

    if (valorPagoAcumulado > 0 || qtdPagamentos > 0) {
      toast.error('Destinações com pagamento registrado não podem ser excluídas.')
      return
    }

    const confirmado = window.confirm(
      `Confirma excluir a destinação do processo ${item.processoId || '--'} para ${item.entidadeNome || '--'}?`,
    )

    if (!confirmado) {
      return
    }

    try {
      await deleteDestinacao(item.id, user.uid)

      if (editingDestinacaoId === item.id) {
        handleCancelarEdicaoDestinacao()
      }

      if (pagamentoForm.destinacaoId === item.id) {
        setPagamentoForm((current) => ({ ...current, destinacaoId: '', valorPago: 0 }))
      }

      toast.success('Destinação excluída com sucesso.')
    } catch (error) {
      toast.error(error.message || 'Não foi possível excluir a destinação.')
    }
  }

  function handleMudarTipoPagamento(tipo) {
    setTipoPagamentoSelecionado(tipo)

    if (tipo === 'total' && destinacaoSelecionadaPagamento) {
      const saldoPendente = Math.max(
        0,
        Number(destinacaoSelecionadaPagamento.valorDestinado || 0) -
          Number(destinacaoSelecionadaPagamento.valorPagoAcumulado || 0),
      )

      setPagamentoForm((current) => ({
        ...current,
        valorPago: Number(saldoPendente.toFixed(2)),
      }))
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

    if (!destinacaoSelecionadaPagamento) {
      toast.error('Selecione uma destinação pendente para confirmar pagamento.')
      return
    }

    const saldoPendente = Math.max(
      0,
      Number(destinacaoSelecionadaPagamento.valorDestinado || 0) -
        Number(destinacaoSelecionadaPagamento.valorPagoAcumulado || 0),
    )

    const valorPago =
      tipoPagamentoSelecionado === 'total' ? Number(saldoPendente.toFixed(2)) : Number(pagamentoForm.valorPago || 0)

    if (valorPago <= 0) {
      toast.error('Informe um valor de pagamento maior que zero.')
      return
    }

    if (valorPago > saldoPendente + 0.009) {
      toast.error('O valor pago não pode ser maior que o saldo pendente da destinação.')
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
      setTipoPagamentoSelecionado('parcial')
      setFiltroDestinacaoPendente('')
      setFiltroDestinacaoPaga('')
      toast.success('Pagamento registrado.')
    } catch (error) {
      toast.error(error.message || 'Não foi possível confirmar o pagamento.')
    }
  }

  function handleBaixarPdfDestinacao(destinacaoItem) {
    try {
      if (!destinacaoItem) {
        toast.error('Selecione uma destinação válida para baixar o PDF.')
        return
      }

      const entidadeRelacionada = entidades.find(
        (entry) =>
          entry.id === destinacaoItem.entidadeId ||
          String(entry.nome || '').trim() === String(destinacaoItem.entidadeNome || '').trim(),
      )

      const empresaRelacionada = empresas.find(
        (entry) => String(entry.empresa || '').trim() === String(destinacaoItem.empresa || '').trim(),
      )

      const valorDestinado = Number(destinacaoItem.valorDestinado || 0)

      const nomeEmpresa = String(destinacaoItem.empresa || 'Operador lotérico não informado').trim()
      const cnpjEmpresa = String(empresaRelacionada?.cnpj || '').trim() || 'Não informado'
      const nomeEntidade = String(destinacaoItem.entidadeNome || '').trim() || 'Não informado'
      const cnpjEntidade = String(entidadeRelacionada?.cnpj || '').trim() || 'Não informado'
      
      const formaPagamentoEntidade = String(entidadeRelacionada?.formaPagamento || '').trim()
      const bancoEntidade = String(entidadeRelacionada?.banco || '').trim()
      const agenciaEntidade = String(entidadeRelacionada?.agencia || '').trim()
      const contaEntidade = String(entidadeRelacionada?.conta || '').trim()
      const chavePixEntidade = String(entidadeRelacionada?.chavePix || '').trim()
      const dadosBancariosEntidade = String(entidadeRelacionada?.dadosBancarios || '').trim()

      let recebimentoStr = 'Não informado'
      if (formaPagamentoEntidade === 'PIX') recebimentoStr = `PIX - Chave: ${chavePixEntidade}`
      else if (formaPagamentoEntidade === 'Conta Bancária') recebimentoStr = `Conta Bancária - Banco: ${bancoEntidade}, Agência: ${agenciaEntidade}, Conta: ${contaEntidade}`
      else if (formaPagamentoEntidade === 'Boleto') recebimentoStr = `Boleto`
      else if (formaPagamentoEntidade === 'Outro') recebimentoStr = `Outro - ${dadosBancariosEntidade}`
      else if (chavePixEntidade) recebimentoStr = `PIX - Chave: ${chavePixEntidade}`
      else if (dadosBancariosEntidade) recebimentoStr = `Dados bancários: ${dadosBancariosEntidade}`

      const contatoEntidade = String(entidadeRelacionada?.contato || '').trim() || 'Não informado'
      const responsavelEntidade = String(entidadeRelacionada?.responsavel || '').trim() || 'Não informado'
      const municipioEntidade = String(entidadeRelacionada?.municipio || '').trim() || 'Nao informado'
      const estadoEntidade = String(entidadeRelacionada?.estado || '').trim() || 'Nao informado'

      const competenciaDocumento = String(destinacaoItem.competencia || '').trim() || '--/----'
      const solicitacaoDataDocumento = formatDateBR(destinacaoItem.solicitacaoData)
      const dataEmissaoDocumento = formatDateBR(new Date().toISOString())
      const usuarioResponsavelDocumento =
        userProfile?.nome || user?.displayName || user?.email || 'Usuário responsável'
      const observacaoDocumento = String(destinacaoItem.observacao || '').trim()

      const pdf = generateDestinacaoPdf({
        nomeEmpresa,
        cnpjEmpresa,
        nomeEntidade,
        cnpjEntidade,
        municipioEntidade,
        estadoEntidade,
        responsavelEntidade,
        contatoEntidade,
        recebimentoStr,
        processos: [{
          processoId: destinacaoItem.processoId,
          produto: destinacaoItem.produto,
          termo: destinacaoItem.termo,
          valorDestinado: valorDestinado
        }],
        valorTotalDestinado: valorDestinado,
        competenciaDocumento,
        solicitacaoDataDocumento,
        dataEmissaoDocumento,
        usuarioResponsavelDocumento,
        observacaoDocumento
      })

      const empresaSlug = slugifyFileName(nomeEmpresa) || 'operador-loterico'
      const competenciaSlug = slugifyFileName(competenciaDocumento.replace('/', '-')) || 'sem-competencia'
      const processoSlug = slugifyFileName(String(destinacaoItem.processoId || 'processo')) || 'processo'

      pdf.save(`encaminhamento-destinacao-${empresaSlug}-${competenciaSlug}-${processoSlug}.pdf`)
      toast.success('PDF de destinação baixado novamente.')
    } catch (e) {
      console.error(e)
      toast.error('Não foi possível gerar o PDF da destinação.')
    }
  }

  async function handleSalvarEmpresa(event) {
    event.preventDefault()

    if (!user) {
      toast.error('Autenticação obrigatória para cadastrar operador lotérico.')
      return
    }

    const cnpjLimpo = sanitizeCNPJ(empresaForm.cnpj)
    const razaoSocialNormalizada = String(empresaForm.razaoSocial || '').trim().toLowerCase()

    if (!empresaForm.razaoSocial.trim() || cnpjLimpo.length !== 14) {
      toast.error('Informe razão social e CNPJ válido.')
      return
    }

    const empresaDuplicada = empresasCadastroOptions.some((entry) => {
      if (entry.id === editingEmpresaId) {
        return false
      }

      const cnpjEntry = sanitizeCNPJ(entry.cnpj)
      const razaoEntry = String(entry.razaoSocial || '').trim().toLowerCase()

      return cnpjEntry === cnpjLimpo || razaoEntry === razaoSocialNormalizada
    })

    if (empresaDuplicada) {
      toast.error('Já existe empresa cadastrada com o mesmo CNPJ ou razão social.')
      return
    }

    try {
      const timestamp = new Date().toISOString()

      if (editingEmpresaId) {
        await updateEmpresa(editingEmpresaId, {
          razaoSocial: empresaForm.razaoSocial.trim(),
          cnpj: maskCNPJ(cnpjLimpo),
          updatedAt: timestamp,
          updatedBy: user.uid,
        })
      } else {
        await createEmpresa({
          razaoSocial: empresaForm.razaoSocial.trim(),
          cnpj: maskCNPJ(cnpjLimpo),
          createdAt: timestamp,
          updatedAt: timestamp,
          createdBy: user.uid,
          updatedBy: user.uid,
        })
      }

      setEmpresaForm({ razaoSocial: '', cnpj: '' })
      setEditingEmpresaId('')
      setIsEmpresaFormVisible(false)
      toast.success(editingEmpresaId ? 'Operador lotérico atualizado.' : 'Operador lotérico cadastrado.')
    } catch {
      toast.error(editingEmpresaId ? 'Não foi possível atualizar operador lotérico.' : 'Não foi possível cadastrar operador lotérico.')
    }
  }

  function handleEditarEmpresa(entry) {
    setEditingEmpresaId(String(entry?.id || '').trim())
    setEmpresaForm({
      razaoSocial: String(entry?.razaoSocial || ''),
      cnpj: maskCNPJ(entry?.cnpj || ''),
    })
    setIsEmpresaFormVisible(true)
  }

  function handleCancelarEdicaoEmpresa() {
    setEditingEmpresaId('')
    setEmpresaForm({ razaoSocial: '', cnpj: '' })
    setIsEmpresaFormVisible(false)
  }

  async function handleExcluirEmpresa(entry) {
    if (!user) {
      toast.error('Autenticação obrigatória para excluir operador lotérico.')
      return
    }

    const empresaId = String(entry?.id || '').trim()

    if (!empresaId) {
      toast.error('Operador lotérico inválido para exclusão.')
      return
    }

    if (!entry.canDelete) {
      toast.error('Não é possível excluir. Há lançamentos atrelados a este operador lotérico.')
      return
    }

    const confirmado = window.confirm(
      `Confirma excluir o operador lotérico ${entry.razaoSocial || '--'}?`,
    )

    if (!confirmado) {
      return
    }

    try {
      await deleteEmpresa(empresaId)

      if (editingEmpresaId === empresaId) {
        handleCancelarEdicaoEmpresa()
      }

      toast.success('Operador lotérico excluído com sucesso.')
    } catch {
      toast.error('Não foi possível excluir operador lotérico.')
    }
  }

  async function handleSalvarEntidade(event, options = {}) {
    event.preventDefault()

    const { closeModalOnSuccess = false, selectOnDestinacao = false } = options
    const timestamp = new Date().toISOString()

    if (!user) {
      toast.error('Autenticação obrigatória para cadastrar entidade.')
      return
    }

    const normalizedEntidadeNome = entidadeForm.nome.trim().toLowerCase()
    const cnpjLimpo = sanitizeCNPJ(entidadeForm.cnpj)
    const formaPagamento = entidadeForm.formaPagamento
    const chavePix = entidadeForm.chavePix.trim()
    const dadosBancarios = entidadeForm.dadosBancarios.trim()
    const banco = String(entidadeForm.banco || '').trim()
    const agencia = String(entidadeForm.agencia || '').trim()
    const conta = String(entidadeForm.conta || '').trim()
    const estado = String(entidadeForm.estado || '').trim().toUpperCase()
    const municipio = String(entidadeForm.municipio || '').trim()

    if (!normalizedEntidadeNome || !entidadeForm.categoria) {
      toast.error('Informe nome e categoria da entidade.')
      return
    }

    if (cnpjLimpo.length !== 14) {
      toast.error('Informe um CNPJ valido para a entidade.')
      return
    }

    if (!estado || !municipio) {
      toast.error('Informe o estado e municipio da entidade.')
      return
    }

    if (formaPagamento === 'PIX' && !chavePix) {
      toast.error('Informe a chave Pix.')
      return
    }

    if (formaPagamento === 'Conta Bancária' && (!banco || !agencia || !conta)) {
      toast.error('Informe banco, agência e conta bancária.')
      return
    }

    if (formaPagamento === 'Outro' && !dadosBancarios) {
      toast.error('Informe os detalhes bancários em "Outro".')
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
        estado,
        municipio,
        contato: entidadeForm.contato.trim(),
        responsavel: entidadeForm.responsavel.trim(),
        formaPagamento,
        chavePix: formaPagamento === 'PIX' ? chavePix : '',
        dadosBancarios: formaPagamento === 'Outro' || !['PIX', 'Conta Bancária', 'Boleto'].includes(formaPagamento) ? dadosBancarios : '',
        banco: formaPagamento === 'Conta Bancária' ? banco : '',
        agencia: formaPagamento === 'Conta Bancária' ? agencia : '',
        conta: formaPagamento === 'Conta Bancária' ? conta : '',
        descricaoCategoria: categoriaDescriptions[entidadeForm.categoria] || '',
        updatedAt: timestamp,
        updatedBy: user.uid,
      }

      let createdEntidade = null

      if (editingEntidadeId) {
        const entidadeAtual = entidades.find((entry) => entry.id === editingEntidadeId)
        const updatePayload = { ...basePayload }

        if (!String(entidadeAtual?.createdBy || '').trim()) {
          updatePayload.createdBy = user.uid
        }

        if (!String(entidadeAtual?.createdAt || '').trim()) {
          updatePayload.createdAt = timestamp
        }

        await updateEntidade(editingEntidadeId, updatePayload)
      } else {
        createdEntidade = await createEntidade({
          ...basePayload,
          createdAt: timestamp,
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
      estado: String(entry?.estado || '').trim().toUpperCase(),
      municipio: String(entry?.municipio || ''),
      contato: String(entry?.contato || ''),
      responsavel: String(entry?.responsavel || ''),
      formaPagamento: String(entry?.formaPagamento || (entry?.chavePix ? 'PIX' : (entry?.banco || entry?.agencia ? 'Conta Bancária' : (entry?.dadosBancarios ? 'Outro' : 'PIX')))),
      chavePix: String(entry?.chavePix || ''),
      dadosBancarios: String(entry?.dadosBancarios || ''),
      banco: String(entry?.banco || ''),
      agencia: String(entry?.agencia || ''),
      conta: String(entry?.conta || ''),
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
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-700">Acesso protegido</p>
            <h1 className="headline mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
              Entrar no sistema de fomentos
            </h1>
            <p className="mt-3 text-sm text-zinc-600">
              Apenas usuários autenticados podem escrever em destinações, entidades e operadores lotéricos.
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
                  className={activeMenu === 'destinacoes' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => setActiveMenu('destinacoes')}
                >
                  Destinações
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
                <button
                  type="button"
                  className={activeMenu === 'calculadora' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => setActiveMenu('calculadora')}
                >
                  Calculadora UFR-PB
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
                  Use o menu para alternar entre Destinações, Cadastros, Relatórios e Configurações do Sistema.
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
                     <p>Total destinado</p>
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

          {activeMenu === 'destinacoes' && (
            <article className="panel panel-soft sm:p-6">
              <nav className="rounded-2xl border border-slate-200/70 bg-white/70 p-2" aria-label="Navegação de destinações">
                <div className="flex flex-wrap gap-2">
                  {destinationTabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={activeTab === tab.id ? 'tab tab-active' : 'tab'}
                    >
                      {tab.label}
                    </button>
                  ))}
                                {/* Botão de sincronizar - fica à direita */}
    {isAdmin && (
      <button
        type="button"
        onClick={handleSyncCsv}
        disabled={isSyncing}
        className="flex items-center gap-2 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-700 transition hover:bg-cyan-100 disabled:opacity-50"
      >
        {isSyncing ? (
          <>
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Sincronizando...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sincronizar
          </>
        )}
      </button>
    )}
  </div>
              </nav>

              {activeTab === 'destinacao' && (
  <section className="mt-5 space-y-5 animate-in">
    <h2 className="text-lg font-semibold text-zinc-900">Formulário de destinação</h2>

    {isAdmin && (
      <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-cyan-900">Origem manual de recurso</p>
            <p className="text-xs text-cyan-800">
              Cadastre fomentos fora do CSV e siga no fluxo normal de destinações.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsOrigemManualModalOpen(true)}
          >
            Cadastrar Fomento
          </button>
        </div>
      </div>
    )}

    <div>
      <label className="field-label" htmlFor="empresaSelecionada">
        Operador lotérico
      </label>
      <select
        id="empresaSelecionada"
        className="field-input"
        value={empresaSelecionada}
        onChange={(event) => {
          setEmpresaSelecionada(event.target.value)
          setSelectedProcessIds([])
          setSelectedProcessValues({})
          setValorAlvoDestinacao(0)
        }}
      >
        <option value="">Selecione</option>
        {empresasDestinacaoOptions.map((empresa) => (
          <option key={empresa.key} value={empresa.key}>
            {empresa.label}
          </option>
        ))}
      </select>
    </div>

    <div>
      <label className="field-label" htmlFor="valorAlvoDestinacao">
        Valor total a destinar (opcional)
      </label>
      <NumericFormat
        id="valorAlvoDestinacao"
        className="field-input"
        thousandSeparator="."
        decimalSeparator=","
        prefix="R$ "
        decimalScale={2}
        fixedDecimalScale
        allowNegative={false}
        inputMode="decimal"
        onFocus={handleMoneyInputFocus}
        value={valorAlvoDestinacao}
        onValueChange={(values) => setValorAlvoDestinacao(Number(values.floatValue || 0))}
        placeholder="Informe o valor limite da destinação"
      />
      <p className="mt-1 text-xs text-zinc-500">
        Quando preenchido, os processos selecionados respeitam esse total e o último processo fica parcial se necessário.
      </p>
    </div>

    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800">Processos para destinação</p>
        {processosEmpresaFiltrados.length > 0 && (
          <button
            type="button"
            className="text-sm font-semibold text-cyan-700 hover:underline"
            onClick={() => {
              const valorAlvo = Number(valorAlvoDestinacao || 0)
              const idsAtuais = [...selectedProcessIds]
              const valoresAtuais = { ...selectedProcessValues }
              let restante = valorAlvo > 0
                ? Number(
                    Math.max(
                      0,
                      valorAlvo - idsAtuais.reduce((acc, id) => {
                        const processoAtual = processosEmpresaById[id]
                        if (!processoAtual) return acc
                        const saldoAtual = Number(processoAtual.saldoDisponivel || 0)
                        const valorAtual = Number(valoresAtuais[id] || 0)
                        return acc + Math.max(0, Math.min(valorAtual, saldoAtual))
                      }, 0)
                    ).toFixed(2)
                  )
                : 0

              const novosIds = []
              const novosValores = {}

              processosEmpresaFiltrados.forEach((item) => {
                const processoId = String(item.processoId || '')
                if (!processoId || idsAtuais.includes(processoId)) return
                const saldoDisponivel = Number(item.saldoDisponivel || 0)
                const valorInicial = valorAlvo > 0 ? Math.min(saldoDisponivel, restante) : Number(saldoDisponivel.toFixed(2))
                if (valorInicial <= 0) return
                novosIds.push(processoId)
                novosValores[processoId] = Number(valorInicial.toFixed(2))
                if (valorAlvo > 0) restante = Number(Math.max(0, restante - valorInicial).toFixed(2))
              })

              if (!novosIds.length) {
                if (valorAlvo > 0) toast.error('Não há saldo disponível para marcar novos processos dentro do valor informado.')
                return
              }

              setSelectedProcessIds([...idsAtuais, ...novosIds])
              setSelectedProcessValues({ ...valoresAtuais, ...novosValores })
            }}
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
        <div className="grid max-h-[21rem] gap-3 overflow-auto sm:grid-cols-2">
          {processosEmpresaFiltrados.map((item) => {
            const checked = selectedProcessIds.includes(item.processoId)
            return (
              <article
                key={item.processoId}
                role="button"
                tabIndex={0}
                onClick={() => handleToggleProcessoDestinacao(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleToggleProcessoDestinacao(item)
                  }
                }}
                className={checked
                  ? 'cursor-pointer rounded-xl border border-cyan-300 bg-cyan-50/40 p-3 transition'
                  : 'cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-cyan-200 hover:bg-cyan-50/20'
                }
              >
                <div className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-semibold text-zinc-900">{item.processoId}</p>
                    <p className="text-zinc-500">{item.termo || 'Sem termo'}</p>
                  </div>
                  {checked && (
                    <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800">
                      Selecionado
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  Valor Premio: {formatCurrency(item.valorPremio || 0)} | Incentivo: {formatCurrency(item.incentivo || 0)}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Base de calculo: {formatCurrency(getBaseCalculoFomentoFromProcess(item))}
                </p>
                <p className="mt-1 text-sm text-emerald-700">
                  Saldo disponível: {formatCurrency(item.saldoDisponivel)}
                </p>
                {(() => {
                  const valorMin = Number(item?.valorFomentoMinimo || 0)
                  const valorUsado = Number(item?.valorFomento || 0)
                  const isUfrProcess = valorMin > 0 && Math.abs(valorUsado - valorMin) < 0.01

                  if (!isUfrProcess) return null

                  const baseDate = item.ufrBaseDate || item.dataAutorizacao || item.periodoExploracaoStart || ''
                  const competenciaValida = (value) => /^(0[1-9]|1[0-2])\/\d{4}$/.test(String(value || ''))
                  const competencia = competenciaValida(item.ufrPbCompetencia)
                    ? item.ufrPbCompetencia
                    : (competenciaFromDate(baseDate) || '--')

                  return (
                    <div className="mt-2 text-xs text-zinc-600">
                      <p>
                        Data da autorização: <span className="font-medium">{formatDateBR(baseDate)}</span>
                      </p>
                      <p>
                        Competência da UFR: <span className="font-medium">{competencia}</span>
                      </p>
                      <p>
                        Valor da UFR: <span className="font-medium">{formatCurrency(item.ufrPbUnitValue || 0)}</span>
                      </p>
                    </div>
                  )
                })()}
                {checked && (
                  <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                    <label className="mb-1 block text-sm font-medium text-zinc-600">
                      Valor destinado para este processo
                    </label>
                    <NumericFormat
                      className="field-input"
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      inputMode="decimal"
                      onFocus={handleMoneyInputFocus}
                      value={selectedProcessValues[item.processoId] || 0}
                      onValueChange={(values) => {
                        const value = Math.max(0, Math.min(Number(values.floatValue || 0), Number(item.saldoDisponivel || 0)))
                        setSelectedProcessValues((current) => ({
                          ...current,
                          [item.processoId]: Number(value.toFixed(2))
                        }))
                      }}
                    />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>

    {/* FORMULÁRIO PRINCIPAL DE DESTINAÇÃO */}
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleAbrirConfirmacaoDestinacao}>
      {/* Data de solicitação */}
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

      {/* SELEÇÃO DA ENTIDADE (SEMPRE) - AGORA AO LADO DA DATA */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="field-label mb-0" htmlFor="entidadeBuscaDestinacao">
            Entidade beneficiária
          </label>
          <button
            type="button"
            className="text-sm font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline"
            onClick={() => {
              setEditingEntidadeId('')
              setEntidadeForm(createInitialEntidadeForm())
              setIsEntidadeModalOpen(true)
            }}
          >
            Nova entidade
          </button>
        </div>
        
        <div className="relative">
          <input
            id="entidadeBuscaDestinacao"
            className="field-input"
            value={entidadeSearchDestinacao}
            onFocus={() => setIsEntidadeSearchOpen(true)}
            onBlur={() => {
              setTimeout(() => setIsEntidadeSearchOpen(false), 120)
            }}
            onChange={(event) => {
              const nextValue = event.target.value
              setEntidadeSearchDestinacao(nextValue)
              setIsEntidadeSearchOpen(true)
              setDestForm((current) => ({ ...current, entidadeId: '' }))
            }}
            placeholder="Digite para buscar por nome, CNPJ ou categoria"
            autoComplete="off"
          />

          {isEntidadeSearchOpen && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {entidadesDestinacaoFiltradas.length === 0 && (
                <p className="px-3 py-2 text-sm text-zinc-500">Nenhuma entidade encontrada.</p>
              )}
              {entidadesDestinacaoFiltradas.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-slate-100"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setDestForm((current) => ({ ...current, entidadeId: entry.id }))
                    setEntidadeSearchDestinacao(String(entry.nome || ''))
                    setIsEntidadeSearchOpen(false)
                  }}
                >
                  <span className="block font-medium text-zinc-900">{entry.nome}</span>
                  <span className="block text-xs text-zinc-500">
                    {entry.cnpj || 'CNPJ não informado'} | {entry.categoria || 'Sem categoria'} |{' '}
                    {entry.municipio || 'Municipio nao informado'} - {entry.estado || '--'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          id="entidadeId"
          className="field-input"
          value={destForm.entidadeId}
          onChange={(event) =>
            setDestForm((current) => ({ ...current, entidadeId: event.target.value }))
          }
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        >
          <option value="">Selecione</option>
          {entidades.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.nome}
            </option>
          ))}
        </select>

        <p className="mt-1 text-xs text-zinc-500">
          {destForm.entidadeId ? (entidades.find(e => e.id === destForm.entidadeId)?.nome || 'Entidade selecionada') : 'Nenhuma entidade selecionada'}
        </p>
      </div>

      {/* DESTINO DO RECURSO (para onde vai o dinheiro) - OCUPA A LINHA INTEIRA */}
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="tipoDestino">
          Destino do recurso financeiro
        </label>
        <select
          id="tipoDestino"
          className="field-input"
          value={destForm.tipoDestino}
          onChange={(event) =>
            setDestForm((current) => ({ ...current, tipoDestino: event.target.value }))
          }
        >
          <option value="entidade">Para a entidade selecionada acima</option>
          <option value="empresa">Para empresa prestadora de serviço (terceirizada)</option>
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Selecione se o recurso será pago diretamente à entidade ou a uma empresa que prestará o serviço
        </p>
      </div>

      {/* BLOCO PARA DESTINO À EMPRESA (quando não é para entidade) */}
      {destForm.tipoDestino === 'empresa' && (
        <div className="sm:col-span-2 space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/30 p-4">
          <p className="text-sm font-semibold text-cyan-900">Dados da empresa prestadora de serviço</p>
          
          <div>
            <label className="field-label" htmlFor="empresaCnpj">
              CNPJ da empresa prestadora
            </label>
            <input
              id="empresaCnpj"
              className="field-input"
              value={destForm.empresaCnpj}
              onChange={(event) =>
                setDestForm((current) => ({ ...current, empresaCnpj: maskCNPJ(event.target.value) }))
              }
              onBlur={async (event) => {
                const cnpjLimpo = sanitizeCNPJ(event.target.value)
                if (cnpjLimpo.length === 14) {
                  try {
                    const cnpjData = await fetchEntidadeByCnpj(cnpjLimpo)
                    setDestForm((current) => ({ 
                      ...current, 
                      empresaRazaoSocial: cnpjData.razaoSocial || cnpjData.nome || ''
                    }))
                    toast.success('Dados da empresa carregados com sucesso!')
                  } catch (error) {
                    console.error('Erro ao buscar dados do CNPJ:', error)
                    toast.error('Não foi possível carregar os dados da empresa. Digite manualmente.')
                  }
                }
              }}
              placeholder="00.000.000/0000-00"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Digite o CNPJ para carregar automaticamente a razão social
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="empresaRazaoSocial">
              Razão Social
            </label>
            <input
              id="empresaRazaoSocial"
              className="field-input"
              value={destForm.empresaRazaoSocial}
              onChange={(event) =>
                setDestForm((current) => ({ ...current, empresaRazaoSocial: event.target.value }))
              }
              placeholder="Razão social da empresa prestadora de serviço"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="empresaFormaPagamento">
              Forma de pagamento para a empresa
            </label>
            <select
              id="empresaFormaPagamento"
              className="field-input"
              value={destForm.empresaFormaPagamento}
              onChange={(event) =>
                setDestForm((current) => ({ ...current, empresaFormaPagamento: event.target.value }))
              }
            >
              <option value="PIX">PIX</option>
              <option value="Conta Bancária">Conta Bancária</option>
              <option value="Boleto">Boleto</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          {destForm.empresaFormaPagamento === 'PIX' && (
            <div>
              <label className="field-label" htmlFor="empresaChavePix">
                Chave Pix
              </label>
              <input
                id="empresaChavePix"
                className="field-input"
                value={destForm.empresaChavePix}
                onChange={(event) =>
                  setDestForm((current) => ({ ...current, empresaChavePix: event.target.value }))
                }
                placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
              />
            </div>
          )}

          {destForm.empresaFormaPagamento === 'Conta Bancária' && (
            <>
              <div>
                <label className="field-label" htmlFor="empresaBanco">
                  Banco
                </label>
                <input
                  id="empresaBanco"
                  className="field-input"
                  value={destForm.empresaBanco}
                  onChange={(event) =>
                    setDestForm((current) => ({ ...current, empresaBanco: event.target.value }))
                  }
                  placeholder="Nome ou código do banco"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="empresaAgencia">
                  Agência
                </label>
                <input
                  id="empresaAgencia"
                  className="field-input"
                  value={destForm.empresaAgencia}
                  onChange={(event) =>
                    setDestForm((current) => ({ ...current, empresaAgencia: event.target.value }))
                  }
                  placeholder="Ex: 0001"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="empresaConta">
                  Conta com dígito
                </label>
                <input
                  id="empresaConta"
                  className="field-input"
                  value={destForm.empresaConta}
                  onChange={(event) =>
                    setDestForm((current) => ({ ...current, empresaConta: event.target.value }))
                  }
                  placeholder="Ex: 12345-6"
                />
              </div>
            </>
          )}

          {destForm.empresaFormaPagamento === 'Outro' && (
            <div>
              <label className="field-label" htmlFor="empresaDadosBancarios">
                Detalhes do pagamento
              </label>
              <textarea
                id="empresaDadosBancarios"
                className="field-input min-h-24"
                value={destForm.empresaDadosBancarios}
                onChange={(event) =>
                  setDestForm((current) => ({ ...current, empresaDadosBancarios: event.target.value }))
                }
                placeholder="Forneça os detalhes adicionais"
              />
            </div>
          )}
        </div>
      )}

      {/* Competência */}
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

      {/* Nº do processo de solicitação */}
      <div>
        <label className="field-label" htmlFor="processoSolicitacaoEntidade">
          Nº do processo de solicitação
        </label>
        <input
          id="processoSolicitacaoEntidade"
          className="field-input"
          value={destForm.processoSolicitacaoEntidade}
          onChange={(event) =>
            setDestForm((current) => ({
              ...current,
              processoSolicitacaoEntidade: event.target.value,
            }))
          }
          placeholder="Ex.: LTP-PRC-2026/12345"
        />
      </div>

      {/* Observação */}
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="observacaoDestinacao">
          Observação (opcional)
        </label>
        <textarea
          id="observacaoDestinacao"
          className="field-input min-h-[88px]"
          value={destForm.observacao}
          onChange={(event) =>
            setDestForm((current) => ({
              ...current,
              observacao: event.target.value,
            }))
          }
          placeholder="Ex.: orientação adicional para encaminhamento ao operador lotérico ou objeto onde o recurso deve ser aplicado"
        />
      </div>

      {/* Resumo */}
      <div className="sm:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-cyan-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-zinc-500">Operador lotérico selecionado</p>
          <p className="font-medium text-zinc-900">{empresaSelecionadaInfo?.empresa || '--'}</p>
          <p className="text-xs text-zinc-500">CNPJ: {empresaSelecionadaInfo?.cnpj || '--'}</p>
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
        <div>
          <p className="text-zinc-500">Valor informado</p>
          <p className="font-medium text-zinc-900">{formatCurrency(valorAlvoDestinacao || 0)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Saldo para completar</p>
          <p className="font-semibold text-amber-700">
            {formatCurrency(Math.max(0, Number((valorAlvoDestinacao || 0) - totalSelecionadoParaDestinar)))}
          </p>
        </div>
      </div>

      {/* Botão Salvar */}
      <div className="sm:col-span-2">
        <button className="btn-primary w-full" type="submit" disabled={isSavingDestinacao}>
          {isSavingDestinacao ? 'Salvando...' : 'Salvar destinação'}
        </button>
      </div>
    </form>

    <ConfirmacaoAcaoModal
      isOpen={isConfirmacaoModalOpen}
      onClose={() => setIsConfirmacaoModalOpen(false)}
      onEscolha={handleEscolhaAcaoDestinacao}
      loading={isSavingDestinacao}
    />
  </section>
)}

              {activeTab === 'pagamento' && (
                <section className="mt-5 space-y-4 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Confirmação de pagamento</h2>
                  <p className="text-sm text-zinc-600">A lista exibe destinações em aberto (pendente ou parcial).</p>

                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
                    <label className="field-label" htmlFor="filtroDestinacaoPendente">
                      Buscar destinações pendentes
                    </label>
                    <input
                      id="filtroDestinacaoPendente"
                      className="field-input"
                      value={filtroDestinacaoPendente}
                      onChange={(event) => setFiltroDestinacaoPendente(event.target.value)}
                      placeholder="Digite operador lotérico, entidade ou nº do processo"
                    />
                    <p className="mt-2 text-xs text-zinc-500">
                      Clique em um card para preencher os dados de pagamento (parcial ou total).
                    </p>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {pendentesFiltradosPagamento.length === 0 && (
                      <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-zinc-500 sm:col-span-2 xl:col-span-3">
                        Sem pagamentos pendentes.
                      </article>
                    )}

                    {pendentesFiltradosPagamento.map((item) => {
                      const saldoPendente = Math.max(
                        0,
                        Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0),
                      )
                      const hasPagamentoRegistrado =
                        Number(item.valorPagoAcumulado || 0) > 0 || Number(item.qtdPagamentos || 0) > 0
                      const isSelecionada = pagamentoForm.destinacaoId === item.id

                      return (
                        <article
                          key={item.id}
                          className={
                            isSelecionada
                              ? 'cursor-pointer rounded-2xl border border-cyan-300 bg-cyan-50/40 p-4 shadow-sm transition'
                              : 'cursor-pointer rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/20'
                          }
                          role="button"
                          tabIndex={0}
                          onClick={() => handleSelecionarDestinacaoPendente(item)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              handleSelecionarDestinacaoPendente(item)
                            }
                          }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Processo</p>
                              <p className="text-base font-semibold text-zinc-900">{item.processoId || '--'}</p>
                              <p className="mt-1 text-xs text-zinc-600">{item.empresa || 'Operador lotérico não informado'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1">
                              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                Em aberto
                              </span>
                              {isSelecionada && (
                                <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-semibold text-cyan-800">
                                  Selecionada
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="mt-3 space-y-2 text-sm text-zinc-700">
                            <p>
                              <span className="font-semibold text-zinc-900">Entidade:</span> {item.entidadeNome || '--'}
                            </p>
                            <p>
                              <span className="font-semibold text-zinc-900">Destinado:</span>{' '}
                              {formatCurrency(item.valorDestinado)}
                            </p>
                            <p>
                              <span className="font-semibold text-zinc-900">Pago:</span>{' '}
                              {formatCurrency(item.valorPagoAcumulado || 0)}
                            </p>
                            <p>
                              <span className="font-semibold text-zinc-900">Saldo:</span> {formatCurrency(saldoPendente)}
                            </p>
                            <p>
                              <span className="font-semibold text-zinc-900">Solicitação:</span>{' '}
                              {formatDateBR(item.solicitacaoData)}
                            </p>
                          </div>

                          <div className="mt-4 flex items-center justify-end">
                            <div className="flex w-full flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleIniciarEdicaoDestinacao(item)
                                }}
                              >
                                Editar
                              </button>
                              {!hasPagamentoRegistrado && (
                                <button
                                  type="button"
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 transition hover:bg-rose-100"
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    handleExcluirDestinacao(item)
                                  }}
                                >
                                  Excluir
                                </button>
                              )}
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                                onClick={(event) => {
                                  event.stopPropagation()
                                  handleBaixarPdfDestinacao(item)
                                }}
                              >
                                Baixar PDF
                              </button>
                            </div>
                          </div>

                          {editingDestinacaoId === item.id && (
                            <form
                              className="mt-4 grid gap-3 rounded-xl border border-cyan-200 bg-white p-3 sm:grid-cols-2"
                              onClick={(event) => event.stopPropagation()}
                              onSubmit={(event) => handleSalvarEdicaoDestinacao(event, item)}
                            >
                              <div>
                                <label className="field-label" htmlFor={`edit-entidade-${item.id}`}>
                                  Entidade
                                </label>
                                <select
                                  id={`edit-entidade-${item.id}`}
                                  className="field-input"
                                  value={editDestinacaoForm.entidadeId}
                                  onChange={(event) =>
                                    setEditDestinacaoForm((current) => ({
                                      ...current,
                                      entidadeId: event.target.value,
                                    }))
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
                                <label className="field-label" htmlFor={`edit-solicitacaoData-${item.id}`}>
                                  Data de solicitação
                                </label>
                                <input
                                  id={`edit-solicitacaoData-${item.id}`}
                                  className="field-input"
                                  type="date"
                                  value={editDestinacaoForm.solicitacaoData || ''}
                                  onChange={(event) =>
                                    setEditDestinacaoForm((current) => ({
                                      ...current,
                                      solicitacaoData: event.target.value,
                                      competencia: competenciaFromDate(event.target.value),
                                    }))
                                  }
                                  disabled={item.statusPagamento !== 'pendente'}
                                />
                                {item.statusPagamento !== 'pendente' && (
                                  <p className="mt-1 text-xs text-zinc-500">
                                    Só é possível editar a data de solicitação enquanto a destinação estiver pendente.
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="field-label" htmlFor={`edit-competencia-${item.id}`}>
                                  Competência
                                </label>
                                <input
                                  id={`edit-competencia-${item.id}`}
                                  className="field-input"
                                  value={editDestinacaoForm.competencia}
                                  onChange={(event) =>
                                    setEditDestinacaoForm((current) => ({
                                      ...current,
                                      competencia: toCompetenciaMask(event.target.value),
                                    }))
                                  }
                                  placeholder="04/2026"
                                />
                              </div>

                              <div>
                                <label className="field-label" htmlFor={`edit-valor-${item.id}`}>
                                  Valor destinado
                                </label>
                                <NumericFormat
                                  id={`edit-valor-${item.id}`}
                                  className="field-input"
                                  thousandSeparator="."
                                  decimalSeparator="," 
                                  prefix="R$ "
                                  decimalScale={2}
                                  fixedDecimalScale
                                  allowNegative={false}
                                  inputMode="decimal"
                                  onFocus={handleMoneyInputFocus}
                                  disabled={hasPagamentoRegistrado}
                                  value={editDestinacaoForm.valorDestinado}
                                  onValueChange={(values) =>
                                    setEditDestinacaoForm((current) => ({
                                      ...current,
                                      valorDestinado: Number(values.floatValue || 0),
                                    }))
                                  }
                                />
                                {hasPagamentoRegistrado && (
                                  <p className="mt-1 text-xs text-zinc-500">
                                    Valor bloqueado porque já existe pagamento registrado para esta destinação.
                                  </p>
                                )}
                              </div>

                              <div>
                                <label className="field-label" htmlFor={`edit-processo-solicitacao-${item.id}`}>
                                  Nº processo de solicitação
                                </label>
                                <input
                                  id={`edit-processo-solicitacao-${item.id}`}
                                  className="field-input"
                                  value={editDestinacaoForm.processoSolicitacaoEntidade}
                                  onChange={(event) =>
                                    setEditDestinacaoForm((current) => ({
                                      ...current,
                                      processoSolicitacaoEntidade: event.target.value,
                                    }))
                                  }
                                  placeholder="Ex.: LTP-PRC-2026/12345"
                                />
                              </div>

                              <div className="sm:col-span-2">
                                <label className="field-label" htmlFor={`edit-observacao-${item.id}`}>
                                  Observação
                                </label>
                                <textarea
                                  id={`edit-observacao-${item.id}`}
                                  className="field-input min-h-[88px]"
                                  value={editDestinacaoForm.observacao}
                                  onChange={(event) =>
                                    setEditDestinacaoForm((current) => ({
                                      ...current,
                                      observacao: event.target.value,
                                    }))
                                  }
                                />
                              </div>

                              <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                                  onClick={handleCancelarEdicaoDestinacao}
                                >
                                  Cancelar
                                </button>
                                <button className="btn-primary" type="submit">
                                  Salvar edição
                                </button>
                              </div>
                            </form>
                          )}

                          {isSelecionada && (
                            <form
                              className="mt-4 grid gap-3 rounded-xl border border-cyan-200 bg-white p-3 sm:grid-cols-2"
                              onClick={(event) => event.stopPropagation()}
                              onSubmit={handleConfirmarPagamento}
                            >
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

                              <div className="sm:col-span-2">
                                <p className="field-label mb-2">Tipo de pagamento</p>
                                <div className="flex flex-wrap gap-2">
                                  <button
                                    type="button"
                                    className={
                                      tipoPagamentoSelecionado === 'parcial'
                                        ? 'rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-800'
                                        : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-slate-50'
                                    }
                                    onClick={() => handleMudarTipoPagamento('parcial')}
                                  >
                                    Pagamento parcial
                                  </button>
                                  <button
                                    type="button"
                                    className={
                                      tipoPagamentoSelecionado === 'total'
                                        ? 'rounded-lg border border-cyan-300 bg-cyan-50 px-3 py-1.5 text-sm font-semibold text-cyan-800'
                                        : 'rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-slate-50'
                                    }
                                    onClick={() => handleMudarTipoPagamento('total')}
                                  >
                                    Pagamento total (quitar saldo)
                                  </button>
                                </div>
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
                                  inputMode="decimal"
                                  onFocus={handleMoneyInputFocus}
                                  disabled={tipoPagamentoSelecionado === 'total'}
                                  value={
                                    tipoPagamentoSelecionado === 'total'
                                      ? Number(saldoPendente.toFixed(2))
                                      : pagamentoForm.valorPago
                                  }
                                  onValueChange={(values) =>
                                    setPagamentoForm((current) => ({ ...current, valorPago: values.floatValue || 0 }))
                                  }
                                />
                              </div>

                              <div className="flex items-end">
                                <p className="text-sm text-zinc-600">
                                  Saldo atual: <strong className="text-zinc-900">{formatCurrency(saldoPendente)}</strong>
                                </p>
                              </div>

                              <div className="sm:col-span-2">
                                <button className="btn-primary w-full" type="submit">
                                  Confirmar pagamento desta destinação
                                </button>
                              </div>
                            </form>
                          )}
                        </article>
                      )
                    })}
                  </div>
                </section>
              )}

              {activeTab === 'pagas' && (
                <section className="mt-5 space-y-4 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Destinações pagas</h2>
                  <p className="text-sm text-zinc-600">A lista exibe destinações com pagamento quitado.</p>

                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-3 sm:p-4">
                    <label className="field-label" htmlFor="filtroDestinacaoPaga">
                      Buscar destinações pagas
                    </label>
                    <input
                      id="filtroDestinacaoPaga"
                      className="field-input"
                      value={filtroDestinacaoPaga}
                      onChange={(event) => setFiltroDestinacaoPaga(event.target.value)}
                      placeholder="Digite operador lotérico, entidade ou nº do processo"
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {pagasFiltradas.length === 0 && (
                      <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-zinc-500 sm:col-span-2 xl:col-span-3">
                        Nenhuma destinação paga encontrada.
                      </article>
                    )}

                    {pagasFiltradas.map((item) => (
                      <article
                        key={item.id}
                        className="rounded-2xl border border-emerald-200 bg-emerald-50/35 p-4 shadow-sm"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-zinc-500">Processo</p>
                            <p className="text-base font-semibold text-zinc-900">{item.processoId || '--'}</p>
                            <p className="mt-1 text-xs text-zinc-600">{item.empresa || 'Operador lotérico não informado'}</p>
                          </div>
                          <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                            Pago
                          </span>
                        </div>

                        <div className="mt-3 space-y-2 text-sm text-zinc-700">
                          <p>
                            <span className="font-semibold text-zinc-900">Entidade:</span> {item.entidadeNome || '--'}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Destinado:</span>{' '}
                            {formatCurrency(item.valorDestinado || 0)}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Pago:</span>{' '}
                            {formatCurrency(item.valorPagoAcumulado || item.valorDestinado || 0)}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Data de pagamento:</span>{' '}
                            {formatDateBR(item.pgtoData)}
                          </p>
                          <p>
                            <span className="font-semibold text-zinc-900">Forma de pagamento:</span>{' '}
                            {item.formaPgto || '--'}
                          </p>
                        </div>

                        <div className="mt-4 flex items-center justify-end">
                          <div className="flex w-full flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                              onClick={() => handleIniciarEdicaoDestinacao(item)}
                            >
                              Editar
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                              onClick={() => handleBaixarPdfDestinacao(item)}
                            >
                              Baixar PDF
                            </button>
                          </div>
                        </div>

                        {editingDestinacaoId === item.id && (
                          <form
                            className="mt-4 grid gap-3 rounded-xl border border-cyan-200 bg-white p-3 sm:grid-cols-2"
                            onSubmit={(event) => handleSalvarEdicaoDestinacao(event, item)}
                          >
                            <div>
                              <label className="field-label" htmlFor={`edit-paga-entidade-${item.id}`}>
                                Entidade
                              </label>
                              <select
                                id={`edit-paga-entidade-${item.id}`}
                                className="field-input"
                                value={editDestinacaoForm.entidadeId}
                                onChange={(event) =>
                                  setEditDestinacaoForm((current) => ({
                                    ...current,
                                    entidadeId: event.target.value,
                                  }))
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
                              <label className="field-label" htmlFor={`edit-paga-competencia-${item.id}`}>
                                Competência
                              </label>
                              <input
                                id={`edit-paga-competencia-${item.id}`}
                                className="field-input"
                                value={editDestinacaoForm.competencia}
                                onChange={(event) =>
                                  setEditDestinacaoForm((current) => ({
                                    ...current,
                                    competencia: toCompetenciaMask(event.target.value),
                                  }))
                                }
                                placeholder="04/2026"
                              />
                            </div>

                            <div>
                              <label className="field-label" htmlFor={`edit-paga-valor-${item.id}`}>
                                Valor destinado
                              </label>
                              <NumericFormat
                                id={`edit-paga-valor-${item.id}`}
                                className="field-input"
                                thousandSeparator="."
                                decimalSeparator="," 
                                prefix="R$ "
                                decimalScale={2}
                                fixedDecimalScale
                                allowNegative={false}
                                inputMode="decimal"
                                onFocus={handleMoneyInputFocus}
                                disabled
                                value={editDestinacaoForm.valorDestinado}
                                onValueChange={(values) =>
                                  setEditDestinacaoForm((current) => ({
                                    ...current,
                                    valorDestinado: Number(values.floatValue || 0),
                                  }))
                                }
                              />
                              <p className="mt-1 text-xs text-zinc-500">
                                Valor bloqueado porque já existe pagamento registrado para esta destinação.
                              </p>
                            </div>

                            <div>
                              <label className="field-label" htmlFor={`edit-paga-processo-solicitacao-${item.id}`}>
                                Nº processo de solicitação
                              </label>
                              <input
                                id={`edit-paga-processo-solicitacao-${item.id}`}
                                className="field-input"
                                value={editDestinacaoForm.processoSolicitacaoEntidade}
                                onChange={(event) =>
                                  setEditDestinacaoForm((current) => ({
                                    ...current,
                                    processoSolicitacaoEntidade: event.target.value,
                                  }))
                                }
                                placeholder="Ex.: LTP-PRC-2026/12345"
                              />
                            </div>

                            <div className="sm:col-span-2">
                              <label className="field-label" htmlFor={`edit-paga-observacao-${item.id}`}>
                                Observação
                              </label>
                              <textarea
                                id={`edit-paga-observacao-${item.id}`}
                                className="field-input min-h-[88px]"
                                value={editDestinacaoForm.observacao}
                                onChange={(event) =>
                                  setEditDestinacaoForm((current) => ({
                                    ...current,
                                    observacao: event.target.value,
                                  }))
                                }
                              />
                            </div>

                            <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                                onClick={handleCancelarEdicaoDestinacao}
                              >
                                Cancelar
                              </button>
                              <button className="btn-primary" type="submit">
                                Salvar edição
                              </button>
                            </div>
                          </form>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              )}

              {activeTab === 'gerencial' && (
                <section className="mt-5 space-y-4 animate-in">
                  <h2 className="text-lg font-semibold text-zinc-900">Painel gerencial por operador lotérico</h2>
                  <p className="text-sm text-zinc-600">
                    Visão consolidada para acompanhamento de saldo a destinar e saldo a pagar por operador lotérico.
                  </p>

                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="grid gap-3">
                      <div className="space-y-1 min-w-0">
                        <label className="field-label" htmlFor="filtroEmpresaGerencial">
                          Filtro rápido por CNPJ ou nome do operador lotérico
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            id="filtroEmpresaGerencial"
                            className="field-input w-full max-w-full flex-1"
                            value={filtroEmpresaGerencial}
                            onChange={(event) => setFiltroEmpresaGerencial(event.target.value)}
                            placeholder="Ex: 12.345.678/0001-90 ou razão social"
                          />
                          {filtroEmpresaGerencial && (
                            <button
                              type="button"
                              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                              onClick={() => setFiltroEmpresaGerencial('')}
                            >
                              Limpar
                            </button>
                          )}
                        </div>
                      </div>

                      <p className="text-sm text-zinc-500">
                        Exibindo {resumoEmpresasFiltradas.length} de {resumoEmpresas.length} operadores lotéricos
                      </p>

                      {filtroEmpresaGerencial && (
                        <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-zinc-600 break-words">
                          Filtro aplicado: <strong className="text-zinc-800">{filtroEmpresaGerencial}</strong>
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    <article className="card-metric">
                      <p>Operadores lotéricos visíveis</p>
                      <strong>{resumoEmpresasFiltradas.length}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Fomento do filtro</p>
                      <strong title={formatCurrency(resumoFiltroGerencial.totalFomento)}>
                        {formatCurrencyCompact(resumoFiltroGerencial.totalFomento)}
                      </strong>
                    </article>
                    <article className="card-metric">
                      <p>Saldo a destinar (filtro)</p>
                      <strong title={formatCurrency(resumoFiltroGerencial.saldoADestinar)}>
                        {formatCurrencyCompact(resumoFiltroGerencial.saldoADestinar)}
                      </strong>
                    </article>
                    <article className="card-metric">
                      <p>Saldo a pagar (filtro)</p>
                      <strong title={formatCurrency(resumoFiltroGerencial.saldoAPagar)}>
                        {formatCurrencyCompact(resumoFiltroGerencial.saldoAPagar)}
                      </strong>
                    </article>
                  </div>

                  <div className="space-y-3 md:hidden">
                    {resumoEmpresasFiltradas.length === 0 && (
                      <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-zinc-500">
                        Sem dados para exibição.
                      </article>
                    )}

                    {resumoEmpresasFiltradas.map((item) => (
                      <article key={item.empresaKey} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <button
                            type="button"
                            className="block w-full text-left text-base font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline whitespace-normal break-words leading-snug"
                            onClick={() => handleIniciarDestinacaoPorEmpresa(item.empresaKey)}
                            title="Abrir nova destinação para este operador lotérico"
                          >
                            <span className="block">{item.empresa}</span>
                            <span className="mt-1 block text-sm font-medium text-zinc-500">
                              CNPJ: {item.cnpj || 'não informado'}
                            </span>
                          </button>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-sm font-medium text-zinc-600">
                            {item.processosComSaldo}/{item.processosTotal} processos
                          </span>
                        </div>

                        <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                          <div className="rounded-xl bg-slate-50 p-2">
                            <dt className="text-sm text-zinc-500">Fomento</dt>
                            <dd className="font-semibold text-zinc-900">{formatCurrency(item.totalFomento)}</dd>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-2">
                            <dt className="text-sm text-zinc-500">Destinado</dt>
                            <dd className="font-semibold text-zinc-900">{formatCurrency(item.totalDestinado)}</dd>
                          </div>
                          <div className="rounded-xl bg-slate-50 p-2">
                            <dt className="text-sm text-zinc-500">Pago</dt>
                            <dd className="font-semibold text-zinc-900">{formatCurrency(item.totalPago)}</dd>
                          </div>
                          <div className="rounded-xl bg-emerald-50 p-2">
                            <dt className="text-sm text-emerald-700">Saldo a destinar</dt>
                            <dd className="font-semibold text-emerald-800">{formatCurrency(item.saldoADestinar)}</dd>
                          </div>
                          <div className="col-span-2 rounded-xl bg-amber-50 p-2">
                            <dt className="text-sm text-amber-700">Saldo a pagar</dt>
                            <dd className="font-semibold text-amber-800">{formatCurrency(item.saldoAPagar)}</dd>
                          </div>
                        </dl>
                      </article>
                    ))}
                  </div>

                  <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white/80 md:block">
                    <table className="w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100/90 text-zinc-600">
                        <tr>
                          <th className="px-4 py-3">Operador lotérico / CNPJ</th>
                          <th className="px-4 py-3">Fomento</th>
                          <th className="px-4 py-3">Destinado</th>
                          <th className="px-4 py-3">Pago</th>
                          <th className="px-4 py-3">Saldo a destinar</th>
                          <th className="px-4 py-3">Saldo a pagar</th>
                          <th className="px-4 py-3">Processos com saldo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resumoEmpresasFiltradas.length === 0 && (
                          <tr>
                            <td colSpan="7" className="px-4 py-4 text-zinc-500">
                              Sem dados para exibição.
                            </td>
                          </tr>
                        )}

                        {resumoEmpresasFiltradas.map((item) => (
                          <tr key={item.empresaKey} className="border-t border-slate-100/80 even:bg-slate-50/70">
                            <td className="px-4 py-3 font-medium text-zinc-900 max-w-[320px]">
                              <button
                                type="button"
                                className="w-full text-left font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline whitespace-normal break-words leading-snug"
                                onClick={() => handleIniciarDestinacaoPorEmpresa(item.empresaKey)}
                                title="Abrir nova destinação para este operador lotérico"
                              >
                                <span className="block">{item.empresa}</span>
                                <span className="mt-1 block text-sm font-medium text-zinc-500">
                                  CNPJ: {item.cnpj || 'não informado'}
                                </span>
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
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-zinc-900">Cadastro de operadores lotéricos</h2>
                    <button
                      type="button"
                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                      onClick={() => {
                        if (isEmpresaFormVisible) {
                          handleCancelarEdicaoEmpresa()
                          return
                        }

                        setEditingEmpresaId('')
                        setEmpresaForm({ razaoSocial: '', cnpj: '' })
                        setIsEmpresaFormVisible(true)
                      }}
                    >
                      {isEmpresaFormVisible ? 'Ocultar formulário' : 'Adicionar operador lotérico'}
                    </button>
                  </div>

                  {isEmpresaFormVisible && (
                    <form
                      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                      onSubmit={handleSalvarEmpresa}
                    >
                      <h3 className="text-base font-semibold text-zinc-900">
                        {editingEmpresaId ? 'Editar operador lotérico' : 'Novo operador lotérico'}
                      </h3>
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
                      <div className="flex flex-wrap gap-2">
                        <button className="btn-primary flex-1" type="submit">
                          {editingEmpresaId ? 'Salvar alterações' : 'Cadastrar operador lotérico'}
                        </button>
                        {editingEmpresaId && (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                            onClick={handleCancelarEdicaoEmpresa}
                          >
                            Cancelar edição
                          </button>
                        )}
                      </div>
                    </form>
                  )}

                  <div className="mt-4 rounded-xl bg-white p-3 text-sm text-zinc-600">
                    Operadores lotéricos cadastrados: {empresasCadastroLista.length}
                  </div>

                  <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                          <th scope="col" className="px-3 py-2">Razão social</th>
                          <th scope="col" className="px-3 py-2">CNPJ</th>
                          <th scope="col" className="px-3 py-2">Lançamentos atrelados</th>
                          <th scope="col" className="px-3 py-2 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {empresasCadastroLista.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-3 py-5 text-center text-sm text-slate-500">
                              Nenhum operador lotérico cadastrado até o momento.
                            </td>
                          </tr>
                        ) : (
                          empresasCadastroLista.map((item) => (
                            <tr key={item.id}>
                              <td className="px-3 py-2 font-medium text-zinc-900">{item.razaoSocial}</td>
                              <td className="px-3 py-2 text-zinc-700">{item.cnpj || 'Não informado'}</td>
                              <td className="px-3 py-2 text-zinc-700">{item.totalLancamentosAtrelados}</td>
                              <td className="px-3 py-2">
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
                                    onClick={() => handleEditarEmpresa(item)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 transition enabled:hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                    onClick={() => handleExcluirEmpresa(item)}
                                    disabled={!item.canDelete}
                                    title={
                                      item.canDelete
                                        ? 'Excluir operador lotérico'
                                        : 'Não é possível excluir porque há lançamentos atrelados'
                                    }
                                  >
                                    Excluir
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              {canAccessCadastroBase && activeCadastroTab === 'entidades' && (
                <section className="mt-5 animate-in">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-lg font-semibold text-zinc-900">Cadastro de entidades</h2>
                    <button
                      type="button"
                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                      onClick={() => {
                        setEditingEntidadeId('')
                        setEntidadeForm(createInitialEntidadeForm())
                        setIsEntidadeFormVisible((current) => !current)
                      }}
                    >
                      {isEntidadeFormVisible ? 'Ocultar formulário' : 'Adicionar entidade'}
                    </button>
                  </div>

                  {(isEntidadeFormVisible || editingEntidadeId) && (
                    <form
                      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                      onSubmit={handleSalvarEntidade}
                    >
                      <h3 className="text-base font-semibold text-zinc-900">
                        {editingEntidadeId ? 'Editar entidade' : 'Nova entidade'}
                      </h3>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                        <div>
                          <label className="field-label" htmlFor="entidadeCnpj">
                            CNPJ
                          </label>
                          <input
                            id="entidadeCnpj"
                            className="field-input"
                            value={entidadeForm.cnpj}
                            onChange={(event) =>
                              setEntidadeForm((current) => ({ ...current, cnpj: maskCNPJ(event.target.value) }))
                            }
                            onBlur={(event) => {
                              handleConsultarDadosCnpjEntidade(event.target.value)
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                event.preventDefault()
                                event.currentTarget.blur()
                              }
                            }}
                            placeholder="00.000.000/0000-00"
                          />
                        </div>

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
                          <label className="field-label" htmlFor="entidadeResponsavel">
                            Nome do responsável
                          </label>
                          <input
                            id="entidadeResponsavel"
                            className="field-input"
                            value={entidadeForm.responsavel}
                            onChange={(event) =>
                              setEntidadeForm((current) => ({ ...current, responsavel: event.target.value }))
                            }
                            placeholder="Nome completo"
                          />
                        </div>

                        <div>
                          <label className="field-label" htmlFor="entidadeContato">
                            Contato
                          </label>
                          <input
                            id="entidadeContato"
                            className="field-input"
                            value={entidadeForm.contato}
                            onChange={(event) =>
                              setEntidadeForm((current) => ({ ...current, contato: event.target.value }))
                            }
                            placeholder="Telefone, e-mail ou ambos"
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

                        <div>
                          <label className="field-label" htmlFor="entidadeEstado">
                            Estado
                          </label>
                          <select
                            id="entidadeEstado"
                            className="field-input"
                            value={entidadeForm.estado}
                            onChange={(event) =>
                              setEntidadeForm((current) => ({
                                ...current,
                                estado: event.target.value,
                                municipio: '',
                              }))
                            }
                          >
                            <option value="">Selecione</option>
                            {BRAZIL_STATES.map((item) => (
                              <option key={item.sigla} value={item.sigla}>
                                {item.sigla} - {item.nome}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="field-label" htmlFor="entidadeMunicipio">
                            Municipio
                          </label>
                          <select
                            id="entidadeMunicipio"
                            className="field-input"
                            value={entidadeForm.municipio}
                            onChange={(event) =>
                              setEntidadeForm((current) => ({ ...current, municipio: event.target.value }))
                            }
                            disabled={!entidadeForm.estado || isLoadingMunicipiosByEstado}
                          >
                            <option value="">
                              {isLoadingMunicipiosByEstado
                                ? 'Carregando municipios...'
                                : entidadeForm.estado
                                  ? 'Selecione'
                                  : 'Selecione um estado primeiro'}
                            </option>
                            {municipiosDisponiveisComSelecionado.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="field-label" htmlFor="entidadeFormaPagamento">
                            Forma de pagamento
                          </label>
                          <select
                            id="entidadeFormaPagamento"
                            className="field-input"
                            value={entidadeForm.formaPagamento}
                            onChange={(event) =>
                              setEntidadeForm((current) => ({ ...current, formaPagamento: event.target.value }))
                            }
                          >
                            <option value="PIX">PIX</option>
                            <option value="Conta Bancária">Conta Bancária</option>
                            <option value="Boleto">Boleto</option>
                            <option value="Outro">Outro</option>
                          </select>
                        </div>

                        {entidadeForm.formaPagamento === 'PIX' && (
                          <div>
                            <label className="field-label" htmlFor="entidadeChavePix">
                              Chave Pix
                            </label>
                            <input
                              id="entidadeChavePix"
                              className="field-input"
                              value={entidadeForm.chavePix}
                              onChange={(event) =>
                                setEntidadeForm((current) => ({ ...current, chavePix: event.target.value }))
                              }
                              placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
                            />
                          </div>
                        )}

                        {entidadeForm.formaPagamento === 'Conta Bancária' && (
                          <>
                            <div>
                              <label className="field-label" htmlFor="entidadeBanco">
                                Banco
                              </label>
                              <input
                                id="entidadeBanco"
                                className="field-input"
                                value={entidadeForm.banco}
                                onChange={(event) =>
                                  setEntidadeForm((current) => ({ ...current, banco: event.target.value }))
                                }
                                placeholder="Nome ou código do banco"
                              />
                            </div>
                            <div>
                              <label className="field-label" htmlFor="entidadeAgencia">
                                Agência
                              </label>
                              <input
                                id="entidadeAgencia"
                                className="field-input"
                                value={entidadeForm.agencia}
                                onChange={(event) =>
                                  setEntidadeForm((current) => ({ ...current, agencia: event.target.value }))
                                }
                                placeholder="Ex: 0001"
                              />
                            </div>
                            <div>
                              <label className="field-label" htmlFor="entidadeConta">
                                Conta com dígito
                              </label>
                              <input
                                id="entidadeConta"
                                className="field-input"
                                value={entidadeForm.conta}
                                onChange={(event) =>
                                  setEntidadeForm((current) => ({ ...current, conta: event.target.value }))
                                }
                                placeholder="Ex: 12345-6"
                              />
                            </div>
                          </>
                        )}

                        {entidadeForm.formaPagamento === 'Outro' && (
                          <div className="md:col-span-2 xl:col-span-3">
                            <label className="field-label" htmlFor="entidadeDadosBancarios">
                              Detalhes do pagamento
                            </label>
                            <textarea
                              id="entidadeDadosBancarios"
                              className="field-input min-h-24"
                              value={entidadeForm.dadosBancarios}
                              onChange={(event) =>
                                setEntidadeForm((current) => ({ ...current, dadosBancarios: event.target.value }))
                              }
                              placeholder="Forneça os detalhes adicionais"
                            />
                          </div>
                        )}

                        <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 md:col-span-2 xl:col-span-3">
                          {categoriaTexto}
                        </div>
                      </div>

                    <div className="flex flex-wrap gap-2">
                      <button className="btn-primary flex-1" type="submit">
                        {editingEntidadeId ? 'Salvar alterações' : 'Cadastrar entidade'}
                      </button>
                      {editingEntidadeId && (
                        <button
                          type="button"
                          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                          onClick={handleCancelarEdicaoEntidade}
                        >
                          Cancelar edição
                        </button>
                      )}
                    </div>
                    </form>
                  )}

                  <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-zinc-900">Entidades cadastradas</h3>
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                        Total: {entidades.length}
                      </span>
                    </div>

                    {entidades.length === 0 ? (
                      <p className="text-sm text-zinc-600">Nenhuma entidade cadastrada até o momento.</p>
                    ) : (
                      <ul className="space-y-3">
                        {entidades.map((entry) => (
                          <li key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-semibold text-zinc-900">{entry.nome || 'Sem nome'}</p>
                                <p className="text-sm text-zinc-600">Categoria: {entry.categoria || '--'}</p>
                              </div>
                              <button
                                type="button"
                                className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
                                onClick={() => handleEditEntidade(entry)}
                              >
                                Editar
                              </button>
                            </div>

                            <dl className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
                              <div>
                                <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">CNPJ</dt>
                                <dd>{entry.cnpj || '--'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Responsável</dt>
                                <dd>{entry.responsavel || '--'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Contato</dt>
                                <dd>{entry.contato || '--'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Estado</dt>
                                <dd>{entry.estado || '--'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Municipio</dt>
                                <dd>{entry.municipio || '--'}</dd>
                              </div>
                              <div>
                                <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Forma de Recebimento</dt>
                                <dd>{entry.formaPagamento || (entry.chavePix ? 'PIX' : (entry.dadosBancarios ? 'Outro' : '--'))}</dd>
                              </div>
                              {entry.formaPagamento === 'PIX' || (!entry.formaPagamento && entry.chavePix) ? (
                                <div>
                                  <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Chave Pix</dt>
                                  <dd>{entry.chavePix || '--'}</dd>
                                </div>
                              ) : null}
                              {entry.formaPagamento === 'Conta Bancária' && (
                                <div className="sm:col-span-2">
                                  <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Conta Bancária</dt>
                                  <dd>Banco: {entry.banco || '--'} | Ag: {entry.agencia || '--'} | CC: {entry.conta || '--'}</dd>
                                </div>
                              )}
                              {(entry.formaPagamento === 'Outro' || (!entry.formaPagamento && entry.dadosBancarios)) && (
                                <div className="sm:col-span-2">
                                  <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">
                                    Detalhes de recebimento
                                  </dt>
                                  <dd className="whitespace-pre-wrap">{entry.dadosBancarios || '--'}</dd>
                                </div>
                              )}
                            </dl>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </section>
              )}

              {isAdmin && activeCadastroTab === 'usuarios' && (
                <section className="mt-5 animate-in space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-zinc-900">Cadastro de usuários</h2>
                      <p className="text-sm text-zinc-600">
                        Promova ou reverta perfis entre OPERADOR e admin, e bloqueie ou libere o acesso.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
                      onClick={() => {
                        setIsCreateUserFormVisible((current) => !current)

                        if (isCreateUserFormVisible) {
                          setNewUserForm({ nome: '', cargo: '', email: '', password: '', role: 'OPERADOR' })
                        }
                      }}
                    >
                      {isCreateUserFormVisible ? 'Cancelar novo usuário' : 'Adicionar usuário'}
                    </button>
                  </div>

                  {isCreateUserFormVisible && (
                    <form
                      className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-3"
                      onSubmit={handleCadastrarUsuario}
                    >
                      <div className="sm:col-span-2">
                        <label className="field-label" htmlFor="novoUsuarioNome">
                          Nome
                        </label>
                        <input
                          id="novoUsuarioNome"
                          className="field-input"
                          value={newUserForm.nome}
                          onChange={(event) =>
                            setNewUserForm((current) => ({ ...current, nome: event.target.value }))
                          }
                          placeholder="Nome completo"
                        />
                      </div>

                      <div className="sm:col-span-1">
                        <label className="field-label" htmlFor="novoUsuarioCargo">
                          Cargo/Função
                        </label>
                        <input
                          id="novoUsuarioCargo"
                          className="field-input"
                          value={newUserForm.cargo}
                          onChange={(event) =>
                            setNewUserForm((current) => ({ ...current, cargo: event.target.value }))
                          }
                          placeholder="Ex: Analista Financeiro"
                        />
                      </div>

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
                  )}

                  <div className="space-y-3 md:hidden">
                    {usersList.length === 0 && (
                      <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-zinc-500">
                        Nenhum usuario encontrado.
                      </article>
                    )}

                    {usersList.map((entry) => {
                      const isSelf = entry.uid === user.uid
                      const nextRole = entry.role === 'admin' ? 'OPERADOR' : 'admin'
                      const isBlocked = entry.blocked === true
                      const isRoleBusy = roleBusyUserId === entry.uid
                      const isAccessBusy = accessBusyUserId === entry.uid
                      const isNameBusy = nameBusyUserId === entry.uid
                      const isEditingName = editingUserId === entry.uid

                      return (
                        <article key={entry.uid} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                          <div className="space-y-3">
                            <div>
                              <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">Nome</p>
                              {isEditingName ? (
                                <input
                                  className="field-input mt-1 py-2"
                                  value={editingUserName}
                                  onChange={(event) => setEditingUserName(event.target.value)}
                                  placeholder="Nome completo"
                                  aria-label={`Nome do usuário ${entry.email || entry.uid}`}
                                />
                              ) : (
                                <p className="mt-1 font-semibold text-zinc-900">{entry.nome || '--'}</p>
                              )}
                            </div>

                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              <div className="rounded-xl bg-slate-50 p-2">
                                <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">Cargo/Função</p>
                                {isEditingName ? (
                                  <input
                                    className="field-input mt-1 py-2"
                                    value={editingUserCargo}
                                    onChange={(event) => setEditingUserCargo(event.target.value)}
                                    placeholder="Cargo/Função"
                                    aria-label={`Cargo/Função do usuário ${entry.email || entry.uid}`}
                                  />
                                ) : (
                                  <p className="mt-1 text-sm font-medium text-zinc-800">{entry.cargo || '--'}</p>
                                )}
                              </div>
                              <div className="rounded-xl bg-slate-50 p-2">
                                <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">Email</p>
                                <p className="mt-1 break-all text-sm font-medium text-zinc-800">{entry.email || '--'}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              <span
                                className={
                                  entry.role === 'admin'
                                    ? 'rounded-full bg-cyan-100 px-2 py-1 text-sm font-semibold text-cyan-800'
                                    : 'rounded-full bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800'
                                }
                              >
                                {(entry.role || 'OPERADOR').toUpperCase()}
                              </span>
                              <span
                                className={
                                  isBlocked
                                    ? 'rounded-full bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-800'
                                    : 'rounded-full bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800'
                                }
                              >
                                {isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                              </span>
                            </div>

                            {isEditingName ? (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => handleCancelEditUserName()}
                                  disabled={isNameBusy}
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() =>
                                    handleUpdateUserName(entry.uid, editingUserName, editingUserCargo)
                                  }
                                  disabled={isNameBusy}
                                >
                                  {isNameBusy ? 'Salvando dados...' : 'Salvar dados'}
                                </button>
                              </div>
                            ) : (
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => handleStartEditUserName(entry)}
                                  disabled={isRoleBusy || isAccessBusy || isNameBusy}
                                >
                                  Editar
                                </button>
                                {isSelf ? (
                                  <button
                                    type="button"
                                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-zinc-600"
                                    disabled
                                  >
                                    Usuário atual
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleUpdateRole(entry.uid, nextRole)}
                                      disabled={isRoleBusy || isAccessBusy || isNameBusy}
                                    >
                                      {isRoleBusy
                                        ? 'Atualizando perfil...'
                                        : `Tornar ${nextRole.toUpperCase()}`}
                                    </button>

                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleToggleUserAccess(entry.uid, !isBlocked)}
                                      disabled={isAccessBusy || isRoleBusy || isNameBusy}
                                    >
                                      {isAccessBusy
                                        ? 'Atualizando acesso...'
                                        : isBlocked
                                          ? 'Liberar acesso'
                                          : 'Bloquear acesso'}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </article>
                      )
                    })}
                  </div>

                  <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 md:block">
                    <table className="min-w-full border-collapse text-left text-sm">
                      <thead className="bg-slate-100/90 text-zinc-600">
                        <tr>
                          <th className="px-4 py-3">Nome</th>
                          <th className="px-4 py-3">Cargo/Função</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Perfil</th>
                          <th className="px-4 py-3">Acesso</th>
                          <th className="px-4 py-3 text-right">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {usersList.length === 0 && (
                          <tr>
                            <td colSpan="6" className="px-4 py-4 text-zinc-500">
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
                          const isNameBusy = nameBusyUserId === entry.uid
                          const isEditingName = editingUserId === entry.uid

                          return (
                            <tr key={entry.uid} className="border-t border-slate-100/80 even:bg-slate-50/70">
                              <td className="px-4 py-3 text-zinc-700 min-w-[220px]">
                                {isEditingName ? (
                                  <input
                                    className="field-input py-2"
                                    value={editingUserName}
                                    onChange={(event) => setEditingUserName(event.target.value)}
                                    placeholder="Nome completo"
                                    aria-label={`Nome do usuário ${entry.email || entry.uid}`}
                                  />
                                ) : (
                                  entry.nome || '--'
                                )}
                              </td>
                              <td className="px-4 py-3 text-zinc-600 min-w-[180px]">
                                {isEditingName ? (
                                  <input
                                    className="field-input py-2"
                                    value={editingUserCargo}
                                    onChange={(event) => setEditingUserCargo(event.target.value)}
                                    placeholder="Cargo/Função"
                                    aria-label={`Cargo/Função do usuário ${entry.email || entry.uid}`}
                                  />
                                ) : (
                                  entry.cargo || '--'
                                )}
                              </td>
                              <td className="px-4 py-3 font-medium text-zinc-900">{entry.email || '--'}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    entry.role === 'admin'
                                      ? 'rounded-full bg-cyan-100 px-2 py-1 text-sm font-semibold text-cyan-800'
                                      : 'rounded-full bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800'
                                  }
                                >
                                  {(entry.role || 'OPERADOR').toUpperCase()}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                <span
                                  className={
                                    isBlocked
                                      ? 'rounded-full bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-800'
                                      : 'rounded-full bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800'
                                  }
                                >
                                  {isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-right">
                                {isEditingName ? (
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleCancelEditUserName()}
                                      disabled={isNameBusy}
                                    >
                                      Cancelar
                                    </button>
                                    <button
                                      type="button"
                                      className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() =>
                                        handleUpdateUserName(entry.uid, editingUserName, editingUserCargo)
                                      }
                                      disabled={isNameBusy}
                                    >
                                      {isNameBusy ? 'Salvando dados...' : 'Salvar dados'}
                                    </button>
                                  </div>
                                ) : (
                                  <div className="flex flex-wrap justify-end gap-2">
                                    <button
                                      type="button"
                                      className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                      onClick={() => handleStartEditUserName(entry)}
                                      disabled={isRoleBusy || isAccessBusy || isNameBusy}
                                    >
                                      Editar
                                    </button>
                                    {isSelf ? (
                                      <button
                                        type="button"
                                        className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-zinc-600"
                                        disabled
                                      >
                                        Usuário atual
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          type="button"
                                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={() => handleUpdateRole(entry.uid, nextRole)}
                                          disabled={isRoleBusy || isAccessBusy || isNameBusy}
                                        >
                                          {isRoleBusy
                                            ? 'Atualizando perfil...'
                                            : `Tornar ${nextRole.toUpperCase()}`}
                                        </button>

                                        <button
                                          type="button"
                                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                          onClick={() => handleToggleUserAccess(entry.uid, !isBlocked)}
                                          disabled={isAccessBusy || isRoleBusy || isNameBusy}
                                        >
                                          {isAccessBusy
                                            ? 'Atualizando acesso...'
                                            : isBlocked
                                              ? 'Liberar acesso'
                                              : 'Bloquear acesso'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
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
                  Salve o link da planilha do Google e o app monta automaticamente o link CSV de exportação.
                </p>

                <form className="mt-5 space-y-3" onSubmit={handleSalvarCsvLink}>
                  <label className="field-label" htmlFor="csvUrl">
                    Link da planilha (Google Sheets) ou CSV
                  </label>
                  <input
                    id="csvUrl"
                    className="field-input"
                    type="url"
                    value={csvUrl}
                    onChange={(event) => setCsvUrl(event.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/ID_DA_PLANILHA/edit"
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
                  <p className="mt-2 text-sm font-medium text-amber-700">
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

          {activeMenu === 'calculadora' && (
            <UfrPbCalculator />
          )}

          {activeMenu === 'relatorios' && (
            <section className="panel panel-soft space-y-5 sm:p-6">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={activeReportTab === 'verificacao' ? 'tab tab-active' : 'tab'}
                    onClick={() => setActiveReportTab('verificacao')}
                  >
                    Verificação por processo
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      className={activeReportTab === 'gerencial' ? 'tab tab-active' : 'tab'}
                      onClick={() => setActiveReportTab('gerencial')}
                    >
                      Informações gerenciais
                    </button>
                  )}
                </div>
              </div>

              {!isAdmin && (
                <p className="text-sm font-medium text-amber-700">
                  O relatório gerencial de destinação de fomento é exclusivo para perfil ADMIN.
                </p>
              )}

              {activeReportTab === 'verificacao' && (
                <>
                  <div className="report-controls grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className="field-label" htmlFor="reportProcessoId">
                        Processo para emissão
                      </label>
                      <input
                        id="reportProcessoId"
                        className="field-input"
                        value={reportProcessoId}
                        onChange={(event) => setReportProcessoId(event.target.value)}
                        placeholder="Digite para pesquisar um processo"
                        list="reportProcessoOptions"
                      />
                      <datalist id="reportProcessoOptions">
                        {processosParaRelatorio.map((processoId) => (
                          <option key={processoId} value={processoId}>
                            {processoId}
                          </option>
                        ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="reportDataEmissao">
                        Data de emissão
                      </label>
                      <input
                        id="reportDataEmissao"
                        className="field-input"
                        type="date"
                        value={reportDataEmissao}
                        onChange={(event) => setReportDataEmissao(event.target.value)}
                      />
                    </div>

                    <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm text-zinc-600">
                        Relatório formal para instrução processual sobre existência de destinação social.
                      </p>
                      <button
                        className="btn-primary"
                        type="button"
                        onClick={handleBaixarRelatorioPdf}
                        disabled={isGeneratingPdf || !isProcessoRelatorioValido}
                      >
                        {isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
                      </button>
                    </div>
                  </div>

                  <div className="report-print-area">
                    <article
                      ref={reportContentRef}
                      className="report-a4 rounded-2xl border border-slate-200 bg-white text-zinc-900 shadow-sm"
                    >
                      <header className="border-b border-zinc-300 pb-3 text-center">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                          Governo do Estado da Paraiba
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                          Loteria do Estado da Paraíba
                        </p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-600">
                          Assessoria de Políticas Públicas
                        </p>
                        <br />
                        <br />
                        <h2 className="mt-2 text-base font-semibold uppercase tracking-[0.08em] text-zinc-900">
                          Relatório de Verificação de Destinação Social
                        </h2>
                      </header>

                      <section className="mt-6 space-y-4 text-justify text-[13.5px] leading-relaxed text-zinc-800">
                        {!reportProcessoId && (
                          <p>
                            Selecione um processo para gerar o relatório institucional de verificação de destinação social.
                          </p>
                        )}

                        {reportProcessoId && (
                          <>
                            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-[12.5px] leading-relaxed text-zinc-700">
                              <p>
                                De acordo com a Instrução Normativa nº 001/2024, que regulamenta a modalidade passiva,
                                os recursos correspondentes a <strong>7,5% da totalidade dos prêmios</strong> devem ser
                                destinados ao fomento de ações e projetos nas áreas de Assistência, Desportos, Educação,
                                Saúde e Desenvolvimento Social. Essas ações devem ser executadas pelo operador lotérico autorizado
                                em parceria com a LOTEP. O Decreto nº 44.576/2023 também inclui a{' '}
                                <strong>Segurança Pública</strong> entre as áreas contempladas.
                              </p>
                            </div>

                            <p>
                              Em atendimento à consulta formalizada nos autos do processo administrativo nº{' '}
                              <strong>{reportProcessoId}</strong>, certifica-se a situação da destinação social a ele
                              vinculada.
                            </p>

                            {destinacoesRelatorio.length > 0 ? (
                              <>
                                <p>
                                  Após análise dos registros institucionais disponíveis no sistema de controle de
                                  fomentos, <strong>constata-se que houve destinação social de recursos</strong> para o
                                  referido processo, no montante total de{' '}
                                  <strong>{formatCurrency(totalDestinadoRelatorio)}</strong>.
                                </p>

                                <p>
                                  As entidades recebedoras do fomento são:{' '}
                                  <strong>
                                    {entidadesRelatorio
                                      .map((item) =>
                                        item.cnpj
                                          ? `${item.nome} (CNPJ ${item.cnpj})`
                                          : `${item.nome} (CNPJ não informado)`,
                                      )
                                      .join('; ') || 'Entidade não identificada'}
                                  </strong>
                                  .
                                </p>

                                <p>
                                  As áreas contempladas pela destinação no processo são:{' '}
                                  <strong>{areasDestinacaoRelatorio.join('; ') || 'Área não identificada'}</strong>.
                                </p>

                                {statusPagamentoRelatorio === 'pago' && (
                                  <p>
                                    Quanto ao pagamento, verifica-se que o valor destinado encontra-se
                                    <strong> integralmente pago</strong>, no total de{' '}
                                    <strong>{formatCurrency(totalPagoRelatorio)}</strong>.
                                  </p>
                                )}

                                {statusPagamentoRelatorio === 'parcial' && (
                                  <p>
                                    Quanto ao pagamento, verifica-se quitação <strong>parcial</strong>, com total pago de{' '}
                                    <strong>{formatCurrency(totalPagoRelatorio)}</strong> e saldo pendente de{' '}
                                    <strong>{formatCurrency(saldoPagamentoRelatorio)}</strong>.
                                  </p>
                                )}

                                {statusPagamentoRelatorio === 'nao-pago' && (
                                  <p>
                                    Quanto ao pagamento, <strong>não há registro de quitação</strong> até a presente
                                    data.
                                  </p>
                                )}

                                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                                  <p className="mb-3 font-semibold text-zinc-900">Detalhamento por Entidade</p>
                                  <ul className="space-y-2">
                                    {Array.from(
                                      destinacoesRelatorio.reduce((mapa, dest) => {
                                        const entId = dest.entidadeId
                                        const entidadeCadastro = entidadesById[entId]
                                        const nomeEntidade = String(dest.entidadeNome || entidadeCadastro?.nome || 'Entidade não identificada').trim()
                                        
                                        if (!mapa.has(nomeEntidade)) {
                                          mapa.set(nomeEntidade, { nome: nomeEntidade, valorDestinado: 0, valorPago: 0 })
                                        }
                                        const item = mapa.get(nomeEntidade)
                                        item.valorDestinado += Number(dest.valorDestinado || 0)
                                        item.valorPago += Number(dest.valorPagoAcumulado || 0)
                                        return mapa
                                      }, new Map()).values()
                                    ).map((item, index) => (
                                      <li key={index} className="flex items-center justify-between border-b border-slate-200/60 pb-2 last:border-0 last:pb-0">
                                        <span className="font-medium text-zinc-700">{item.nome}</span>
                                        <div className="text-right">
                                          <p className="text-sm font-semibold text-zinc-900">Destinado: {formatCurrency(item.valorDestinado)}</p>
                                          <p className="text-xs text-zinc-500">Pago: {formatCurrency(item.valorPago)}</p>
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </>
                            ) : (
                              <>
                                <p>
                                  Após análise dos registros institucionais disponíveis no sistema de controle de
                                  fomentos, <strong>não foram localizadas destinações sociais registradas</strong> para o
                                  processo informado até a presente data.
                                </p>
                                <p>
                                  O presente relatório é emitido para fins de instrução processual, com vistas à
                                  comprovação formal da inexistência de destinação social registrada no âmbito do processo
                                  em epígrafe.
                                </p>
                              </>
                            )}

                            <p>João Pessoa, {dataEmissaoRelatorioExtenso}.</p>
                          </>
                        )}
                      </section>

                      <footer className="mt-16 text-center">
                        <p className="mt-10 text-sm font-semibold uppercase tracking-[0.06em] text-zinc-900">
                          {usuarioAssinaturaRelatorio}
                        </p>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.06em] text-zinc-600">
                          {userProfile?.cargo || 'CARGO/FUNCAO'}
                        </p>
                      </footer>
                    </article>
                  </div>
                </>
              )}

              {isAdmin && activeReportTab === 'gerencial' && (
                <>
                  <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2 lg:grid-cols-5">
                    <div>
                      <label className="field-label" htmlFor="gerencialAno">
                        Ano
                      </label>
                      <select
                        id="gerencialAno"
                        className="field-input"
                        value={reportGerencialAno}
                        onChange={(event) => setReportGerencialAno(event.target.value)}
                      >
                        <option value="todos">Todos</option>
                        {anosGerencialOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="gerencialCompetencia">
                        Competência
                      </label>
                      <select
                        id="gerencialCompetencia"
                        className="field-input"
                        value={reportGerencialCompetencia}
                        onChange={(event) => setReportGerencialCompetencia(event.target.value)}
                      >
                        <option value="todos">Todas</option>
                        {competenciasGerencialOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="gerencialDestino">
                        Destino
                      </label>
                      <select
                        id="gerencialDestino"
                        className="field-input"
                        value={reportGerencialDestino}
                        onChange={(event) => setReportGerencialDestino(event.target.value)}
                      >
                        <option value="todos">Todos</option>
                        {destinosGerencialOptions.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="gerencialEntidade">
                        Entidade
                      </label>
                      <select
                        id="gerencialEntidade"
                        className="field-input"
                        value={reportGerencialEntidadeId}
                        onChange={(event) => setReportGerencialEntidadeId(event.target.value)}
                      >
                        <option value="todos">Todas</option>
                        {entidadesGerencialOptions.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nome}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="field-label" htmlFor="gerencialStatus">
                        Status
                      </label>
                      <select
                        id="gerencialStatus"
                        className="field-input"
                        value={reportGerencialStatus}
                        onChange={(event) => setReportGerencialStatus(event.target.value)}
                      >
                        <option value="todos">Todos</option>
                        {statusGerencialOptions.map((item) => (
                          <option key={item} value={item}>
                            {getStatusPagamentoLabel(item)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <article className="card-metric">
                      <p>Total destinado</p>
                      <strong>{formatCurrency(totalDestinadoGerencial)}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Destinações no filtro</p>
                      <strong>{quantidadeDestinacoesGerencial}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Entidades atendidas</p>
                      <strong>{totalEntidadesGerencial}</strong>
                    </article>
                    <article className="card-metric">
                      <p>Municípios atendidos</p>
                      <strong>{totalMunicipiosGerencial}</strong>
                    </article>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleExportarGerencialPdf}
                      disabled={isGeneratingGerencialPdf || !linhasDetalhadasGerencial.length}
                    >
                      {isGeneratingGerencialPdf ? 'Gerando PDF...' : 'Baixar PDF gerencial'}
                    </button>
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={handleExportarGerencialCsv}
                      disabled={isExportingGerencialCsv || !linhasDetalhadasGerencial.length}
                    >
                      {isExportingGerencialCsv ? 'Gerando CSV...' : 'Baixar CSV gerencial'}
                    </button>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-3">
                    <article className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-600">Por ano</h3>
                      <div className="mt-3 space-y-2 text-sm">
                        {totaisPorAnoGerencial.length === 0 && <p className="text-zinc-500">Sem dados no filtro.</p>}
                        {totaisPorAnoGerencial.map((item) => (
                          <div key={item.ano} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                            <p className="font-semibold text-zinc-900">{item.ano}</p>
                            <p className="text-zinc-700">{formatCurrency(item.valor)}</p>
                            <p className="text-zinc-500">{formatPercent(item.percentual)}</p>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-600">
                        Por categoria
                      </h3>
                      <div className="mt-3 space-y-2 text-sm">
                        {totaisPorCategoriaGerencial.length === 0 && <p className="text-zinc-500">Sem dados no filtro.</p>}
                        {totaisPorCategoriaGerencial.map((item) => (
                          <div key={item.categoria} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                            <p className="font-semibold text-zinc-900">{item.categoria}</p>
                            <p className="text-zinc-700">{formatCurrency(item.valor)}</p>
                            <p className="text-zinc-500">{formatPercent(item.percentual)}</p>
                          </div>
                        ))}
                      </div>
                    </article>

                    <article className="rounded-2xl border border-slate-200 bg-white p-4">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-600">
                        Municípios atendidos
                      </h3>
                      <div className="mt-3 space-y-2 text-sm">
                        {totaisPorMunicipioGerencial.length === 0 && <p className="text-zinc-500">Sem dados no filtro.</p>}
                        {totaisPorMunicipioGerencial.map((item) => (
                          <div key={`${item.municipio}-${item.estado}`} className="rounded-xl border border-slate-200 bg-slate-50/70 p-2">
                            <p className="font-semibold text-zinc-900">
                              {item.municipio}/{item.estado}
                            </p>
                            <p className="text-zinc-700">{formatCurrency(item.valor)}</p>
                            <p className="text-zinc-500">Destinações: {item.quantidade}</p>
                          </div>
                        ))}
                      </div>
                    </article>
                  </div>

                  <article className="rounded-2xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-semibold uppercase tracking-[0.08em] text-zinc-600">Detalhamento</h3>
                    {linhasDetalhadasGerencial.length === 0 ? (
                      <p className="mt-3 text-sm text-zinc-500">Nenhuma destinação encontrada para os filtros.</p>
                    ) : (
                      <div className="mt-3 overflow-x-auto">
                        <table className="min-w-[1050px] divide-y divide-slate-200 text-left text-sm">
                          <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-zinc-600">
                            <tr>
                              <th className="px-3 py-2">Data</th>
                              <th className="px-3 py-2">Competência</th>
                              <th className="px-3 py-2">Ano</th>
                              <th className="px-3 py-2">Processo</th>
                              <th className="px-3 py-2">Operador Lotérico</th>
                              <th className="px-3 py-2">CNPJ</th>
                              <th className="px-3 py-2">Destino</th>
                              <th className="px-3 py-2">Entidade</th>
                              <th className="px-3 py-2">Categoria</th>
                              <th className="px-3 py-2">Município</th>
                              <th className="px-3 py-2">UF</th>
                              <th className="px-3 py-2">Status</th>
                              <th className="px-3 py-2 text-right">Valor</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 text-zinc-700">
                            {linhasDetalhadasGerencial.map((item) => (
                              <tr key={item.id || `${item.processoId}-${item.solicitacaoData}-${item.valorCents}`}>
                                <td className="px-3 py-2">{formatDateBR(item.solicitacaoData)}</td>
                                <td className="px-3 py-2">{item.competencia || '--/----'}</td>
                                <td className="px-3 py-2">{item.ano}</td>
                                <td className="px-3 py-2">{item.processoId || '--'}</td>
                                <td className="px-3 py-2">{item.empresa}</td>
                                <td className="px-3 py-2">{item.cnpjEmpresa}</td>
                                <td className="px-3 py-2">{item.destino || 'Não informado'}</td>
                                <td className="px-3 py-2">{item.entidade || 'Não informada'}</td>
                                <td className="px-3 py-2">{item.categoria}</td>
                                <td className="px-3 py-2">{item.municipio}</td>
                                <td className="px-3 py-2">{item.estado}</td>
                                <td className="px-3 py-2">{getStatusPagamentoLabel(item.status)}</td>
                                <td className="px-3 py-2 text-right font-medium">{formatCurrency(item.valor)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </article>
                </>
              )}
            </section>
          )}
        </section>
      </main>

      {isOrigemManualModalOpen && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-900/45 p-4 backdrop-blur-[1px]"
          onClick={() => setIsOrigemManualModalOpen(false)}
        >
          <div
            className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Cadastrar Fomento</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Informe o Operador Lotérico e o valor total disponível para incluir uma origem manual no fluxo.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                onClick={() => setIsOrigemManualModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSalvarOrigemManual}>
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="origemManualEmpresa">
                  Operador Lotérico cadastrada
                </label>
                <select
                  id="origemManualEmpresa"
                  className="field-input"
                  value={origemManualForm.empresaId}
                  onChange={(event) =>
                    setOrigemManualForm((current) => ({
                      ...current,
                      empresaId: event.target.value,
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {empresasCadastroOptions.map((empresa) => (
                    <option key={empresa.id} value={empresa.id}>
                      {`${empresa.razaoSocial} | ${empresa.cnpj || 'CNPJ não informado'}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="origemManualValorFomento">
                  FOMENTO DISPONÍVEL (R$)
                </label>
                <NumericFormat
                  id="origemManualValorFomento"
                  className="field-input"
                  thousandSeparator="."
                  decimalSeparator="," 
                  prefix="R$ "
                  decimalScale={2}
                  fixedDecimalScale
                  allowNegative={false}
                  inputMode="decimal"
                  onFocus={handleMoneyInputFocus}
                  value={origemManualForm.valorFomento}
                  onValueChange={(values) =>
                    setOrigemManualForm((current) => ({
                      ...current,
                      valorFomento: Number(values.floatValue || 0),
                    }))
                  }
                  placeholder="R$ 0,00"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="origemManualTipoFomento">
                  Tipo de Fomento
                </label>
                <select
                  id="origemManualTipoFomento"
                  className="field-input"
                  value={origemManualForm.tipoFomento}
                  onChange={(event) =>
                    setOrigemManualForm((current) => ({
                      ...current,
                      tipoFomento: event.target.value,
                    }))
                  }
                >
                  {tipoFomentoOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="origemManualProcessoId">
                  Identificador do processo (opcional)
                </label>
                <input
                  id="origemManualProcessoId"
                  className="field-input"
                  value={origemManualForm.processoId}
                  onChange={(event) =>
                    setOrigemManualForm((current) => ({
                      ...current,
                      processoId: event.target.value,
                    }))
                  }
                  placeholder="Ex.: LTP-PRC-2026/00001"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Se não informar, o sistema gera um identificador automático.
                </p>
              </div>

              <div className="sm:col-span-2 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                  onClick={() => setIsOrigemManualModalOpen(false)}
                >
                  Cancelar
                </button>
                <button className="btn-primary" type="submit">
                  Cadastrar Fomento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isEntidadeModalOpen && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-900/45 p-4">
          <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Cadastrar nova entidade</h2>
                <p className="mt-1 text-sm text-zinc-600">
                  Cadastre sem sair da destinação. O formulário preenchido permanece na tela.
                </p>
              </div>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                onClick={() => setIsEntidadeModalOpen(false)}
              >
                Fechar
              </button>
            </div>

            <form
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
              onSubmit={(event) =>
                handleSalvarEntidade(event, {
                  closeModalOnSuccess: true,
                 
                })
              }
            >
              <div>
                <label className="field-label" htmlFor="modalEntidadeCnpj">
                  CNPJ
                </label>
                <input
                  id="modalEntidadeCnpj"
                  className="field-input"
                  value={entidadeForm.cnpj}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, cnpj: maskCNPJ(event.target.value) }))
                  }
                  onBlur={(event) => {
                    handleConsultarDadosCnpjEntidade(event.target.value)
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      event.currentTarget.blur()
                    }
                  }}
                  placeholder="00.000.000/0000-00"
                />
              </div>

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
                />
              </div>

              <div>
                <label className="field-label" htmlFor="modalResponsavelEntidade">
                  Nome do responsável
                </label>
                <input
                  id="modalResponsavelEntidade"
                  className="field-input"
                  value={entidadeForm.responsavel}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, responsavel: event.target.value }))
                  }
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="modalContatoEntidade">
                  Contato
                </label>
                <input
                  id="modalContatoEntidade"
                  className="field-input"
                  value={entidadeForm.contato}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, contato: event.target.value }))
                  }
                  placeholder="Telefone, e-mail ou ambos"
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

              <div>
                <label className="field-label" htmlFor="modalEstadoEntidade">
                  Estado
                </label>
                <select
                  id="modalEstadoEntidade"
                  className="field-input"
                  value={entidadeForm.estado}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({
                      ...current,
                      estado: event.target.value,
                      municipio: '',
                    }))
                  }
                >
                  <option value="">Selecione</option>
                  {BRAZIL_STATES.map((item) => (
                    <option key={item.sigla} value={item.sigla}>
                      {item.sigla} - {item.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="modalMunicipioEntidade">
                  Municipio
                </label>
                <select
                  id="modalMunicipioEntidade"
                  className="field-input"
                  value={entidadeForm.municipio}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, municipio: event.target.value }))
                  }
                  disabled={!entidadeForm.estado || isLoadingMunicipiosByEstado}
                >
                  <option value="">
                    {isLoadingMunicipiosByEstado
                      ? 'Carregando municipios...'
                      : entidadeForm.estado
                        ? 'Selecione'
                        : 'Selecione um estado primeiro'}
                  </option>
                  {municipiosDisponiveisComSelecionado.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="field-label" htmlFor="modalEntidadeFormaPagamento">
                  Forma de pagamento
                </label>
                <select
                  id="modalEntidadeFormaPagamento"
                  className="field-input"
                  value={entidadeForm.formaPagamento}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, formaPagamento: event.target.value }))
                  }
                >
                  <option value="PIX">PIX</option>
                  <option value="Conta Bancária">Conta Bancária</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              {entidadeForm.formaPagamento === 'PIX' && (
                <div>
                  <label className="field-label" htmlFor="modalEntidadePix">
                    Chave Pix
                  </label>
                  <input
                    id="modalEntidadePix"
                    className="field-input"
                    value={entidadeForm.chavePix}
                    onChange={(event) =>
                      setEntidadeForm((current) => ({ ...current, chavePix: event.target.value }))
                    }
                    placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
                  />
                </div>
              )}

              {entidadeForm.formaPagamento === 'Conta Bancária' && (
                <>
                  <div>
                    <label className="field-label" htmlFor="modalEntidadeBanco">
                      Banco
                    </label>
                    <input
                      id="modalEntidadeBanco"
                      className="field-input"
                      value={entidadeForm.banco}
                      onChange={(event) =>
                        setEntidadeForm((current) => ({ ...current, banco: event.target.value }))
                      }
                      placeholder="Nome ou código do banco"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="modalEntidadeAgencia">
                      Agência
                    </label>
                    <input
                      id="modalEntidadeAgencia"
                      className="field-input"
                      value={entidadeForm.agencia}
                      onChange={(event) =>
                        setEntidadeForm((current) => ({ ...current, agencia: event.target.value }))
                      }
                      placeholder="Ex: 0001"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="field-label" htmlFor="modalEntidadeConta">
                      Conta com dígito
                    </label>
                    <input
                      id="modalEntidadeConta"
                      className="field-input"
                      value={entidadeForm.conta}
                      onChange={(event) =>
                        setEntidadeForm((current) => ({ ...current, conta: event.target.value }))
                      }
                      placeholder="Ex: 12345-6"
                    />
                  </div>
                </>
              )}

              {entidadeForm.formaPagamento === 'Outro' && (
                <div className="sm:col-span-2">
                  <label className="field-label" htmlFor="modalDadosBancariosEntidade">
                    Detalhes do pagamento
                  </label>
                  <textarea
                    id="modalDadosBancariosEntidade"
                    className="field-input min-h-24"
                    value={entidadeForm.dadosBancarios}
                    onChange={(event) =>
                      setEntidadeForm((current) => ({ ...current, dadosBancarios: event.target.value }))
                    }
                    placeholder="Forneça os detalhes adicionais"
                  />
                </div>
              )}

              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 sm:col-span-2">
                {categoriaTexto}
              </div>

              <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
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
        <div className="mx-auto max-w-2xl">
          {isMobileMenuOpen && (
            <div id="mobile-menu-actions" className="mb-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
              <div className="grid gap-2">
                <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3">
                  <p className="text-sm uppercase tracking-[0.14em] text-cyan-700">Operação ativa</p>
                  <p className="mt-1 break-all text-sm font-semibold text-cyan-900">{user.email || user.uid}</p>
                  <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700">
                    Perfil: {isAdmin ? 'ADMIN' : 'OPERADOR'}
                  </p>
                </div>

                <button
                  type="button"
                  className={activeMenu === 'destinacoes' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => handleSelectMobileMenu('destinacoes')}
                >
                  Destinações
                </button>
                <button
                  type="button"
                  className={activeMenu === 'cadastros' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => handleSelectMobileMenu('cadastros')}
                >
                  Cadastros
                </button>
                <button
                  type="button"
                  className={activeMenu === 'relatorios' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => handleSelectMobileMenu('relatorios')}
                >
                  Relatórios
                </button>
                <button
                  type="button"
                  className={activeMenu === 'configuracoes' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => handleSelectMobileMenu('configuracoes')}
                >
                  Configurações
                </button>
                <button
                  type="button"
                  className={activeMenu === 'calculadora' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                  onClick={() => handleSelectMobileMenu('calculadora')}
                >
                  Calculadora UFR-PB
                </button>
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
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                  onClick={() => {
                    setIsMobileMenuOpen(false)
                    handleLogout()
                  }}
                >
                  Encerrar Sessão
                </button>
              </div>
            </div>
          )}

          <button
            type="button"
            className="tab w-full"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-menu-actions"
          >
            Menu
          </button>
        </div>
      </nav>

    </div>
  )
}

export default App




