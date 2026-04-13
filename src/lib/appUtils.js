import { formatCurrency, sanitizeCNPJ } from './formatters'

export const destinationTabs = [
  { id: 'gerencial', label: 'Painel gerencial' },
  { id: 'destinacao', label: 'Destinações' },
  { id: 'pagamento', label: 'Confirmação de pagamento' },
]

export const cadastroTabs = [
  { id: 'empresas', label: 'Cadastro de operadores lotéricos' },
  { id: 'entidades', label: 'Cadastro de entidades' },
  { id: 'usuarios', label: 'Cadastro de usuários' },
]

export const FONT_SIZE_STORAGE_KEY = 'app-fomentos-font-size'

export function getValorFomentoFromProcess(item) {
  const baseCalculo = getBaseCalculoFomentoFromProcess(item)
  const valorMinimo = Number(item?.valorFomentoMinimo || 0)

  if (baseCalculo > 0) {
    return Math.max(baseCalculo * 0.075, valorMinimo)
  }

  return Math.max(Number(item?.valorFomento || 0), valorMinimo)
}

export function getBaseCalculoFomentoFromProcess(item) {
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

export function formatCurrencyCompact(value) {
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

export function getTodayInputDate() {
  const now = new Date()
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return localDate.toISOString().split('T')[0]
}

export function slugifyFileName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

export function competenciaFromDate(isoDate) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return ''
  }

  const [year, month] = isoDate.split('-')
  return `${month}/${year}`
}

export function getEmpresaGroupKey(cnpjValue, empresaNome) {
  const cnpjDigits = sanitizeCNPJ(cnpjValue)

  if (cnpjDigits) {
    return `cnpj:${cnpjDigits}`
  }

  return `sem-cnpj:${String(empresaNome || '').trim().toLowerCase()}`
}

export function createInitialEntidadeForm() {
  return {
    nome: '',
    categoria: 'Assistencia',
    cnpj: '',
    contato: '',
    responsavel: '',
    chavePix: '',
    dadosBancarios: '',
  }
}
