import { fetchAndParseCsv } from './csvService'

const UFR_PB_SHEET_ID = '1AUtQFV-Jvv8pesSi-wnhAqDulIgoUKqZ'
const UFR_PB_CSV_URL = `https://docs.google.com/spreadsheets/d/${UFR_PB_SHEET_ID}/export?format=csv`

export async function fetchCurrentUfrPbValue() {
  try {
    console.log('🔍 Buscando valor UFR-PB da planilha...', UFR_PB_CSV_URL);
    
    // Tentar com proxy CORS se necessário
    let csvData;
    try {
      csvData = await fetchAndParseCsv(UFR_PB_CSV_URL)
    } catch (corsError) {
      console.log('⚠️ Erro CORS detectado, tentando com proxy...');
      csvData = await fetchAndParseCsv(`https://api.allorigins.win/raw?url=${encodeURIComponent(UFR_PB_CSV_URL)}`);
    }
    
    if (!csvData || csvData.length < 2) {
      throw new Error('CSV vazio ou formato inválido')
    }

    // Primeira linha: meses (janeiro a dezembro)
    const months = csvData[0].slice(1).map(month => month.toLowerCase().trim())
    
    // Encontrar o mês atual (tentar nome longo e abreviado)
    const currentDate = new Date()
    const currentMonthLong = currentDate.toLocaleDateString('pt-BR', { month: 'long' }).toLowerCase()
    let currentMonthShort = currentDate.toLocaleDateString('pt-BR', { month: 'short' }).toLowerCase()
    
    // Normalizar: remover ponto final, espaços e caracteres especiais
    currentMonthShort = currentMonthShort.replace(/[.\s]/g, '')
    const normalizedMonths = months.map(m => m.replace(/[.\s]/g, ''))
    
    let currentMonthIndex = normalizedMonths.indexOf(currentMonthLong)
    if (currentMonthIndex === -1) {
      currentMonthIndex = normalizedMonths.indexOf(currentMonthShort)
    }
    
    if (currentMonthIndex === -1) {
      throw new Error(`Mês atual (${currentMonthLong} / ${currentMonthShort}) não encontrado na planilha. Meses encontrados: ${months.join(', ')}`)
    }

    // Encontrar o ano mais recente (primeira linha válida, pois os anos estão ordenados de mais recente para mais antigo)
    let currentYearValue = null
    let currentYearIndex = -1
    
    for (let rowIndex = 1; rowIndex < csvData.length; rowIndex++) {
      const yearCell = csvData[rowIndex][0]
      if (yearCell && yearCell.trim() && !isNaN(parseInt(yearCell.trim()))) {
        currentYearValue = yearCell.trim()
        currentYearIndex = rowIndex
        break
      }
    }

    if (!currentYearValue || currentYearIndex === -1) {
      throw new Error('Não foi possível encontrar o ano mais recente')
    }

    // Obter o valor da UFR-PB para o mês/ano atual
    const ufrPbValueCell = csvData[currentYearIndex][currentMonthIndex + 1]
    
    if (!ufrPbValueCell || !ufrPbValueCell.trim()) {
      throw new Error(`Valor da UFR-PB para ${currentMonthLong}/${currentYearValue} não encontrado`)
    }

    const ufrPbValue = parseFloat(ufrPbValueCell.replace(/[^0-9,.]/g, '').replace(',', '.'))
    
    if (isNaN(ufrPbValue) || ufrPbValue <= 0) {
      throw new Error(`Valor da UFR-PB inválido: ${ufrPbValue}`)
    }

    return {
      value: ufrPbValue,
      month: currentMonthLong,
      year: currentYearValue,
      date: `${currentMonthLong}/${currentYearValue}`,
      source: 'planilha-google'
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
    const csvData = await fetchAndParseCsv(UFR_PB_CSV_URL)
    
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