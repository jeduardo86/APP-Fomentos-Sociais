export function EntidadeModal({
  categoriaOptions,
  categoriaTexto,
  entidadeForm,
  handleSalvarEntidade,
  isOpen,
  isSavingEntidadeModal,
  maskCNPJ,
  setEntidadeForm,
  setIsEntidadeModalOpen,
}) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center bg-zinc-900/45 p-4">
      <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">Cadastrar nova entidade</h2>
            <p className="mt-1 text-sm text-zinc-600">
              Cadastre sem sair da destinação. O formulário preenchido permanece na tela.
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
            onClick={() => setIsEntidadeModalOpen(false)}
          >
            Fechar
          </button>
        </div>

        <form
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          onSubmit={(event) =>
            handleSalvarEntidade(event, {
              closeModalOnSuccess: true,
              selectOnDestinacao: true,
            })
          }
        >
          <div>
            <label className="field-label" htmlFor="modalEntidadeNome">
              Nome da entidade
            </label>
            <input
              id="modalEntidadeNome"
              className="field-input"
              value={entidadeForm.nome}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, nome: event.target.value }))
              }
              autoFocus
            />
          </div>

          <div>
            <label className="field-label" htmlFor="modalEntidadeCnpj">
              CNPJ
            </label>
            <input
              id="modalEntidadeCnpj"
              className="field-input"
              value={entidadeForm.cnpj}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, cnpj: maskCNPJ(event.target.value) }))
              }
              placeholder="00.000.000/0000-00"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="modalResponsavelEntidade">
              Nome do responsável
            </label>
            <input
              id="modalResponsavelEntidade"
              className="field-input"
              value={entidadeForm.responsavel}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, responsavel: event.target.value }))
              }
              placeholder="Nome completo"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="modalContatoEntidade">
              Contato
            </label>
            <input
              id="modalContatoEntidade"
              className="field-input"
              value={entidadeForm.contato}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, contato: event.target.value }))
              }
              placeholder="Telefone, e-mail ou ambos"
            />
          </div>

          <div>
            <label className="field-label" htmlFor="modalCategoriaEntidade">
              Categoria
            </label>
            <select
              id="modalCategoriaEntidade"
              className="field-input"
              value={entidadeForm.categoria}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, categoria: event.target.value }))
              }
            >
              {categoriaOptions.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>


          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="modalFormaPagamentoEntidade">
              Forma de pagamento
            </label>
            <select
              id="modalFormaPagamentoEntidade"
              className="field-input"
              value={entidadeForm.formaPagamento}
              onChange={e => setEntidadeForm(current => ({ ...current, formaPagamento: e.target.value }))}
            >
              <option value="">Selecione...</option>
              <option value="PIX">PIX</option>
              <option value="ContaBancaria">Conta Bancária</option>
              <option value="Boleto">Boleto</option>
              <option value="Outro">Outro</option>
            </select>
          </div>

          {/* Campos dinâmicos conforme formaPagamento */}
          {entidadeForm.formaPagamento === 'PIX' && (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="modalPixEntidade">Chave Pix</label>
              <input
                id="modalPixEntidade"
                className="field-input"
                value={entidadeForm.pix}
                onChange={e => setEntidadeForm(current => ({ ...current, pix: e.target.value }))}
                placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
              />
            </div>
          )}
          {entidadeForm.formaPagamento === 'ContaBancaria' && (
            <>
              <div>
                <label className="field-label" htmlFor="modalBancoEntidade">Banco</label>
                <input
                  id="modalBancoEntidade"
                  className="field-input"
                  value={entidadeForm.banco}
                  onChange={e => setEntidadeForm(current => ({ ...current, banco: e.target.value }))}
                  placeholder="Nome do banco"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="modalAgenciaEntidade">Agência</label>
                <input
                  id="modalAgenciaEntidade"
                  className="field-input"
                  value={entidadeForm.agencia}
                  onChange={e => setEntidadeForm(current => ({ ...current, agencia: e.target.value }))}
                  placeholder="Agência"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="modalContaEntidade">Conta</label>
                <input
                  id="modalContaEntidade"
                  className="field-input"
                  value={entidadeForm.conta}
                  onChange={e => setEntidadeForm(current => ({ ...current, conta: e.target.value }))}
                  placeholder="Conta"
                />
              </div>
              <div>
                <label className="field-label" htmlFor="modalContaDigitoEntidade">Dígito</label>
                <input
                  id="modalContaDigitoEntidade"
                  className="field-input"
                  value={entidadeForm.contaDigito}
                  onChange={e => setEntidadeForm(current => ({ ...current, contaDigito: e.target.value }))}
                  placeholder="Dígito"
                />
              </div>
            </>
          )}
          {entidadeForm.formaPagamento === 'Outro' && (
            <div className="sm:col-span-2">
              <label className="field-label" htmlFor="modalOutrosDadosEntidade">Descrição</label>
              <input
                id="modalOutrosDadosEntidade"
                className="field-input"
                value={entidadeForm.outrosDados}
                onChange={e => setEntidadeForm(current => ({ ...current, outrosDados: e.target.value }))}
                placeholder="Descreva como a entidade recebe pagamentos"
              />
            </div>
          )}

          <p className="text-xs text-zinc-500 sm:col-span-2">
            Obrigatório informar CNPJ e ao menos Pix ou dados bancários.
          </p>

          <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900 sm:col-span-2">
            {categoriaTexto}
          </div>

          <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
              onClick={() => setIsEntidadeModalOpen(false)}
              disabled={isSavingEntidadeModal}
            >
              Cancelar
            </button>
            <button className="btn-primary" type="submit" disabled={isSavingEntidadeModal}>
              {isSavingEntidadeModal ? 'Cadastrando...' : 'Cadastrar e usar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
