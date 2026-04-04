import { format, parseISO } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

export function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0))
}

export function formatDateBR(isoDate) {
  if (!isoDate) {
    return '--'
  }

  try {
    return format(parseISO(isoDate), 'dd/MM/yyyy', { locale: ptBR })
  } catch {
    return '--'
  }
}

export function toCompetenciaMask(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 6)

  if (digits.length <= 2) {
    return digits
  }

  return `${digits.slice(0, 2)}/${digits.slice(2)}`
}

export function parseCurrencyText(input) {
  if (!input) {
    return 0
  }

  const cleaned = String(input)
    .replace(/\s/g, '')
    .replace(/R\$/gi, '')
    .replace(/\./g, '')
    .replace(',', '.')

  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

export function sanitizeCNPJ(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 14)
}

export function maskCNPJ(value) {
  const digits = sanitizeCNPJ(value)
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2')
}
