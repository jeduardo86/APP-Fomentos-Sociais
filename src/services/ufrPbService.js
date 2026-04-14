import Papa from 'papaparse'

const UFR_PB_SHEET_ID = '1AUtQFV-Jvv8pesSi-wnhAqDulIgoUKqZ'
const UFR_PB_CSV_URL = `https://docs.google.com/spreadsheets/d/${UFR_PB_SHEET_ID}/export?format=csv`

function parseUfrPbCsvMatrix(csvText) {
  const parsed = Papa.parse(csvText, {
    header: false,
    skipEmptyLines: true,
  })

  if (parsed.errors.length) {
    throw new Error('Não foi possível interpretar o CSV da UFR-PB.')
  }

  return parsed.data
}

async function fetchUfrPbCsvMatrix() {
  try {
    const response = await fetch(UFR_PB_CSV_URL)

    if (!response.ok) {
      throw new Error('Falha ao baixar a tabela da UFR-PB.')
    }

    return parseUfrPbCsvMatrix(await response.text())
  } catch (corsError) {
    console.log('⚠️ Erro ao acessar UFR-PB diretamente, tentando com proxy...')

    const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(UFR_PB_CSV_URL)}`
    const proxyResponse = await fetch(proxyUrl)

    if (!proxyResponse.ok) {
      throw new Error('Falha ao baixar a tabela da UFR-PB.')
    }

    return parseUfrPbCsvMatrix(await proxyResponse.text())
  }
}

function normalizeMonthLabel(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[.\s]/g, '')
    .trim()
}

function parseMonthYearFromDate(value) {
  const raw = String(value || '').trim()

  if (!raw) {
    return null
  }

  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (brMatch) {
    return {
      month: Number(brMatch[2]),
      year: Number(brMatch[3]),
    }
  }

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return {
      month: Number(isoMatch[2]),
      year: Number(isoMatch[1]),
    }
  }

  return null
}

function extractUfrPbValueFromMatrix(csvData, month, year) {
  if (!csvData || csvData.length < 2) {
    throw new Error('CSV vazio ou formato inválido')
  }

  const months = csvData[0].slice(1).map((item) => String(item || '').trim())
  const normalizedMonths = months.map(normalizeMonthLabel)
  const monthDate = new Date(year, month - 1, 1)
  const monthLong = monthDate.toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase()
  const monthShort = monthDate.toLocaleDateString('pt-BR', { month: 'short' }).toLowerCase()
  const targetMonthVariants = [normalizeMonthLabel(monthLong), normalizeMonthLabel(monthShort)]

  let monthIndex = normalizedMonths.findIndex((item) => targetMonthVariants.includes(item))

  if (monthIndex === -1) {
    throw new Error(`Mês ${String(month).padStart(2, '0')}/${year} não encontrado na planilha da UFR-PB.`)
  }

  let yearIndex = -1
  for (let rowIndex = 1; rowIndex < csvData.length; rowIndex++) {
    const rowYear = Number.parseInt(String(csvData[rowIndex][0] || '').trim(), 10)
    if (rowYear === year) {
      yearIndex = rowIndex
      break
    }
  }

  if (yearIndex === -1) {
    throw new Error(`Ano ${year} não encontrado na planilha da UFR-PB.`)
  }

  const ufrPbValueCell = String(csvData[yearIndex][monthIndex + 1] || '').trim()
  if (!ufrPbValueCell) {
    throw new Error(`Valor da UFR-PB para ${String(month).padStart(2, '0')}/${year} não encontrado.`)
  }

  const ufrPbValue = parseFloat(ufrPbValueCell.replace(/[^0-9,.]/g, '').replace(',', '.'))
  if (!Number.isFinite(ufrPbValue) || ufrPbValue <= 0) {
    throw new Error(`Valor da UFR-PB inválido para ${String(month).padStart(2, '0')}/${year}.`)
  }

  return {
    value: ufrPbValue,
    month: months[monthIndex],
    year: String(year),
    competencia: `${String(month).padStart(2, '0')}/${year}`,
    source: 'planilha-google',
  }
}

export async function fetchUfrPbValueByDate(dateInput) {
  const monthYear = parseMonthYearFromDate(dateInput)

  if (!monthYear) {
    throw new Error('Data de exploração inválida para localizar a UFR-PB.')
  }

  const csvData = await fetchUfrPbCsvMatrix()
  return extractUfrPbValueFromMatrix(csvData, monthYear.month, monthYear.year)
}

export async function fetchCurrentUfrPbValue() {
  try {
    const currentDate = new Date()
    const csvData = await fetchUfrPbCsvMatrix()
    const result = extractUfrPbValueFromMatrix(csvData, currentDate.getMonth() + 1, currentDate.getFullYear())

    return {
      value: result.value,
      month: result.month,
      year: result.year,
      date: result.competencia,
      source: result.source,
    }
  } catch (error) {
    console.error('Erro ao buscar UFR-PB da planilha:', error)
    
    // Fallback para valor padrão
    return {
      value: 72.41, // Valor padrão atualizado Abril/2026
      month: new Date().toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase(),
      year: new Date().getFullYear().toString(),
      date: 'não disponível',
      source: 'padrão'
    }
  }
}

export async function fetchUfrPbHistory() {
  try {
    const csvData = await fetchUfrPbCsvMatrix()
    
    if (!csvData || csvData.length < 2) {
      throw new Error('CSV vazio ou formato inválido')
    }

    const history = []
    
    // Primeira linha: meses (janeiro a dezembro)
    const months = csvData[0].slice(1).map(month => month.toLowerCase().trim())
    
    // Processar cada ano
    for (let rowIndex = 1; rowIndex < csvData.length; rowIndex++) {
      const yearCell = csvData[rowIndex][0]
      if (!yearCell || !yearCell.trim()) continue
      
      const year = yearCell.trim()
      const yearData = { year, values: [] }
      
      // Processar cada mês do ano
      for (let colIndex = 1; colIndex < csvData[rowIndex].length; colIndex++) {
        const month = months[colIndex - 1]
        const valueCell = csvData[rowIndex][colIndex]
        
        if (month && valueCell && valueCell.trim()) {
          const value = parseFloat(valueCell.replace(/[^\\d.]/g, ''))
          if (!isNaN(value) && value > 0) {
            yearData.values.push({
              month,
              value,
              date: `${month}/${year}`
            })
          }
        }
      }
      
      if (yearData.values.length > 0) {
        history.push(yearData)
      }
    }

    return history
  } catch (error) {
    console.error('Erro ao buscar histórico da UFR-PB:', error)
    return []
  }
}

export async function getUfrPbInfo() {
  try {
    const [currentValue, history] = await Promise.all([
      fetchCurrentUfrPbValue(),
      fetchUfrPbHistory()
    ])

    return {
      currentValue,
      history,
      lastUpdated: new Date().toISOString(),
      source: 'planilha-google'
    }
  } catch (error) {
    console.error('Erro ao obter informações completas da UFR-PB:', error)
    return null
  }
}