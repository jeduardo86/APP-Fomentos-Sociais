import Papa from 'papaparse'
import { maskCNPJ, parseCurrencyText, sanitizeCNPJ } from '../lib/formatters'

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
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error('Falha ao baixar o CSV informado.')
  }

  const csvText = await response.text()

  const parsed = Papa.parse(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: normalizeHeader,
  })

  if (parsed.errors.length) {
    throw new Error('Não foi possível interpretar o CSV.')
  }

  return parsed.data
    .map((row) => {
      const processoId = String(
        getAny(row, ['PROCESSO', 'NPROCESSO', 'NUMEROPROCESSO']),
      ).trim()

      if (!processoId) {
        return null
      }

      return {
        processoId,
        termo: String(
          getAny(row, ['NTERMO', 'TERMOAUTORIZACAO', 'TERMO', 'TERMODEAUTORIZACAO']),
        ).trim(),
        cnpj: (() => {
          const cnpjDigits = sanitizeCNPJ(
            getAny(row, ['CNPJ', 'CNPJEMPRESA', 'CPF_CNPJ', 'CPFCNPJ', 'DOCUMENTO']),
          )
          return cnpjDigits ? maskCNPJ(cnpjDigits) : ''
        })(),
        empresa: String(
          getAny(row, ['EMPRESA', 'RAZAOSOCIAL', 'EMPRESA_RAZAOSOCIAL']),
        ).trim(),
        produto: String(getAny(row, ['PRODUTOLOTERICO', 'PRODUTO'])).trim(),
        valorPremio: parseCurrencyText(
          getAny(row, ['VALORPREMIO', 'PREMIO', 'VALOR_DO_PREMIO']),
        ),
        incentivo: parseCurrencyText(
          getAny(row, ['INCENTIVO', 'VALORINCENTIVO', 'VALOR_DO_INCENTIVO']),
        ),
        valorFomento: (() => {
          const valorPremio = parseCurrencyText(
            getAny(row, ['VALORPREMIO', 'PREMIO', 'VALOR_DO_PREMIO']),
          )
          const incentivo = parseCurrencyText(
            getAny(row, ['INCENTIVO', 'VALORINCENTIVO', 'VALOR_DO_INCENTIVO']),
          )
          if (valorPremio > 0 || incentivo > 0) {
            const incentivoBase = Math.max(0, incentivo - valorPremio * 0.15)
            const baseCalculo = valorPremio + incentivoBase
            return baseCalculo * 0.075
          }
          return parseCurrencyText(
            getAny(row, ['VALORFOMENTO', 'VALORFOMENTOLOTERICO', 'VALOR']),
          )
        })(),
        syncedAt: new Date().toISOString(),
      }
    })
    .filter(Boolean)
}
