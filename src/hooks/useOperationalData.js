import { useEffect, useMemo } from 'react'

export function useOperationalData({
  baseCsv,
  destinacoes,
  empresaSelecionada,
  filtroEmpresaDestinacao,
  filtroEmpresaGerencial,
  filtroProcessoDestinacao,
  getEmpresaGroupKey,
  getValorFomentoFromProcess,
  maskCNPJ,
  sanitizeCNPJ,
  selectedProcessIds,
  selectedProcessValues,
  setSelectedProcessValues,
}) {
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
      const empresaNome = String(item.empresa || '').trim() || 'Empresa não informada'
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
  }, [baseCsv, getEmpresaGroupKey, maskCNPJ, sanitizeCNPJ])

  const empresasDestinacaoFiltradas = useMemo(() => {
    const filtro = String(filtroEmpresaDestinacao || '').toLowerCase().trim()

    if (!filtro) {
      return empresasDestinacaoOptions
    }

    return empresasDestinacaoOptions.filter((item) => item.searchIndex.includes(filtro))
  }, [empresasDestinacaoOptions, filtroEmpresaDestinacao])

  const empresaSelecionadaInfo = useMemo(
    () => empresasDestinacaoOptions.find((item) => item.key === empresaSelecionada) || null,
    [empresasDestinacaoOptions, empresaSelecionada],
  )

  const processosEmpresa = useMemo(() => {
    if (!empresaSelecionada) {
      return []
    }

    return baseCsv
      .filter((item) => {
        const empresaNome = String(item.empresa || '').trim() || 'Empresa não informada'
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
      .sort((a, b) => String(a.processoId || '').localeCompare(String(b.processoId || '')))
  }, [empresaSelecionada, baseCsv, getEmpresaGroupKey, getValorFomentoFromProcess, totalDestinadoPorProcesso])

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
  }, [processosEmpresaById, selectedProcessIds, setSelectedProcessValues])

  function getValorSelecionadoParaProcesso(item) {
    const processoId = String(item?.processoId || '')
    const saldoDisponivel = Number(item?.saldoDisponivel || 0)
    const valorSelecionado = Number(selectedProcessValues[processoId] || 0)

    if (valorSelecionado <= 0 || saldoDisponivel <= 0) {
      return 0
    }

    return Math.min(Number(valorSelecionado.toFixed(2)), saldoDisponivel)
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
  }, [filtroProcessoDestinacao, processosEmpresa])

  const totalEmFomentos = useMemo(
    () => baseCsv.reduce((acc, item) => acc + getValorFomentoFromProcess(item), 0),
    [baseCsv, getValorFomentoFromProcess],
  )

  const totalDestinado = useMemo(
    () => destinacoes.reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoes],
  )

  const totalDestinadoEmTransito = useMemo(
    () =>
      destinacoes
        .filter((item) => item.statusPagamento !== 'pago')
        .reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoes],
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

  const pendentes = useMemo(
    () => destinacoes.filter((item) => item.statusPagamento !== 'pago'),
    [destinacoes],
  )

  const resumoEmpresas = useMemo(() => {
    const mapa = new Map()
    const processoToEmpresaKey = new Map()

    function ensureEmpresaItem(empresaKey, empresaNome, cnpjMasked) {
      if (!mapa.has(empresaKey)) {
        mapa.set(empresaKey, {
          empresaKey,
          empresa: empresaNome || 'Empresa não informada',
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
      const empresa = String(processo.empresa || '').trim() || 'Empresa não informada'
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
        const empresa = String(destinacao.empresa || '').trim() || 'Empresa não informada'
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
          searchIndex: [item.cnpj, empresaPrincipal, ...Array.from(item.nomes.keys())]
            .join(' ')
            .toLowerCase(),
        }
      })
      .sort((a, b) => {
        const cnpjCompare = String(a.cnpj || '').localeCompare(String(b.cnpj || ''))

        if (cnpjCompare !== 0) {
          return cnpjCompare
        }

        return a.empresa.localeCompare(b.empresa)
      })
  }, [baseCsv, destinacoes, getEmpresaGroupKey, getValorFomentoFromProcess, maskCNPJ, sanitizeCNPJ])

  const resumoEmpresasFiltradas = useMemo(() => {
    const filtro = String(filtroEmpresaGerencial || '').toLowerCase().trim()

    if (!filtro) {
      return resumoEmpresas
    }

    return resumoEmpresas.filter((item) => item.searchIndex.includes(filtro))
  }, [filtroEmpresaGerencial, resumoEmpresas])

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

  return {
    empresaSelecionadaInfo,
    empresasDestinacaoFiltradas,
    empresasDestinacaoOptions,
    pendentes,
    processosEmpresa,
    processosEmpresaFiltrados,
    resumoEmpresas,
    resumoEmpresasFiltradas,
    resumoFiltroGerencial,
    saldoAPagar,
    saldoSemDestinacao,
    totalDestinado,
    totalDestinadoEmTransito,
    totalDestinadoPagos,
    totalEmFomentos,
    totalSelecionadoParaDestinar,
  }
}
