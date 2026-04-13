import Papa from 'papaparse'
import { maskCNPJ, parseCurrencyText, sanitizeCNPJ } from '../lib/formatters'

const GOOGLE_SHEETS_ID_PATTERN = /^[a-zA-Z0-9-_]{20,}$/

function extractGoogleSpreadsheetId(source) {
  const raw = String(source || '').trim()

  if (!raw) {
    return ''
  }

  if (GOOGLE_SHEETS_ID_PATTERN.test(raw)) {
    return raw
  }

  const directPathMatch = raw.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/i)
  if (directPathMatch?.[1]) {
    return directPathMatch[1]
  }

  try {
    const parsed = new URL(raw)
    const pathSegments = parsed.pathname.split('/').filter(Boolean)
    const dIndex = pathSegments.findIndex((segment) => segment === 'd')

    if (dIndex >= 0 && pathSegments[dIndex + 1]) {
      return pathSegments[dIndex + 1]
    }

    const idFromQuery = parsed.searchParams.get('id')
    if (idFromQuery && GOOGLE_SHEETS_ID_PATTERN.test(idFromQuery)) {
      return idFromQuery
    }
  } catch {
    return ''
  }

  return ''
}

export function toCsvDownloadUrl(source) {
  const raw = String(source || '').trim()

  if (!raw) {
    return ''
  }

  const spreadsheetId = extractGoogleSpreadsheetId(raw)

  if (spreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv`
  }

  return raw
}

export function validateCsvSourceInput(source) {
  const raw = String(source || '').trim()

  if (!raw) {
    return {
      isValid: false,
      normalizedUrl: '',
      message: 'Informe o link da planilha ou do CSV.',
    }
  }

  const normalizedUrl = toCsvDownloadUrl(raw)

  if (!normalizedUrl) {
    return {
      isValid: false,
      normalizedUrl: '',
      message: 'Não foi possível interpretar o link informado.',
    }
  }

  const spreadsheetId = extractGoogleSpreadsheetId(raw)

  if (spreadsheetId) {
    return {
      isValid: true,
      normalizedUrl,
      message: '',
    }
  }

  try {
    const parsed = new URL(raw)

    if (!/^https?:$/i.test(parsed.protocol)) {
      return {
        isValid: false,
        normalizedUrl: '',
        message: 'Use um link HTTP ou HTTPS válido.',
      }
    }

    const host = String(parsed.hostname || '').toLowerCase()
    const path = String(parsed.pathname || '').toLowerCase()
    const looksLikeGoogleSheets =
      host.includes('google.com') || host.includes('googledocs.com') || path.includes('spreadsheets')

    if (looksLikeGoogleSheets) {
      return {
        isValid: false,
        normalizedUrl: '',
        message: 'Link do Google Sheets inválido. Não foi possível identificar o ID da planilha.',
      }
    }

    return {
      isValid: true,
      normalizedUrl,
      message: '',
    }
  } catch {
    return {
      isValid: false,
      normalizedUrl: '',
      message: 'Informe um link válido da planilha ou do CSV.',
    }
  }
}

function normalizeHeader(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
}

function getAny(source, keys) {
  for (const key of keys) {
    if (key in source && source[key] != null && source[key] !== '') {
      return source[key]
    }
  }
  return ''
}

export async function fetchAndParseCsv(url) {
  const downloadUrl = toCsvDownloadUrl(url)
  const response = await fetch(downloadUrl)

  if (!response.ok) {
    throw new Error('Falha ao baixar o CSV informado.')
  }

  const csvText = await response.text()

  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  if (parsed.errors.length) {
    throw new Error('Não foi possível interpretar o CSV.')
  }

  return parsed.data
}
