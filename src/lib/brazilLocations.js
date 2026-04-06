export const BRAZIL_STATES = [
  { sigla: 'AC', nome: 'Acre' },
  { sigla: 'AL', nome: 'Alagoas' },
  { sigla: 'AP', nome: 'Amapa' },
  { sigla: 'AM', nome: 'Amazonas' },
  { sigla: 'BA', nome: 'Bahia' },
  { sigla: 'CE', nome: 'Ceara' },
  { sigla: 'DF', nome: 'Distrito Federal' },
  { sigla: 'ES', nome: 'Espirito Santo' },
  { sigla: 'GO', nome: 'Goias' },
  { sigla: 'MA', nome: 'Maranhao' },
  { sigla: 'MT', nome: 'Mato Grosso' },
  { sigla: 'MS', nome: 'Mato Grosso do Sul' },
  { sigla: 'MG', nome: 'Minas Gerais' },
  { sigla: 'PA', nome: 'Para' },
  { sigla: 'PB', nome: 'Paraiba' },
  { sigla: 'PR', nome: 'Parana' },
  { sigla: 'PE', nome: 'Pernambuco' },
  { sigla: 'PI', nome: 'Piaui' },
  { sigla: 'RJ', nome: 'Rio de Janeiro' },
  { sigla: 'RN', nome: 'Rio Grande do Norte' },
  { sigla: 'RS', nome: 'Rio Grande do Sul' },
  { sigla: 'RO', nome: 'Rondonia' },
  { sigla: 'RR', nome: 'Roraima' },
  { sigla: 'SC', nome: 'Santa Catarina' },
  { sigla: 'SP', nome: 'Sao Paulo' },
  { sigla: 'SE', nome: 'Sergipe' },
  { sigla: 'TO', nome: 'Tocantins' },
]

const CAPITAL_BY_STATE = {
  AC: 'Rio Branco',
  AL: 'Maceio',
  AP: 'Macapa',
  AM: 'Manaus',
  BA: 'Salvador',
  CE: 'Fortaleza',
  DF: 'Brasilia',
  ES: 'Vitoria',
  GO: 'Goiania',
  MA: 'Sao Luis',
  MT: 'Cuiaba',
  MS: 'Campo Grande',
  MG: 'Belo Horizonte',
  PA: 'Belem',
  PB: 'JOAO PESSOA',
  PR: 'Curitiba',
  PE: 'Recife',
  PI: 'Teresina',
  RJ: 'Rio de Janeiro',
  RN: 'Natal',
  RS: 'Porto Alegre',
  RO: 'Porto Velho',
  RR: 'Boa Vista',
  SC: 'Florianopolis',
  SP: 'Sao Paulo',
  SE: 'Aracaju',
  TO: 'Palmas',
}

const MUNICIPIOS_CACHE_KEY = 'app_fomentos_municipios_by_estado_v1'
const IBGE_ENDPOINT = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'
const IBGE_FETCH_TIMEOUT_MS = 12000

function createEmptyGroupedMunicipios() {
  const grouped = {}

  BRAZIL_STATES.forEach((state) => {
    grouped[state.sigla] = []
  })

  return grouped
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

export function sortMunicipiosByCapitalFirst(municipios, estadoSigla) {
  const capital = CAPITAL_BY_STATE[String(estadoSigla || '').toUpperCase()]
  const normalizedCapital = normalizeText(capital)

  return [...municipios].sort((a, b) => {
    const aNormalized = normalizeText(a)
    const bNormalized = normalizeText(b)
    const aIsCapital = normalizedCapital && aNormalized === normalizedCapital
    const bIsCapital = normalizedCapital && bNormalized === normalizedCapital

    if (aIsCapital !== bIsCapital) {
      return aIsCapital ? -1 : 1
    }

    return String(a || '').localeCompare(String(b || ''), 'pt-BR')
  })
}

function normalizeGroupedMunicipios(grouped) {
  const normalized = createEmptyGroupedMunicipios()

  Object.keys(normalized).forEach((sigla) => {
    const values = Array.isArray(grouped?.[sigla]) ? grouped[sigla] : []
    const cleaned = values
      .map((item) => String(item || '').trim())
      .filter(Boolean)

    normalized[sigla] = sortMunicipiosByCapitalFirst(Array.from(new Set(cleaned)), sigla)
  })

  return normalized
}

function buildCapitalFallbackGroupedMunicipios() {
  const grouped = createEmptyGroupedMunicipios()

  Object.keys(grouped).forEach((sigla) => {
    const capital = CAPITAL_BY_STATE[sigla]
    grouped[sigla] = capital ? [capital] : []
  })

  return grouped
}

function readMunicipiosCache() {
  if (typeof window === 'undefined' || !window.localStorage) {
    return null
  }

  try {
    const raw = window.localStorage.getItem(MUNICIPIOS_CACHE_KEY)

    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw)
    return normalizeGroupedMunicipios(parsed)
  } catch {
    return null
  }
}

function writeMunicipiosCache(grouped) {
  if (typeof window === 'undefined' || !window.localStorage) {
    return
  }

  try {
    window.localStorage.setItem(MUNICIPIOS_CACHE_KEY, JSON.stringify(grouped))
  } catch {
    // Ignora falha de cache local (quota, modo privado, etc.).
  }
}

async function fetchIbgeMunicipios() {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), IBGE_FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(IBGE_ENDPOINT, { signal: controller.signal })

    if (!response.ok) {
      throw new Error('Falha ao carregar municipios brasileiros.')
    }

    return await response.json()
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function fetchMunicipiosByEstado() {
  try {
    const rawMunicipios = await fetchIbgeMunicipios()
    const grouped = createEmptyGroupedMunicipios()

    rawMunicipios.forEach((item) => {
      const municipioNome = String(item?.nome || '').trim()
      const estadoSigla = String(item?.microrregiao?.mesorregiao?.UF?.sigla || '')
        .trim()
        .toUpperCase()

      if (!municipioNome || !grouped[estadoSigla]) {
        return
      }

      grouped[estadoSigla].push(municipioNome)
    })

    const normalized = normalizeGroupedMunicipios(grouped)
    writeMunicipiosCache(normalized)
    return normalized
  } catch {
    const cached = readMunicipiosCache()

    if (cached) {
      return cached
    }

    return buildCapitalFallbackGroupedMunicipios()
  }
}
