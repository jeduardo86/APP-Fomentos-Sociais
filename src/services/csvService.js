import Papa from 'papaparse'
import { maskCNPJ, parseCurrencyText, sanitizeCNPJ } from '../lib/formatters'
import { competenciaFromDate as competenciaFromIsoDate } from '../lib/appUtils'
import { fetchUfrPbValueByDate } from './ufrPbService'

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

function normalizeExplorationStartDate(rawValue) {
  const raw = String(rawValue || '').trim()

  if (!raw) {
    return ''
  }

  // ISO (YYYY-MM-DD)
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return raw
  }

  // Slash date: could be BR (DD/MM/YYYY) or US (MM/DD/YYYY)
  const slashMatch = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (slashMatch) {
    const a = Number(slashMatch[1])
    const b = Number(slashMatch[2])
    const y = slashMatch[3]

    // Disambig rules:
    // - If first > 12 => clearly DD/MM (BR)
    // - Else if second > 12 => clearly MM/DD (US)
    // - Else ambiguous (both <= 12): prefer US (MM/DD) per fonte atual do CSV
    if (a > 12 && b >= 1 && b <= 12) {
      // BR: DD/MM/YYYY -> YYYY-MM-DD
      const dd = String(a).padStart(2, '0')
      const mm = String(b).padStart(2, '0')
      return `${y}-${mm}-${dd}`
    }

    // Default and when b > 12: US: MM/DD/YYYY -> YYYY-MM-DD
    const mm = String(a).padStart(2, '0')
    const dd = String(b).padStart(2, '0')
    return `${y}-${mm}-${dd}`
  }

  return ''
}

// Normaliza datas em formatos comuns (DD/MM/AAAA ou AAAA-MM-DD)
function normalizeGenericDate(rawValue) {
  return normalizeExplorationStartDate(rawValue)
}

function parseCsvMatrix(csvText) {
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  if (parsed.errors.length) {
    throw new Error('Não foi possível interpretar o CSV.')
  }

  return parsed.data
}

async function parseCsvRecords(csvText) {
  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })

  if (parsed.errors.length) {
    throw new Error('Não foi possível interpretar o CSV.')
  }

  const syncedAt = new Date().toISOString()

  return Promise.all(parsed.data.map(async (row, index) => {
    const processoId = String(getAny(row, ['PROCESSO', 'NPROCESSO', 'NUMEROPROCESSO'])).trim()
    const valorPremio = parseCurrencyText(
      getAny(row, ['VALORPREMIO', 'PREMIO', 'VALOR_DO_PREMIO']),
    )
    const incentivo = parseCurrencyText(
      getAny(row, ['INCENTIVO', 'VALORINCENTIVO', 'VALOR_DO_INCENTIVO']),
    )
    const periodoExploracaoStart = normalizeExplorationStartDate(
      getAny(row, [
        'PERIODODEEXPLORACAOSTART',
        'PERIODOEXPLORACAOSTART',
        'DATADEEXPLORACAOSTART',
        'DATAINICIOEXPLORACAO',
      ]),
    )

    // Preferir a data de autorização (termo) como referência da UFR
    const dataAutorizacao = normalizeGenericDate(
      getAny(row, [
        'DATADEAUTORIZACAO',
        'DATAAUTORIZACAO',
        'DATADOTERMODEAUTORIZACAO',
        'DATATERMODEAUTORIZACAO',
        'DATADOTERMO',
        'DATATERMO',
        'DATA_TERMO',
        'DATA_DO_TERMO',
        'DATA_DO_TERMO_DE_AUTORIZACAO',
      ]),
    )

    const valorFomentoCalculado =
      valorPremio > 0 || incentivo > 0
        ? (valorPremio + Math.max(0, incentivo - valorPremio * 0.15)) * 0.075
        : parseCurrencyText(getAny(row, ['VALORFOMENTO', 'VALORFOMENTOLOTERICO', 'VALOR']))

    let ufrPbCompetencia = ''
    let ufrPbUnitValue = 0
    let valorFomentoMinimo = 0

    // Data usada para buscar a UFR: autorização > início da exploração
    const ufrBaseDate = dataAutorizacao || periodoExploracaoStart

    if (ufrBaseDate) {
      try {
        const ufrPbInfo = await fetchUfrPbValueByDate(ufrBaseDate)
        // Força competência no padrão MM/AAAA a partir da data base ISO; fallback para a vinda do serviço
        ufrPbCompetencia = competenciaFromIsoDate(ufrBaseDate) || ufrPbInfo.competencia
        ufrPbUnitValue = Number(ufrPbInfo.value || 0)
        valorFomentoMinimo = ufrPbUnitValue > 0 ? ufrPbUnitValue * 60 : 0
      } catch (error) {
        console.warn(
          `Não foi possível obter a UFR-PB para o processo ${processoId || index + 1}:`,
          error,
        )
      }
    }

    const valorFomento = Math.max(valorFomentoCalculado, valorFomentoMinimo)

    return {
      __csvDataRowNumber: index + 1,
      processoId,
      termo: String(
        getAny(row, ['NTERMO', 'TERMOAUTORIZACAO', 'TERMO', 'TERMODEAUTORIZACAO']),
      ).trim(),
      // Data de autorização exibida/registrada passa a ser a mesma base usada para UFR
      dataAutorizacao: ufrBaseDate || dataAutorizacao || periodoExploracaoStart || '',
      cnpj: (() => {
        const cnpjDigits = sanitizeCNPJ(
          getAny(row, ['CNPJ', 'CNPJEMPRESA', 'CPF_CNPJ', 'CPFCNPJ', 'DOCUMENTO']),
        )
        return cnpjDigits ? maskCNPJ(cnpjDigits) : ''
      })(),
      empresa: String(getAny(row, ['EMPRESA', 'RAZAOSOCIAL', 'EMPRESA_RAZAOSOCIAL'])).trim(),
      produto: String(getAny(row, ['PRODUTOLOTERICO', 'PRODUTO'])).trim(),
      periodoExploracaoStart,
      ufrBaseDate,
      ufrPbCompetencia,
      ufrPbUnitValue,
      valorFomentoMinimo,
      valorPremio,
      incentivo,
      valorFomento,
      syncedAt,
    }
  }))
}

export async function fetchAndParseCsv(url, options = {}) {
  const downloadUrl = toCsvDownloadUrl(url)
  const response = await fetch(downloadUrl)

  if (!response.ok) {
    throw new Error('Falha ao baixar o CSV informado.')
  }

  const csvText = await response.text()
  const format = options?.format === 'raw' ? 'raw' : 'records'

  if (format === 'raw') {
    return parseCsvMatrix(csvText)
  }

  return parseCsvRecords(csvText)
}
