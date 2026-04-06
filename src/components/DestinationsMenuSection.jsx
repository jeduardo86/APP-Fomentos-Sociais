import { NumericFormat } from 'react-number-format'
import { pagamentoOptions } from '../lib/constants'

export function DestinationsMenuSection({
  activeTab,
  competenciaFromDate,
  createInitialEntidadeForm,
  destForm,
  empresasDestinacaoFiltradas,
  empresaSelecionada,
  empresaSelecionadaInfo,
  entidades,
  filtroEmpresaDestinacao,
  filtroEmpresaGerencial,
  filtroProcessoDestinacao,
  formatCurrency,
  formatCurrencyCompact,
  formatDateBR,
  getBaseCalculoFomentoFromProcess,
  handleConfirmarPagamento,
  handleIniciarDestinacaoPorEmpresa,
  handleSalvarDestinacao,
  destinationTabs,
  pagamentoForm,
  pendentes,
  processosEmpresa,
  processosEmpresaFiltrados,
  resumoEmpresas,
  resumoEmpresasFiltradas,
  resumoFiltroGerencial,
  selectedProcessIds,
  selectedProcessValues,
  setActiveTab,
  setDestForm,
  setEditingEntidadeId,
  setEmpresaSelecionada,
  setEntidadeForm,
  setFiltroEmpresaDestinacao,
  setFiltroEmpresaGerencial,
  setFiltroProcessoDestinacao,
  setIsEntidadeModalOpen,
  setPagamentoForm,
  setSelectedProcessIds,
  setSelectedProcessValues,
  toCompetenciaMask,
  totalSelecionadoParaDestinar,
}) {
  return (
    <article className="panel panel-soft sm:p-6">
      <nav className="rounded-2xl border border-slate-200/70 bg-white/70 p-2" aria-label="Navegação de destinações">
        <div className="flex flex-wrap gap-2">
          {destinationTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={activeTab === tab.id ? 'tab tab-active' : 'tab'}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {activeTab === 'destinacao' && (
        <section className="mt-5 space-y-5 animate-in">
          <h2 className="text-lg font-semibold text-zinc-900">Formulário de destinação</h2>

          <div>
            <label className="field-label" htmlFor="filtroEmpresaDestinacao">
              Buscar empresa (CNPJ ou nome)
            </label>
            <input
              id="filtroEmpresaDestinacao"
              className="field-input"
              value={filtroEmpresaDestinacao}
              onChange={(event) => setFiltroEmpresaDestinacao(event.target.value)}
              placeholder="Ex: 12.345.678/0001-90 ou razão social"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="empresaSelecionada">
              Empresa
            </label>
            <select
              id="empresaSelecionada"
              className="field-input"
              value={empresaSelecionada}
              onChange={(event) => {
                setEmpresaSelecionada(event.target.value)
                setSelectedProcessIds([])
                setSelectedProcessValues({})
              }}
            >
              <option value="">Selecione</option>
              {empresasDestinacaoFiltradas.map((empresa) => (
                <option key={empresa.key} value={empresa.key}>
                  {empresa.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-cyan-50 p-4 text-sm sm:grid-cols-2">
            <div>
              <p className="text-zinc-500">Empresa selecionada</p>
              <p className="font-medium text-zinc-900">{empresaSelecionadaInfo?.empresa || '--'}</p>
              <p className="text-xs text-zinc-500">CNPJ: {empresaSelecionadaInfo?.cnpj || '--'}</p>
            </div>
            <div>
              <p className="text-zinc-500">Processos disponíveis</p>
              <p className="font-medium text-zinc-900">{processosEmpresa.length}</p>
            </div>
            <div>
              <p className="text-zinc-500">Processos selecionados</p>
              <p className="font-medium text-zinc-900">{selectedProcessIds.length}</p>
            </div>
            <div>
              <p className="text-zinc-500">Valor total calculado</p>
              <p className="font-semibold text-emerald-700">{formatCurrency(totalSelecionadoParaDestinar)}</p>
            </div>
          </div>

          <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-800">Processos para destinação</p>
              {processosEmpresaFiltrados.length > 0 && (
                <button
                  type="button"
                  className="text-sm font-semibold text-cyan-700 hover:underline"
                  onClick={() => {
                    const processIds = processosEmpresaFiltrados.map((item) => item.processoId)
                    const merged = new Set([...selectedProcessIds, ...processIds])
                    setSelectedProcessIds(Array.from(merged))
                    setSelectedProcessValues((current) => {
                      const next = { ...current }
                      processosEmpresaFiltrados.forEach((item) => {
                        if (!next[item.processoId] || next[item.processoId] <= 0) {
                          next[item.processoId] = Number(item.saldoDisponivel.toFixed(2))
                        }
                      })
                      return next
                    })
                  }}
                >
                  Marcar todos
                </button>
              )}
            </div>

            {processosEmpresa.length > 0 && (
              <input
                className="field-input"
                value={filtroProcessoDestinacao}
                onChange={(event) => setFiltroProcessoDestinacao(event.target.value)}
                placeholder="Filtrar por processo, termo ou produto"
              />
            )}

            {processosEmpresa.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum processo com saldo disponível para a empresa.</p>
            )}

            {processosEmpresa.length > 0 && processosEmpresaFiltrados.length === 0 && (
              <p className="text-sm text-zinc-500">Nenhum processo encontrado para o filtro informado.</p>
            )}

            {processosEmpresaFiltrados.length > 0 && (
              <ul className="max-h-[30rem] space-y-2 overflow-auto">
                {processosEmpresaFiltrados.map((item) => {
                  const checked = selectedProcessIds.includes(item.processoId)

                  return (
                    <li key={item.processoId} className="rounded-xl border border-slate-200 p-3">
                      <label className="flex cursor-pointer items-start gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(event) => {
                            setSelectedProcessIds((current) => {
                              if (event.target.checked) {
                                setSelectedProcessValues((values) => ({
                                  ...values,
                                  [item.processoId]: Number(item.saldoDisponivel.toFixed(2)),
                                }))
                                return [...current, item.processoId]
                              }

                              setSelectedProcessValues((values) => {
                                const next = { ...values }
                                delete next[item.processoId]
                                return next
                              })

                              return current.filter((id) => id !== item.processoId)
                            })
                          }}
                        />
                        <span>
                          <span className="font-semibold text-zinc-900">{item.processoId}</span>
                          <span className="ml-2 text-zinc-500">Termo de Autorização: {item.termo || 'Sem termo'}</span>
                          <span className="mt-1 block text-zinc-600">
                            Valor Premio: {formatCurrency(item.valorPremio || 0)} | Incentivo:{' '}
                            {formatCurrency(item.incentivo || 0)}
                          </span>
                          <span className="mt-1 block text-zinc-600">
                            Base de calculo: {formatCurrency(getBaseCalculoFomentoFromProcess(item))}
                          </span>
                          <span className="mt-1 block text-emerald-700">
                            Saldo disponível: {formatCurrency(item.saldoDisponivel)}
                          </span>
                          {checked && (
                            <span className="mt-2 block">
                              <span className="mb-1 block text-sm font-medium text-zinc-600">
                                Valor destinado para este processo
                              </span>
                              <NumericFormat
                                className="field-input"
                                thousandSeparator="."
                                decimalSeparator=","
                                prefix="R$ "
                                decimalScale={2}
                                fixedDecimalScale
                                allowNegative={false}
                                value={selectedProcessValues[item.processoId] || 0}
                                onValueChange={(values) => {
                                  const value = Math.max(
                                    0,
                                    Math.min(
                                      Number(values.floatValue || 0),
                                      Number(item.saldoDisponivel || 0),
                                    ),
                                  )

                                  setSelectedProcessValues((current) => ({
                                    ...current,
                                    [item.processoId]: Number(value.toFixed(2)),
                                  }))
                                }}
                              />
                            </span>
                          )}
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSalvarDestinacao}>
            <div>
              <label className="field-label" htmlFor="solicitacaoData">
                Data de solicitação
              </label>
              <input
                id="solicitacaoData"
                className="field-input"
                type="date"
                value={destForm.solicitacaoData}
                onChange={(event) =>
                  setDestForm((current) => {
                    const solicitacaoData = event.target.value
                    return {
                      ...current,
                      solicitacaoData,
                      competencia: competenciaFromDate(solicitacaoData),
                    }
                  })
                }
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label className="field-label mb-0" htmlFor="entidadeId">
                  Entidade
                </label>
                <button
                  type="button"
                  className="text-sm font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline"
                  onClick={() => {
                    setEditingEntidadeId('')
                    setEntidadeForm(createInitialEntidadeForm())
                    setIsEntidadeModalOpen(true)
                  }}
                >
                  Nova entidade
                </button>
              </div>
              <select
                id="entidadeId"
                className="field-input"
                value={destForm.entidadeId}
                onChange={(event) =>
                  setDestForm((current) => ({ ...current, entidadeId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {entidades.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.nome}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="competencia">
                Competência (MM/AAAA)
              </label>
              <input
                id="competencia"
                className="field-input"
                value={destForm.competencia}
                onChange={(event) =>
                  setDestForm((current) => ({
                    ...current,
                    competencia: toCompetenciaMask(event.target.value),
                  }))
                }
                placeholder="04/2026"
              />
            </div>

            <div className="sm:col-span-2">
              <button className="btn-primary w-full" type="submit">
                Salvar destinação
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === 'pagamento' && (
        <section className="mt-5 space-y-4 animate-in">
          <h2 className="text-lg font-semibold text-zinc-900">Confirmação de pagamento</h2>
          <p className="text-sm text-zinc-600">A lista exibe destinações em aberto (pendente ou parcial).</p>

          <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleConfirmarPagamento}>
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="destinacaoId">
                Destinação pendente
              </label>
              <select
                id="destinacaoId"
                className="field-input"
                value={pagamentoForm.destinacaoId}
                onChange={(event) =>
                  setPagamentoForm((current) => ({ ...current, destinacaoId: event.target.value }))
                }
              >
                <option value="">Selecione</option>
                {pendentes.map((item) => (
                  <option key={item.id} value={item.id}>
                    {`${item.processoId} | ${item.entidadeNome} | Saldo: ${formatCurrency(
                      Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0),
                    )}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="pgtoData">
                Data de pagamento
              </label>
              <input
                id="pgtoData"
                className="field-input"
                type="date"
                value={pagamentoForm.pgtoData}
                onChange={(event) =>
                  setPagamentoForm((current) => ({ ...current, pgtoData: event.target.value }))
                }
              />
            </div>

            <div>
              <label className="field-label" htmlFor="formaPgto">
                Forma de pagamento
              </label>
              <select
                id="formaPgto"
                className="field-input"
                value={pagamentoForm.formaPgto}
                onChange={(event) =>
                  setPagamentoForm((current) => ({ ...current, formaPgto: event.target.value }))
                }
              >
                {pagamentoOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="field-label" htmlFor="valorPago">
                Valor pago
              </label>
              <NumericFormat
                id="valorPago"
                className="field-input"
                thousandSeparator="."
                decimalSeparator=","
                prefix="R$ "
                decimalScale={2}
                fixedDecimalScale
                allowNegative={false}
                value={pagamentoForm.valorPago}
                onValueChange={(values) =>
                  setPagamentoForm((current) => ({ ...current, valorPago: values.floatValue || 0 }))
                }
              />
            </div>

            <div className="sm:col-span-2">
              <button className="btn-primary w-full" type="submit">
                Confirmar pagamento
              </button>
            </div>
          </form>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white/80">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100/90 text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Processo</th>
                  <th className="px-4 py-3">Entidade</th>
                  <th className="px-4 py-3">Destinado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Solicitação</th>
                </tr>
              </thead>
              <tbody>
                {pendentes.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-4 text-zinc-500">
                      Sem pagamentos pendentes.
                    </td>
                  </tr>
                )}
                {pendentes.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100/80 even:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-zinc-900">{item.processoId}</td>
                    <td className="px-4 py-3 text-zinc-600">{item.entidadeNome}</td>
                    <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.valorDestinado)}</td>
                    <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.valorPagoAcumulado || 0)}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {formatCurrency(
                        Math.max(0, Number(item.valorDestinado || 0) - Number(item.valorPagoAcumulado || 0)),
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{formatDateBR(item.solicitacaoData)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {activeTab === 'gerencial' && (
        <section className="mt-5 space-y-4 animate-in">
          <h2 className="text-lg font-semibold text-zinc-900">Painel gerencial por empresa</h2>
          <p className="text-sm text-zinc-600">
            Visão consolidada para acompanhamento de saldo a destinar e saldo a pagar por empresa.
          </p>

          <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="grid gap-3">
              <div className="space-y-1 min-w-0">
                <label className="field-label" htmlFor="filtroEmpresaGerencial">
                  Filtro rápido por CNPJ ou nome da empresa
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    id="filtroEmpresaGerencial"
                    className="field-input w-full max-w-full flex-1"
                    value={filtroEmpresaGerencial}
                    onChange={(event) => setFiltroEmpresaGerencial(event.target.value)}
                    placeholder="Ex: 12.345.678/0001-90 ou razão social"
                  />
                  {filtroEmpresaGerencial && (
                    <button
                      type="button"
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                      onClick={() => setFiltroEmpresaGerencial('')}
                    >
                      Limpar
                    </button>
                  )}
                </div>
              </div>

              <p className="text-sm text-zinc-500">
                Exibindo {resumoEmpresasFiltradas.length} de {resumoEmpresas.length} empresas
              </p>

              {filtroEmpresaGerencial && (
                <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-zinc-600 break-words">
                  Filtro aplicado: <strong className="text-zinc-800">{filtroEmpresaGerencial}</strong>
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <article className="card-metric">
              <p>Empresas visíveis</p>
              <strong>{resumoEmpresasFiltradas.length}</strong>
            </article>
            <article className="card-metric">
              <p>Fomento do filtro</p>
              <strong title={formatCurrency(resumoFiltroGerencial.totalFomento)}>
                {formatCurrencyCompact(resumoFiltroGerencial.totalFomento)}
              </strong>
            </article>
            <article className="card-metric">
              <p>Saldo a destinar (filtro)</p>
              <strong title={formatCurrency(resumoFiltroGerencial.saldoADestinar)}>
                {formatCurrencyCompact(resumoFiltroGerencial.saldoADestinar)}
              </strong>
            </article>
            <article className="card-metric">
              <p>Saldo a pagar (filtro)</p>
              <strong title={formatCurrency(resumoFiltroGerencial.saldoAPagar)}>
                {formatCurrencyCompact(resumoFiltroGerencial.saldoAPagar)}
              </strong>
            </article>
          </div>

          <div className="space-y-3 md:hidden">
            {resumoEmpresasFiltradas.length === 0 && (
              <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-zinc-500">
                Sem dados para exibição.
              </article>
            )}

            {resumoEmpresasFiltradas.map((item) => (
              <article key={item.empresaKey} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    className="block w-full text-left text-base font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline whitespace-normal break-words leading-snug"
                    onClick={() => handleIniciarDestinacaoPorEmpresa(item.empresaKey)}
                    title="Abrir nova destinação para esta empresa"
                  >
                    <span className="block">{item.empresa}</span>
                    <span className="mt-1 block text-sm font-medium text-zinc-500">
                      CNPJ: {item.cnpj || 'não informado'}
                    </span>
                  </button>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-sm font-medium text-zinc-600">
                    {item.processosComSaldo}/{item.processosTotal} processos
                  </span>
                </div>

                <dl className="mt-4 grid grid-cols-2 gap-2 text-sm">
                  <div className="rounded-xl bg-slate-50 p-2">
                    <dt className="text-sm text-zinc-500">Fomento</dt>
                    <dd className="font-semibold text-zinc-900">{formatCurrency(item.totalFomento)}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <dt className="text-sm text-zinc-500">Destinado</dt>
                    <dd className="font-semibold text-zinc-900">{formatCurrency(item.totalDestinado)}</dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 p-2">
                    <dt className="text-sm text-zinc-500">Pago</dt>
                    <dd className="font-semibold text-zinc-900">{formatCurrency(item.totalPago)}</dd>
                  </div>
                  <div className="rounded-xl bg-emerald-50 p-2">
                    <dt className="text-sm text-emerald-700">Saldo a destinar</dt>
                    <dd className="font-semibold text-emerald-800">{formatCurrency(item.saldoADestinar)}</dd>
                  </div>
                  <div className="col-span-2 rounded-xl bg-amber-50 p-2">
                    <dt className="text-sm text-amber-700">Saldo a pagar</dt>
                    <dd className="font-semibold text-amber-800">{formatCurrency(item.saldoAPagar)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>

          <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white/80 md:block">
            <table className="w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100/90 text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Empresa / CNPJ</th>
                  <th className="px-4 py-3">Fomento</th>
                  <th className="px-4 py-3">Destinado</th>
                  <th className="px-4 py-3">Pago</th>
                  <th className="px-4 py-3">Saldo a destinar</th>
                  <th className="px-4 py-3">Saldo a pagar</th>
                  <th className="px-4 py-3">Processos com saldo</th>
                </tr>
              </thead>
              <tbody>
                {resumoEmpresasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan="7" className="px-4 py-4 text-zinc-500">
                      Sem dados para exibição.
                    </td>
                  </tr>
                )}

                {resumoEmpresasFiltradas.map((item) => (
                  <tr key={item.empresaKey} className="border-t border-slate-100/80 even:bg-slate-50/70">
                    <td className="px-4 py-3 font-medium text-zinc-900 max-w-[320px]">
                      <button
                        type="button"
                        className="w-full text-left font-semibold text-cyan-700 transition hover:text-cyan-900 hover:underline whitespace-normal break-words leading-snug"
                        onClick={() => handleIniciarDestinacaoPorEmpresa(item.empresaKey)}
                        title="Abrir nova destinação para esta empresa"
                      >
                        <span className="block">{item.empresa}</span>
                        <span className="mt-1 block text-sm font-medium text-zinc-500">
                          CNPJ: {item.cnpj || 'não informado'}
                        </span>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.totalFomento)}</td>
                    <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.totalDestinado)}</td>
                    <td className="px-4 py-3 text-zinc-600">{formatCurrency(item.totalPago)}</td>
                    <td className="px-4 py-3 font-semibold text-emerald-700">{formatCurrency(item.saldoADestinar)}</td>
                    <td className="px-4 py-3 font-semibold text-amber-700">{formatCurrency(item.saldoAPagar)}</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {item.processosComSaldo}/{item.processosTotal}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </article>
  )
}
