export function ReportsMenuSection({
  areasDestinacaoRelatorio,
  dataEmissaoRelatorioExtenso,
  destinacoesRelatorio,
  formatCurrency,
  handleBaixarRelatorioPdf,
  isGeneratingPdf,
  isProcessoRelatorioValido,
  processosParaRelatorio,
  reportContentRef,
  reportDataEmissao,
  reportProcessoId,
  saldoPagamentoRelatorio,
  setReportDataEmissao,
  setReportProcessoId,
  statusPagamentoRelatorio,
  totalDestinadoRelatorio,
  totalPagoRelatorio,
  userProfile,
  usuarioAssinaturaRelatorio,
}) {
  return (
    <section className="panel panel-soft space-y-5 sm:p-6">
      <div className="report-controls grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-3">
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="reportProcessoId">
            Processo para emissão
          </label>
          <input
            id="reportProcessoId"
            className="field-input"
            value={reportProcessoId}
            onChange={(event) => setReportProcessoId(event.target.value)}
            placeholder="Digite para pesquisar um processo"
            list="reportProcessoOptions"
          />
          <datalist id="reportProcessoOptions">
            {processosParaRelatorio.map((processoId) => (
              <option key={processoId} value={processoId}>
                {processoId}
              </option>
            ))}
          </datalist>
        </div>

        <div>
          <label className="field-label" htmlFor="reportDataEmissao">
            Data de emissão
          </label>
          <input
            id="reportDataEmissao"
            className="field-input"
            type="date"
            value={reportDataEmissao}
            onChange={(event) => setReportDataEmissao(event.target.value)}
          />
        </div>

        <div className="sm:col-span-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-zinc-600">
            Relatório formal para instrução processual sobre existência de destinação social.
          </p>
          <button
            className="btn-primary"
            type="button"
            onClick={handleBaixarRelatorioPdf}
            disabled={isGeneratingPdf || !isProcessoRelatorioValido}
          >
            {isGeneratingPdf ? 'Gerando PDF...' : 'Baixar PDF'}
          </button>
        </div>
      </div>

      <div className="report-print-area">
        <article
          ref={reportContentRef}
          className="report-a4 rounded-2xl border border-slate-200 bg-white text-zinc-900 shadow-sm"
        >
          <header className="border-b border-zinc-300 pb-3 text-center">
            <p className="text-base font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Governo do Estado da Paraiba
            </p>
            <p className="mt-1 text-base font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Loteria do Estado da Paraíba
            </p>
            <p className="mt-1 text-base font-semibold uppercase tracking-[0.16em] text-zinc-600">
              Assessoria de Políticas Públicas
            </p>
            <br />
            <br />
            <h2 className="mt-2 text-base font-semibold uppercase tracking-[0.08em] text-zinc-900">
              Relatório de Verificação de Destinação Social
            </h2>
          </header>

          <section className="mt-6 space-y-4 text-justify text-[13.5px] leading-relaxed text-zinc-800">
            {!reportProcessoId && (
              <p>Selecione um processo para gerar o relatório institucional de verificação de destinação social.</p>
            )}

            {reportProcessoId && (
              <>
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-justify text-[12.5px] leading-relaxed text-zinc-700">
                  <p>
                    De acordo com a Instrução Normativa nº 001/2024, que regulamenta a modalidade passiva,
                    os recursos correspondentes a <strong>7,5% da totalidade dos prêmios</strong> devem ser
                    destinados ao fomento de ações e projetos nas áreas de Assistência, Desportos, Educação,
                    Saúde e Desenvolvimento Social. Essas ações devem ser executadas pelo operador lotérico autorizado
                    em parceria com a LOTEP. O Decreto nº 44.576/2023 também inclui a{' '}
                    <strong>Segurança Pública</strong> entre as áreas contempladas.
                  </p>
                </div>

                <p>
                  Em atendimento à consulta formalizada nos autos do processo administrativo nº{' '}
                  <strong>{reportProcessoId}</strong>, certifica-se a situação da destinação social a ele
                  vinculada.
                </p>

                {destinacoesRelatorio.length > 0 ? (
                  <>
                    <p>
                      Após análise dos registros institucionais disponíveis no sistema de controle de
                      fomentos, <strong>constata-se que houve destinação social de recursos</strong> para o
                      referido processo, no montante total de{' '}
                      <strong>{formatCurrency(totalDestinadoRelatorio)}</strong>.
                    </p>

                    <p>
                      As áreas contempladas pela destinação no processo são:{' '}
                      <strong>{areasDestinacaoRelatorio.join('; ') || 'Área não identificada'}</strong>.
                    </p>

                    {statusPagamentoRelatorio === 'pago' && (
                      <p>
                        Quanto ao pagamento, verifica-se que o valor destinado encontra-se
                        <strong> integralmente pago</strong>, no total de{' '}
                        <strong>{formatCurrency(totalPagoRelatorio)}</strong>.
                      </p>
                    )}

                    {statusPagamentoRelatorio === 'parcial' && (
                      <p>
                        Quanto ao pagamento, verifica-se quitação <strong>parcial</strong>, com total pago de{' '}
                        <strong>{formatCurrency(totalPagoRelatorio)}</strong> e saldo pendente de{' '}
                        <strong>{formatCurrency(saldoPagamentoRelatorio)}</strong>.
                      </p>
                    )}

                    {statusPagamentoRelatorio === 'nao-pago' && (
                      <p>
                        Quanto ao pagamento, <strong>não há registro de quitação</strong> até a presente
                        data.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <p>
                      Após análise dos registros institucionais disponíveis no sistema de controle de
                      fomentos, <strong>não foram localizadas destinações sociais registradas</strong> para o
                      processo informado até a presente data.
                    </p>
                    <p>
                      O presente relatório é emitido para fins de instrução processual, com vistas à
                      comprovação formal da inexistência de destinação social registrada no âmbito do processo
                      em epígrafe.
                    </p>
                  </>
                )}

                <p>João Pessoa, {dataEmissaoRelatorioExtenso}.</p>
              </>
            )}
          </section>

          <footer className="mt-16 text-center">
            <p className="mt-10 text-sm font-semibold uppercase tracking-[0.06em] text-zinc-900">
              {usuarioAssinaturaRelatorio}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.06em] text-zinc-600">
              {userProfile?.cargo || 'CARGO/FUNCAO'}
            </p>
          </footer>
        </article>
      </div>
    </section>
  )
}
