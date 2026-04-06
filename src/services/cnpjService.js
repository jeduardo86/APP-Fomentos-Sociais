function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function normalizeText(value) {
  return String(value || '').trim()
}

function pickResponsavelFromQsa(qsaList) {
  const socios = Array.isArray(qsaList) ? qsaList : []

  if (!socios.length) {
    return ''
  }

  const socioAdministrador = socios.find((item) => {
    const qualificacao = normalizeText(item?.qualificacao_socio).toLowerCase()
    return (
      qualificacao.includes('administrador') ||
      qualificacao.includes('diretor') ||
      qualificacao.includes('presidente')
    )
  })

  return normalizeText(socioAdministrador?.nome_socio) || normalizeText(socios[0]?.nome_socio)
}

function buildContato(telefone1, telefone2, email) {
  const parts = [normalizeText(telefone1), normalizeText(telefone2), normalizeText(email)].filter(Boolean)
  return parts.join(' | ')
}

export async function fetchEntidadeByCnpj(cnpjValue) {
  const cnpj = onlyDigits(cnpjValue)

  if (cnpj.length !== 14) {
    throw new Error('Informe um CNPJ valido com 14 digitos.')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 12000)

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error('CNPJ nao encontrado na consulta publica.')
    }

    const data = await response.json()

    const responsavel = pickResponsavelFromQsa(data?.qsa)
    const contato = buildContato(data?.ddd_telefone_1, data?.ddd_telefone_2, data?.correio_eletronico)

    return {
      nome: normalizeText(data?.nome_fantasia) || normalizeText(data?.razao_social),
      estado: normalizeText(data?.uf).toUpperCase(),
      municipio: normalizeText(data?.municipio),
      responsavel,
      contato,
      razaoSocial: normalizeText(data?.razao_social),
      nomeFantasia: normalizeText(data?.nome_fantasia),
    }
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error('Tempo limite excedido ao consultar CNPJ.')
    }

    throw error
  } finally {
    clearTimeout(timeoutId)
  }
}
