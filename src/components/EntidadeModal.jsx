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

          <div>
            <label className="field-label" htmlFor="modalEntidadePix">
              Chave Pix
            </label>
            <input
              id="modalEntidadePix"
              className="field-input"
              value={entidadeForm.chavePix}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, chavePix: event.target.value }))
              }
              placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="field-label" htmlFor="modalDadosBancariosEntidade">
              Dados bancários para transferência
            </label>
            <textarea
              id="modalDadosBancariosEntidade"
              className="field-input min-h-24"
              value={entidadeForm.dadosBancarios}
              onChange={(event) =>
                setEntidadeForm((current) => ({ ...current, dadosBancarios: event.target.value }))
              }
              placeholder="Banco, agência, conta e tipo"
            />
          </div>

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
