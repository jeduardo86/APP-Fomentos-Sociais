const fs = require('fs');
const path = require('path');

// Read the original App.jsx
const filePath = path.join(__dirname, 'src', 'App.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// The corrected code (provided by user)
const correctedCode = `{activeTab === 'destinacao' && (
  <section className="mt-5 space-y-5 animate-in">
    <h2 className="text-lg font-semibold text-zinc-900">Formulário de destinação</h2>

    {isAdmin && (
      <div className="rounded-2xl border border-cyan-200/80 bg-cyan-50/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-cyan-900">Origem manual de recurso</p>
            <p className="text-xs text-cyan-800">
              Cadastre fomentos fora do CSV e siga no fluxo normal de destinações.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setIsOrigemManualModalOpen(true)}
          >
            Cadastrar Fomento
          </button>
        </div>
      </div>
    )}

    <div>
      <label className="field-label" htmlFor="empresaSelecionada">
        Operador lotérico
      </label>
      <select
        id="empresaSelecionada"
        className="field-input"
        value={empresaSelecionada}
        onChange={(event) => {
          setEmpresaSelecionada(event.target.value)
          setSelectedProcessIds([])
          setSelectedProcessValues({})
          setValorAlvoDestinacao(0)
        }}
      >
        <option value="">Selecione</option>
        {empresasDestinacaoOptions.map((empresa) => (
          <option key={empresa.key} value={empresa.key}>
            {empresa.label}
          </option>
        ))}
      </select>
    </div>

    <div>
      <label className="field-label" htmlFor="valorAlvoDestinacao">
        Valor total a destinar (opcional)
      </label>
      <NumericFormat
        id="valorAlvoDestinacao"
        className="field-input"
        thousandSeparator="."
        decimalSeparator=","
        prefix="R$ "
        decimalScale={2}
        fixedDecimalScale
        allowNegative={false}
        inputMode="decimal"
        onFocus={handleMoneyInputFocus}
        value={valorAlvoDestinacao}
        onValueChange={(values) => setValorAlvoDestinacao(Number(values.floatValue || 0))}
        placeholder="Informe o valor limite da destinação"
      />
      <p className="mt-1 text-xs text-zinc-500">
        Quando preenchido, os processos selecionados respeitam esse total e o último processo fica parcial se necessário.
      </p>
    </div>

    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-zinc-800">Processos para destinação</p>
        {processosEmpresaFiltrados.length > 0 && (
          <button
            type="button"
            className="text-sm font-semibold text-cyan-700 hover:underline"
            onClick={() => {
              const valorAlvo = Number(valorAlvoDestinacao || 0)
              const idsAtuais = [...selectedProcessIds]
              const valoresAtuais = { ...selectedProcessValues }
              let restante = valorAlvo > 0
                ? Number(Math.max(0, valorAlvo - idsAtuais.reduce((acc, id) => {
                    const processoAtual = processosEmpresaById[id]
                    if (!processoAtual) return acc
                    const saldoAtual = Number(processoAtual.saldoDisponivel || 0)
                    const valorAtual = Number(valoresAtuais[id] || 0)
                    return acc + Math.max(0, Math.min(valorAtual, saldoAtual))
                  }, 0)).toFixed(2)
                : 0

              const novosIds = []
              const novosValores = {}

              processosEmpresaFiltrados.forEach((item) => {
                const processoId = String(item.processoId || '')
                if (!processoId || idsAtuais.includes(processoId)) return
                const saldoDisponivel = Number(item.saldoDisponivel || 0)
                const valorInicial = valorAlvo > 0 ? Math.min(saldoDisponivel, restante) : Number(saldoDisponivel.toFixed(2))
                if (valorInicial <= 0) return
                novosIds.push(processoId)
                novosValores[processoId] = Number(valorInicial.toFixed(2))
                if (valorAlvo > 0) restante = Number(Math.max(0, restante - valorInicial).toFixed(2))
              })

              if (!novosIds.length) {
                if (valorAlvo > 0) toast.error('Não há saldo disponível para marcar novos processos dentro do valor informado.')
                return
              }

              setSelectedProcessIds([...idsAtuais, ...novosIds])
              setSelectedProcessValues({ ...valoresAtuais, ...novosValores })
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
        <div className="grid max-h-[21rem] gap-3 overflow-auto sm:grid-cols-2">
          {processosEmpresaFiltrados.map((item) => {
            const checked = selectedProcessIds.includes(item.processoId)
            return (
              <article
                key={item.processoId}
                role="button"
                tabIndex={0}
                onClick={() => handleToggleProcessoDestinacao(item)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    handleToggleProcessoDestinacao(item)
                  }
                }}
                className={checked
                  ? 'cursor-pointer rounded-xl border border-cyan-300 bg-cyan-50/40 p-3 transition'
                  : 'cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition hover:border-cyan-200 hover:bg-cyan-50/20'
                }
              >
                <div className="flex items-start justify-between gap-2 text-sm">
                  <div>
                    <p className="font-semibold text-zinc-900">{item.processoId}</p>
                    <p className="text-zinc-500">{item.termo || 'Sem termo'}</p>
                  </div>
                  {checked && (
                    <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800">
                      Selecionado
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-zinc-600">
                  Valor Premio: {formatCurrency(item.valorPremio || 0)} | Incentivo: {formatCurrency(item.incentivo || 0)}
                </p>
                <p className="mt-1 text-sm text-zinc-600">
                  Base de calculo: {formatCurrency(getBaseCalculoFomentoFromProcess(item))}
                </p>
                <p className="mt-1 text-sm text-emerald-700">
                  Saldo disponível: {formatCurrency(item.saldoDisponivel)}
                </p>
                {checked && (
                  <div className="mt-3" onClick={(event) => event.stopPropagation()}>
                    <label className="mb-1 block text-sm font-medium text-zinc-600">
                      Valor destinado para este processo
                    </label>
                    <NumericFormat
                      className="field-input"
                      thousandSeparator="."
                      decimalSeparator=","
                      prefix="R$ "
                      decimalScale={2}
                      fixedDecimalScale
                      allowNegative={false}
                      inputMode="decimal"
                      onFocus={handleMoneyInputFocus}
                      value={selectedProcessValues[item.processoId] || 0}
                      onValueChange={(values) => {
                        const value = Math.max(0, Math.min(Number(values.floatValue || 0), Number(item.saldoDisponivel || 0)))
                        setSelectedProcessValues((current) => ({
                          ...current,
                          [item.processoId]: Number(value.toFixed(2))
                        }))
                      }}
                    />
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </div>

    {/* FORMULÁRIO PRINCIPAL DE DESTINAÇÃO */}
    <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSalvarDestinacao}>
      {/* Data de solicitação */}
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

      {/* SELEÇÃO DA ENTIDADE (SEMPRE) - AGORA AO LADO DA DATA */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="field-label mb-0" htmlFor="entidadeBuscaDestinacao">
            Entidade beneficiária
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
        
        <div className="relative">
          <input
            id="entidadeBuscaDestinacao"
            className="field-input"
            value={entidadeSearchDestinacao}
            onFocus={() => setIsEntidadeSearchOpen(true)}
            onBlur={() => {
              setTimeout(() => setIsEntidadeSearchOpen(false), 120)
            }}
            onChange={(event) => {
              const nextValue = event.target.value
              setEntidadeSearchDestinacao(nextValue)
              setIsEntidadeSearchOpen(true)
              setDestForm((current) => ({ ...current, entidadeId: '' }))
            }}
            placeholder="Digite para buscar por nome, CNPJ ou categoria"
            autoComplete="off"
          />

          {isEntidadeSearchOpen && (
            <div className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
              {entidadesDestinacaoFiltradas.length === 0 && (
                <p className="px-3 py-2 text-sm text-zinc-500">Nenhuma entidade encontrada.</p>
              )}
              {entidadesDestinacaoFiltradas.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-slate-100"
                  onMouseDown={(event) => {
                    event.preventDefault()
                    setDestForm((current) => ({ ...current, entidadeId: entry.id }))
                    setEntidadeSearchDestinacao(String(entry.nome || ''))
                    setIsEntidadeSearchOpen(false)
                  }}
                >
                  <span className="block font-medium text-zinc-900">{entry.nome}</span>
                  <span className="block text-xs text-zinc-500">
                    {entry.cnpj || 'CNPJ não informado'} | {entry.categoria || 'Sem categoria'} |{' '}
                    {entry.municipio || 'Municipio nao informado'} - {entry.estado || '--'}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <select
          id="entidadeId"
          className="field-input"
          value={destForm.entidadeId}
          onChange={(event) =>
            setDestForm((current) => ({ ...current, entidadeId: event.target.value }))
          }
          style={{ display: 'none' }}
          aria-hidden="true"
          tabIndex={-1}
        >
          <option value="">Selecione</option>
          {entidades.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.nome}
            </option>
          ))}
        </select>

        <p className="mt-1 text-xs text-zinc-500">
          {destForm.entidadeId ? (entidades.find(e => e.id === destForm.entidadeId)?.nome || 'Entidade selecionada') : 'Nenhuma entidade selecionada'}
        </p>
      </div>

      {/* DESTINO DO RECURSO (para onde vai o dinheiro) - OCUPA A LINHA INTEIRA */}
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="tipoDestino">
          Destino do recurso financeiro
        </label>
        <select
          id="tipoDestino"
          className="field-input"
          value={destForm.tipoDestino}
          onChange={(event) =>
            setDestForm((current) => ({ ...current, tipoDestino: event.target.value }))
          }
        >
          <option value="entidade">Para a entidade selecionada acima</option>
          <option value="empresa">Para empresa prestadora de serviço (terceirizada)</option>
        </select>
        <p className="mt-1 text-xs text-zinc-500">
          Selecione se o recurso será pago diretamente à entidade ou a uma empresa que prestará o serviço
        </p>
      </div>

      {/* BLOCO PARA DESTINO À EMPRESA (quando não é para entidade) */}
      {destForm.tipoDestino === 'empresa' && (
        <div className="sm:col-span-2 space-y-4 rounded-2xl border border-cyan-200 bg-cyan-50/30 p-4">
          <p className="text-sm font-semibold text-cyan-900">Dados da empresa prestadora de serviço</p>
          
          <div>
            <label className="field-label" htmlFor="empresaCnpj">
              CNPJ da empresa prestadora
            </label>
            <input
              id="empresaCnpj"
              className="field-input"
              value={destForm.empresaCnpj}
              onChange={(event) =>
                setDestForm((current) => ({ ...current, empresaCnpj: maskCNPJ(event.target.value) }))
              }
              onBlur={async (event) => {
                const cnpjLimpo = sanitizeCNPJ(event.target.value)
                if (cnpjLimpo.length === 14) {
                  try {
                    const cnpjData = await fetchEntidadeByCnpj(cnpjLimpo)
                    setDestForm((current) => ({ 
                      ...current, 
                      empresaRazaoSocial: cnpjData.razaoSocial || cnpjData.nome || ''
                    }))
                    toast.success('Dados da empresa carregados com sucesso!')
                  } catch (error) {
                    console.error('Erro ao buscar dados do CNPJ:', error)
                    toast.error('Não foi possível carregar os dados da empresa. Digite manualmente.')
                  }
                }
              }}
              placeholder="00.000.000/0000-00"
            />
            <p className="mt-1 text-xs text-zinc-500">
              Digite o CNPJ para carregar automaticamente a razão social
            </p>
          </div>

          <div>
            <label className="field-label" htmlFor="empresaRazaoSocial">
              Razão Social
            </label>
            <input
              id="empresaRazaoSocial"
              className="field-input"
              value={destForm.empresaRazaoSocial}
              onChange={(event) =>
                setDestForm((current) => ({ ...current, empresaRazaoSocial: event.target.value }))
              }
              placeholder="Razão social da empresa prestadora de serviço"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="empresaFormaPagamento">
              Forma de pagamento para a empresa
            </label>
            <select
              id="empresaFormaPagamento"
              className="field-input"
              value={destForm.empresaFormaPagamento}
              onChange={(event) =>
                setDestForm((current) => ({ ...current, empresaFormaPagamento: event.target.value }))
              }
            >
              <option value="PIX">PIX</option>
              <option value="Conta Bancária">Conta Bancária</option>
              <option value="Boleto">Boleto</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          {destForm.empresaFormaPagamento === 'PIX' && (
            <div>
              <label className="field-label" htmlFor="empresaChavePix">
                Chave Pix
              </label>
              <input
                id="empresaChavePix"
                className="field-input"
                value={destForm.empresaChavePix}
                onChange={(event) =>
                  setDestForm((current) => ({ ...current, empresaChavePix: event.target.value }))
                }
                placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
              />
            </div>
          )}

          {destForm.empresaFormaPagamento === 'Conta Bancária' && (
            <>
              <div>
                <label className="field-label" htmlFor="empresaBanco">
                  Banco
                </label>
                <input
                  id="empresaBanco"
                  className="field-input"
                  value={destForm.empresaBanco}
                  onChange={(event) =>
                    setDestForm((current) => ({ ...current, empresaBanco: event.target.value }))
                  }
                  placeholder="Nome ou código do banco"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="empresaAgencia">
                  Agência
                </label>
                <input
                  id="empresaAgencia"
                  className="field-input"
                  value={destForm.empresaAgencia}
                  onChange={(event) =>
                    setDestForm((current) => ({ ...current, empresaAgencia: event.target.value }))
                  }
                  placeholder="Ex: 0001"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="empresaConta">
                  Conta com dígito
                </label>
                <input
                  id="empresaConta"
                  className="field-input"
                  value={destForm.empresaConta}
                  onChange={(event) =>
                    setDestForm((current) => ({ ...current, empresaConta: event.target.value }))
                  }
                  placeholder="Ex: 12345-6"
                />
              </div>
            </>
          )}

          {destForm.empresaFormaPagamento === 'Outro' && (
            <div>
              <label className="field-label" htmlFor="empresaDadosBancarios">
                Detalhes do pagamento
              </label>
              <textarea
                id="empresaDadosBancarios"
                className="field-input min-h-24"
                value={destForm.empresaDadosBancarios}
                onChange={(event) =>
                  setDestForm((current) => ({ ...current, empresaDadosBancarios: event.target.value }))
                }
                placeholder="Forneça os detalhes adicionais"
              />
            </div>
          )}
        </div>
      )}

      {/* Competência */}
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

      {/* Nº do processo de solicitação */}
      <div>
        <label className="field-label" htmlFor="processoSolicitacaoEntidade">
          Nº do processo de solicitação
        </label>
        <input
          id="processoSolicitacaoEntidade"
          className="field-input"
          value={destForm.processoSolicitacaoEntidade}
          onChange={(event) =>
            setDestForm((current) => ({
              ...current,
              processoSolicitacaoEntidade: event.target.value,
            }))
          }
          placeholder="Ex.: LTP-PRC-2026/12345"
        />
      </div>

      {/* Observação */}
      <div className="sm:col-span-2">
        <label className="field-label" htmlFor="observacaoDestinacao">
          Observação (opcional)
        </label>
        <textarea
          id="observacaoDestinacao"
          className="field-input min-h-[88px]"
          value={destForm.observacao}
          onChange={(event) =>
            setDestForm((current) => ({
              ...current,
              observacao: event.target.value,
            }))
          }
          placeholder="Ex.: orientação adicional para encaminhamento ao operador lotérico ou objeto onde o recurso deve ser aplicado"
        />
      </div>

      {/* Resumo */}
      <div className="sm:col-span-2 grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 to-cyan-50 p-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-zinc-500">Operador lotérico selecionado</p>
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
        <div>
          <p className="text-zinc-500">Valor informado</p>
          <p className="font-medium text-zinc-900">{formatCurrency(valorAlvoDestinacao || 0)}</p>
        </div>
        <div>
          <p className="text-zinc-500">Saldo para completar</p>
          <p className="font-semibold text-amber-700">
            {formatCurrency(Math.max(0, Number((valorAlvoDestinacao || 0) - totalSelecionadoParaDestinar)))}
          </p>
        </div>
      </div>

      {/* Botão Salvar */}
      <div className="sm:col-span-2">
        <button className="btn-primary w-full" type="submit">
          Salvar destinação
        </button>
      </div>
    </form>
  </section>
)}`;

// Find the start and end positions
const startPattern = "{activeTab === 'destinacao' && (";
const endPattern = ")}";

let startPos = content.indexOf(startPattern);
if (startPos === -1) {
  console.error("Start pattern not found");
  process.exit(1);
}

// Find the matching closing brace
let braceCount = 0;
let inDestinacao = false;
let endPos = -1;

for (let i = startPos; i < content.length; i++) {
  if (content.substring(i, i + startPattern.length) === startPattern) {
    inDestinacao = true;
    braceCount = 1;
    i += startPattern.length - 1;
    continue;
  }
  
  if (inDestinacao) {
    if (content[i] === '(') braceCount++;
    else if (content[i] === ')') {
      braceCount--;
      if (braceCount === 0) {
        endPos = i + 1; // include the ')'
        break;
      }
    }
  }
}

if (endPos === -1) {
  console.error("Could not find matching closing brace");
  process.exit(1);
}

console.log(`Replacing from position ${startPos} to ${endPos}`);
console.log(`Original length: ${endPos - startPos}`);
console.log(`New length: ${correctedCode.length}`);

// Replace the section
const newContent = content.substring(0, startPos) + correctedCode + content.substring(endPos);

// Write backup
fs.writeFileSync(filePath + '.backup', content, 'utf8');

// Write new content
fs.writeFileSync(filePath, newContent, 'utf8');

console.log('Replacement completed. Backup saved to ' + filePath + '.backup');