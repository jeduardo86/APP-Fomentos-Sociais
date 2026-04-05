import { useMemo } from 'react'

export function useReportData({
  baseCsv,
  categoriaOptions,
  destinacoes,
  entidades,
  reportDataEmissao,
  reportProcessoId,
  user,
  userProfile,
}) {
  const processosParaRelatorio = useMemo(
    () =>
      Array.from(
        new Set(baseCsv.map((item) => String(item.processoId || '').trim()).filter(Boolean)),
      ).sort((a, b) => a.localeCompare(b)),
    [baseCsv],
  )

  const reportProcessoIdNormalizado = useMemo(
    () => String(reportProcessoId || '').trim(),
    [reportProcessoId],
  )

  const isProcessoRelatorioValido = useMemo(
    () =>
      Boolean(reportProcessoIdNormalizado) &&
      processosParaRelatorio.includes(reportProcessoIdNormalizado),
    [processosParaRelatorio, reportProcessoIdNormalizado],
  )

  const destinacoesRelatorio = useMemo(() => {
    const processoId = reportProcessoIdNormalizado

    if (!processoId) {
      return []
    }

    return destinacoes
      .filter((item) => String(item.processoId || '').trim() === processoId)
      .sort((a, b) => String(a.solicitacaoData || '').localeCompare(String(b.solicitacaoData || '')))
  }, [destinacoes, reportProcessoIdNormalizado])

  const totalDestinadoRelatorio = useMemo(
    () => destinacoesRelatorio.reduce((acc, item) => acc + Number(item.valorDestinado || 0), 0),
    [destinacoesRelatorio],
  )

  const totalPagoRelatorio = useMemo(
    () => destinacoesRelatorio.reduce((acc, item) => acc + Number(item.valorPagoAcumulado || 0), 0),
    [destinacoesRelatorio],
  )

  const saldoPagamentoRelatorio = useMemo(
    () => Math.max(0, totalDestinadoRelatorio - totalPagoRelatorio),
    [totalDestinadoRelatorio, totalPagoRelatorio],
  )

  const statusPagamentoRelatorio = useMemo(() => {
    if (!destinacoesRelatorio.length) {
      return 'sem-destinacao'
    }

    if (totalPagoRelatorio <= 0) {
      return 'nao-pago'
    }

    if (saldoPagamentoRelatorio <= 0.009) {
      return 'pago'
    }

    return 'parcial'
  }, [destinacoesRelatorio, totalPagoRelatorio, saldoPagamentoRelatorio])

  const areasDestinacaoRelatorio = useMemo(() => {
    const categoriaLabelByValue = new Map(categoriaOptions.map((item) => [item.value, item.label]))

    return Array.from(
      new Set(
        destinacoesRelatorio
          .map((item) => {
            const entidade = entidades.find((entry) => entry.id === item.entidadeId)
            const categoriaValue = String(entidade?.categoria || '').trim()

            if (!categoriaValue) {
              return ''
            }

            return categoriaLabelByValue.get(categoriaValue) || categoriaValue
          })
          .filter(Boolean),
      ),
    ).sort((a, b) => a.localeCompare(b))
  }, [destinacoesRelatorio, entidades, categoriaOptions])

  const usuarioAssinaturaRelatorio =
    userProfile?.nome || user?.displayName || user?.email || userProfile?.email || 'Usuário responsável'

  const dataEmissaoRelatorioExtenso = useMemo(() => {
    const fallbackDate = new Date()
    const date = reportDataEmissao ? new Date(`${reportDataEmissao}T12:00:00`) : fallbackDate
    const validDate = Number.isNaN(date.getTime()) ? fallbackDate : date

    return validDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  }, [reportDataEmissao])

  return {
    areasDestinacaoRelatorio,
    dataEmissaoRelatorioExtenso,
    destinacoesRelatorio,
    isProcessoRelatorioValido,
    processosParaRelatorio,
    reportProcessoIdNormalizado,
    saldoPagamentoRelatorio,
    statusPagamentoRelatorio,
    totalDestinadoRelatorio,
    totalPagoRelatorio,
    usuarioAssinaturaRelatorio,
  }
}
