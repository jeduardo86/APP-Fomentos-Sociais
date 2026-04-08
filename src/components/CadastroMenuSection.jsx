export function CadastroMenuSection({
  activeCadastroTab,
  canAccessCadastroBase,
  categoriaOptions,
  categoriaTexto,
  createInitialEntidadeForm,
  editingEntidadeId,
  editingUserCargo,
  editingUserId,
  editingUserName,
  empresaForm,
  empresas,
  entidades,
  entidadeForm,
  handleCadastrarUsuario,
  handleCancelEditUserName,
  handleCancelarEdicaoEntidade,
  handleEditEntidade,
  handleSalvarEmpresa,
  handleSalvarEntidade,
  handleStartEditUserName,
  handleToggleUserAccess,
  handleUpdateRole,
  handleUpdateUserName,
  isAdmin,
  isCreateUserFormVisible,
  isCreatingUser,
  isEmpresaFormVisible,
  isEntidadeFormVisible,
  maskCNPJ,
  nameBusyUserId,
  newUserForm,
  roleBusyUserId,
  accessBusyUserId,
  setActiveCadastroTab,
  setEditingEntidadeId,
  setEditingUserCargo,
  setEditingUserName,
  setEmpresaForm,
  setEntidadeForm,
  setIsCreateUserFormVisible,
  setIsEmpresaFormVisible,
  setIsEntidadeFormVisible,
  setNewUserForm,
  user,
  usersList,
  visibleCadastroTabs,
}) {
  return (
    <section className="panel panel-soft sm:p-6">
      <nav className="rounded-2xl border border-slate-200/70 bg-white/70 p-2" aria-label="Submenu de cadastros">
        <div className="flex flex-wrap gap-2">
          {visibleCadastroTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={activeCadastroTab === tab.id ? 'tab tab-active' : 'tab'}
              onClick={() => setActiveCadastroTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      {!isAdmin && activeCadastroTab === 'usuarios' && (
        <section className="mt-5 animate-in rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          Seu perfil atual não possui permissão para acessar os cadastros.
        </section>
      )}

      {canAccessCadastroBase && activeCadastroTab === 'empresas' && (
        <section className="mt-5 animate-in">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">Cadastro de operadores lotéricos</h2>
            <button
              type="button"
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
              onClick={() => {
                setEmpresaForm({ razaoSocial: '', cnpj: '' })
                setIsEmpresaFormVisible((current) => !current)
              }}
            >
              {isEmpresaFormVisible ? 'Ocultar formulário' : 'Adicionar operador lotérico'}
            </button>
          </div>

          {isEmpresaFormVisible && (
            <form
              className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              onSubmit={handleSalvarEmpresa}
            >
              <h3 className="text-base font-semibold text-zinc-900">Novo operador lotérico</h3>
              <div>
                <label className="field-label" htmlFor="razaoSocial">
                  Razão social
                </label>
                <input
                  id="razaoSocial"
                  className="field-input"
                  value={empresaForm.razaoSocial}
                  onChange={(event) =>
                    setEmpresaForm((current) => ({ ...current, razaoSocial: event.target.value }))
                  }
                />
              </div>
              <div>
                <label className="field-label" htmlFor="cnpj">
                  CNPJ
                </label>
                <input
                  id="cnpj"
                  className="field-input"
                  value={empresaForm.cnpj}
                  onChange={(event) =>
                    setEmpresaForm((current) => ({ ...current, cnpj: maskCNPJ(event.target.value) }))
                  }
                  placeholder="00.000.000/0000-00"
                />
              </div>
              <button className="btn-primary w-full" type="submit">
                Cadastrar operador lotérico
              </button>
            </form>
          )}

          <div className="mt-4 rounded-xl bg-white p-3 text-sm text-zinc-600">
            Operadores lotéricos cadastrados: {empresas.length}
          </div>
        </section>
      )}

      {canAccessCadastroBase && activeCadastroTab === 'entidades' && (
        <section className="mt-5 animate-in">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-zinc-900">Cadastro de entidades</h2>
            <button
              type="button"
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
              onClick={() => {
                setEditingEntidadeId('')
                setEntidadeForm(createInitialEntidadeForm())
                setIsEntidadeFormVisible((current) => !current)
              }}
            >
              {isEntidadeFormVisible ? 'Ocultar formulário' : 'Adicionar entidade'}
            </button>
          </div>

          {(isEntidadeFormVisible || editingEntidadeId) && (
            <form
              className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
              onSubmit={handleSalvarEntidade}
            >
              <h3 className="text-base font-semibold text-zinc-900">
                {editingEntidadeId ? 'Editar entidade' : 'Nova entidade'}
              </h3>
              <div>
                <label className="field-label" htmlFor="entidadeNome">
                  Nome da entidade
                </label>
                <input
                  id="entidadeNome"
                  className="field-input"
                  value={entidadeForm.nome}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, nome: event.target.value }))
                  }
                />
              </div>

              <div>
                <label className="field-label" htmlFor="entidadeCnpj">
                  CNPJ
                </label>
                <input
                  id="entidadeCnpj"
                  className="field-input"
                  value={entidadeForm.cnpj}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, cnpj: maskCNPJ(event.target.value) }))
                  }
                  placeholder="00.000.000/0000-00"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="entidadeResponsavel">
                  Nome do responsável
                </label>
                <input
                  id="entidadeResponsavel"
                  className="field-input"
                  value={entidadeForm.responsavel}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, responsavel: event.target.value }))
                  }
                  placeholder="Nome completo"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="entidadeContato">
                  Contato
                </label>
                <input
                  id="entidadeContato"
                  className="field-input"
                  value={entidadeForm.contato}
                  onChange={(event) =>
                    setEntidadeForm((current) => ({ ...current, contato: event.target.value }))
                  }
                  placeholder="Telefone, e-mail ou ambos"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="categoria">
                  Categoria
                </label>
                <select
                  id="categoria"
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
                <label className="field-label" htmlFor="entidadeFormaPagamento">
                  Forma de pagamento
                </label>
                <select
                  id="entidadeFormaPagamento"
                  className="field-input"
                  value={entidadeForm.formaPagamento || ''}
                  onChange={e => {
                    const value = e.target.value
                    setEntidadeForm(current => ({
                      ...current,
                      formaPagamento: value,
                      chavePix: value === 'PIX' ? current.chavePix : '',
                      agencia: value === 'ContaBancaria' ? current.agencia : '',
                      conta: value === 'ContaBancaria' ? current.conta : '',
                      outroPagamento: value === 'Outro' ? current.outroPagamento : '',
                    }))
                  }}
                >
                  <option value="">Selecione...</option>
                  <option value="PIX">Pix</option>
                  <option value="ContaBancaria">Conta Bancária</option>
                  <option value="Boleto">Boleto</option>
                  <option value="Outro">Outro</option>
                </select>
              </div>

              {entidadeForm.formaPagamento === 'PIX' && (
                <div>
                  <label className="field-label" htmlFor="entidadeChavePix">Chave Pix</label>
                  <input
                    id="entidadeChavePix"
                    className="field-input"
                    value={entidadeForm.chavePix || ''}
                    onChange={e => setEntidadeForm(current => ({ ...current, chavePix: e.target.value }))}
                    placeholder="CPF, CNPJ, e-mail, celular ou chave aleatória"
                  />
                </div>
              )}

              {entidadeForm.formaPagamento === 'ContaBancaria' && (
                <>
                  <div>
                    <label className="field-label" htmlFor="entidadeAgencia">Agência</label>
                    <input
                      id="entidadeAgencia"
                      className="field-input"
                      value={entidadeForm.agencia || ''}
                      onChange={e => setEntidadeForm(current => ({ ...current, agencia: e.target.value }))}
                      placeholder="Agência"
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="entidadeConta">Conta com dígito</label>
                    <input
                      id="entidadeConta"
                      className="field-input"
                      value={entidadeForm.conta || ''}
                      onChange={e => setEntidadeForm(current => ({ ...current, conta: e.target.value }))}
                      placeholder="Conta com dígito"
                    />
                  </div>
                </>
              )}

              {entidadeForm.formaPagamento === 'Outro' && (
                <div>
                  <label className="field-label" htmlFor="entidadeOutroPagamento">Descrição do pagamento</label>
                  <input
                    id="entidadeOutroPagamento"
                    className="field-input"
                    value={entidadeForm.outroPagamento || ''}
                    onChange={e => setEntidadeForm(current => ({ ...current, outroPagamento: e.target.value }))}
                    placeholder="Descreva a forma de pagamento"
                  />
                </div>
              )}

              {/* Boleto: nenhum campo extra */}

              <p className="text-xs text-zinc-500">Obrigatório informar CNPJ e ao menos Pix ou dados bancários.</p>

              <div className="rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
                {categoriaTexto}
              </div>

              <div className="flex flex-wrap gap-2">
                <button className="btn-primary flex-1" type="submit">
                  {editingEntidadeId ? 'Salvar alterações' : 'Cadastrar entidade'}
                </button>
                {editingEntidadeId && (
                  <button
                    type="button"
                    className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                    onClick={handleCancelarEdicaoEntidade}
                  >
                    Cancelar edição
                  </button>
                )}
              </div>
            </form>
          )}

          <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-base font-semibold text-zinc-900">Entidades cadastradas</h3>
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-zinc-600">
                Total: {entidades.length}
              </span>
            </div>

            {entidades.length === 0 ? (
              <p className="text-sm text-zinc-600">Nenhuma entidade cadastrada até o momento.</p>
            ) : (
              <ul className="space-y-3">
                {entidades.map((entry) => (
                  <li key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-zinc-900">{entry.nome || 'Sem nome'}</p>
                        <p className="text-sm text-zinc-600">Categoria: {entry.categoria || '--'}</p>
                      </div>
                      <button
                        type="button"
                        className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-xs font-semibold text-cyan-800 transition hover:bg-cyan-100"
                        onClick={() => handleEditEntidade(entry)}
                      >
                        Editar
                      </button>
                    </div>

                    <dl className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">CNPJ</dt>
                        <dd>{entry.cnpj || '--'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Responsável</dt>
                        <dd>{entry.responsavel || '--'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Contato</dt>
                        <dd>{entry.contato || '--'}</dd>
                      </div>
                      <div>
                        <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Forma de pagamento</dt>
                        <dd>{
                          entry.formaPagamento === 'PIX' ? 'Pix' :
                          entry.formaPagamento === 'ContaBancaria' ? 'Conta Bancária' :
                          entry.formaPagamento === 'Boleto' ? 'Boleto' :
                          entry.formaPagamento === 'Outro' ? 'Outro' : '--'
                        }</dd>
                      </div>
                      {entry.formaPagamento === 'PIX' && (
                        <div className="sm:col-span-2">
                          <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Chave Pix</dt>
                          <dd>{entry.pix || '--'}</dd>
                        </div>
                      )}
                      {entry.formaPagamento === 'ContaBancaria' && (
                        <>
                          <div>
                            <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Banco</dt>
                            <dd>{entry.banco || '--'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Agência</dt>
                            <dd>{entry.agencia || '--'}</dd>
                          </div>
                          <div>
                            <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Conta</dt>
                            <dd>{entry.conta || '--'}{entry.contaDigito ? `-${entry.contaDigito}` : ''}</dd>
                          </div>
                        </>
                      )}
                      {entry.formaPagamento === 'Outro' && (
                        <div className="sm:col-span-2">
                          <dt className="text-xs uppercase tracking-[0.08em] text-zinc-500">Descrição</dt>
                          <dd>{entry.outrosDados || '--'}</dd>
                        </div>
                      )}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </section>
      )}

      {isAdmin && activeCadastroTab === 'usuarios' && (
        <section className="mt-5 animate-in space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Cadastro de usuários</h2>
              <p className="text-sm text-zinc-600">
                Promova ou reverta perfis entre OPERADOR e admin, e bloqueie ou libere o acesso.
              </p>
            </div>
            <button
              type="button"
              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100"
              onClick={() => {
                setIsCreateUserFormVisible((current) => !current)

                if (isCreateUserFormVisible) {
                  setNewUserForm({ nome: '', cargo: '', email: '', password: '', role: 'OPERADOR' })
                }
              }}
            >
              {isCreateUserFormVisible ? 'Cancelar novo usuário' : 'Adicionar usuário'}
            </button>
          </div>

          {isCreateUserFormVisible && (
            <form
              className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-3"
              onSubmit={handleCadastrarUsuario}
            >
              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="novoUsuarioNome">
                  Nome
                </label>
                <input
                  id="novoUsuarioNome"
                  className="field-input"
                  value={newUserForm.nome}
                  onChange={(event) =>
                    setNewUserForm((current) => ({ ...current, nome: event.target.value }))
                  }
                  placeholder="Nome completo"
                />
              </div>

              <div className="sm:col-span-1">
                <label className="field-label" htmlFor="novoUsuarioCargo">
                  Cargo/Função
                </label>
                <input
                  id="novoUsuarioCargo"
                  className="field-input"
                  value={newUserForm.cargo}
                  onChange={(event) =>
                    setNewUserForm((current) => ({ ...current, cargo: event.target.value }))
                  }
                  placeholder="Ex: Analista Financeiro"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="novoUsuarioEmail">
                  Email
                </label>
                <input
                  id="novoUsuarioEmail"
                  className="field-input"
                  type="email"
                  value={newUserForm.email}
                  onChange={(event) =>
                    setNewUserForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="usuario@dominio.com"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="novoUsuarioRole">
                  Perfil
                </label>
                <select
                  id="novoUsuarioRole"
                  className="field-input"
                  value={newUserForm.role}
                  onChange={(event) =>
                    setNewUserForm((current) => ({ ...current, role: event.target.value }))
                  }
                >
                  <option value="OPERADOR">OPERADOR</option>
                  <option value="admin">ADMIN</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="field-label" htmlFor="novoUsuarioSenha">
                  Senha provisória
                </label>
                <input
                  id="novoUsuarioSenha"
                  className="field-input"
                  type="password"
                  value={newUserForm.password}
                  onChange={(event) =>
                    setNewUserForm((current) => ({ ...current, password: event.target.value }))
                  }
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              <div className="sm:col-span-1 sm:self-end">
                <button className="btn-primary w-full" type="submit" disabled={isCreatingUser}>
                  {isCreatingUser ? 'Cadastrando...' : 'Cadastrar usuario'}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-3 md:hidden">
            {usersList.length === 0 && (
              <article className="rounded-2xl border border-slate-200 bg-white/85 p-4 text-sm text-zinc-500">
                Nenhum usuario encontrado.
              </article>
            )}

            {usersList.map((entry) => {
              const isSelf = entry.uid === user.uid
              const nextRole = entry.role === 'admin' ? 'OPERADOR' : 'admin'
              const isBlocked = entry.blocked === true
              const isRoleBusy = roleBusyUserId === entry.uid
              const isAccessBusy = accessBusyUserId === entry.uid
              const isNameBusy = nameBusyUserId === entry.uid
              const isEditingName = editingUserId === entry.uid

              return (
                <article key={entry.uid} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">Nome</p>
                      {isEditingName ? (
                        <input
                          className="field-input mt-1 py-2"
                          value={editingUserName}
                          onChange={(event) => setEditingUserName(event.target.value)}
                          placeholder="Nome completo"
                          aria-label={`Nome do usuário ${entry.email || entry.uid}`}
                        />
                      ) : (
                        <p className="mt-1 font-semibold text-zinc-900">{entry.nome || '--'}</p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">Cargo/Função</p>
                        {isEditingName ? (
                          <input
                            className="field-input mt-1 py-2"
                            value={editingUserCargo}
                            onChange={(event) => setEditingUserCargo(event.target.value)}
                            placeholder="Cargo/Função"
                            aria-label={`Cargo/Função do usuário ${entry.email || entry.uid}`}
                          />
                        ) : (
                          <p className="mt-1 text-sm font-medium text-zinc-800">{entry.cargo || '--'}</p>
                        )}
                      </div>
                      <div className="rounded-xl bg-slate-50 p-2">
                        <p className="text-xs uppercase tracking-[0.08em] text-zinc-500">Email</p>
                        <p className="mt-1 break-all text-sm font-medium text-zinc-800">{entry.email || '--'}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span
                        className={
                          entry.role === 'admin'
                            ? 'rounded-full bg-cyan-100 px-2 py-1 text-sm font-semibold text-cyan-800'
                            : 'rounded-full bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800'
                        }
                      >
                        {(entry.role || 'OPERADOR').toUpperCase()}
                      </span>
                      <span
                        className={
                          isBlocked
                            ? 'rounded-full bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-800'
                            : 'rounded-full bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800'
                        }
                      >
                        {isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                      </span>
                    </div>

                    {isEditingName ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleCancelEditUserName()}
                          disabled={isNameBusy}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleUpdateUserName(entry.uid, editingUserName, editingUserCargo)}
                          disabled={isNameBusy}
                        >
                          {isNameBusy ? 'Salvando dados...' : 'Salvar dados'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                          onClick={() => handleStartEditUserName(entry)}
                          disabled={isRoleBusy || isAccessBusy || isNameBusy}
                        >
                          Editar
                        </button>
                        {isSelf ? (
                          <button
                            type="button"
                            className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-zinc-600"
                            disabled
                          >
                            Usuário atual
                          </button>
                        ) : (
                          <>
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleUpdateRole(entry.uid, nextRole)}
                              disabled={isRoleBusy || isAccessBusy || isNameBusy}
                            >
                              {isRoleBusy ? 'Atualizando perfil...' : `Tornar ${nextRole.toUpperCase()}`}
                            </button>

                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleToggleUserAccess(entry.uid, !isBlocked)}
                              disabled={isAccessBusy || isRoleBusy || isNameBusy}
                            >
                              {isAccessBusy ? 'Atualizando acesso...' : isBlocked ? 'Liberar acesso' : 'Bloquear acesso'}
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white/80 md:block">
            <table className="min-w-full border-collapse text-left text-sm">
              <thead className="bg-slate-100/90 text-zinc-600">
                <tr>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Cargo/Função</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Perfil</th>
                  <th className="px-4 py-3">Acesso</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {usersList.length === 0 && (
                  <tr>
                    <td colSpan="6" className="px-4 py-4 text-zinc-500">
                      Nenhum usuario encontrado.
                    </td>
                  </tr>
                )}

                {usersList.map((entry) => {
                  const isSelf = entry.uid === user.uid
                  const nextRole = entry.role === 'admin' ? 'OPERADOR' : 'admin'
                  const isBlocked = entry.blocked === true
                  const isRoleBusy = roleBusyUserId === entry.uid
                  const isAccessBusy = accessBusyUserId === entry.uid
                  const isNameBusy = nameBusyUserId === entry.uid
                  const isEditingName = editingUserId === entry.uid

                  return (
                    <tr key={entry.uid} className="border-t border-slate-100/80 even:bg-slate-50/70">
                      <td className="px-4 py-3 text-zinc-700 min-w-[220px]">
                        {isEditingName ? (
                          <input
                            className="field-input py-2"
                            value={editingUserName}
                            onChange={(event) => setEditingUserName(event.target.value)}
                            placeholder="Nome completo"
                            aria-label={`Nome do usuário ${entry.email || entry.uid}`}
                          />
                        ) : (
                          entry.nome || '--'
                        )}
                      </td>
                      <td className="px-4 py-3 text-zinc-600 min-w-[180px]">
                        {isEditingName ? (
                          <input
                            className="field-input py-2"
                            value={editingUserCargo}
                            onChange={(event) => setEditingUserCargo(event.target.value)}
                            placeholder="Cargo/Função"
                            aria-label={`Cargo/Função do usuário ${entry.email || entry.uid}`}
                          />
                        ) : (
                          entry.cargo || '--'
                        )}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{entry.email || '--'}</td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            entry.role === 'admin'
                              ? 'rounded-full bg-cyan-100 px-2 py-1 text-sm font-semibold text-cyan-800'
                              : 'rounded-full bg-amber-100 px-2 py-1 text-sm font-semibold text-amber-800'
                          }
                        >
                          {(entry.role || 'OPERADOR').toUpperCase()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={
                            isBlocked
                              ? 'rounded-full bg-rose-100 px-2 py-1 text-sm font-semibold text-rose-800'
                              : 'rounded-full bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-800'
                          }
                        >
                          {isBlocked ? 'BLOQUEADO' : 'ATIVO'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditingName ? (
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleCancelEditUserName()}
                              disabled={isNameBusy}
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              className="rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleUpdateUserName(entry.uid, editingUserName, editingUserCargo)}
                              disabled={isNameBusy}
                            >
                              {isNameBusy ? 'Salvando dados...' : 'Salvar dados'}
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-wrap justify-end gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                              onClick={() => handleStartEditUserName(entry)}
                              disabled={isRoleBusy || isAccessBusy || isNameBusy}
                            >
                              Editar
                            </button>
                            {isSelf ? (
                              <button
                                type="button"
                                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-zinc-600"
                                disabled
                              >
                                Usuário atual
                              </button>
                            ) : (
                              <>
                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => handleUpdateRole(entry.uid, nextRole)}
                                  disabled={isRoleBusy || isAccessBusy || isNameBusy}
                                >
                                  {isRoleBusy ? 'Atualizando perfil...' : `Tornar ${nextRole.toUpperCase()}`}
                                </button>

                                <button
                                  type="button"
                                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                                  onClick={() => handleToggleUserAccess(entry.uid, !isBlocked)}
                                  disabled={isAccessBusy || isRoleBusy || isNameBusy}
                                >
                                  {isAccessBusy ? 'Atualizando acesso...' : isBlocked ? 'Liberar acesso' : 'Bloquear acesso'}
                                </button>
                              </>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </section>
  )
}
