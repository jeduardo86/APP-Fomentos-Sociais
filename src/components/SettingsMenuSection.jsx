export function SettingsMenuSection({
  baseCsv,
  csvUrl,
  destinacoes,
  handleSalvarCsvLink,
  handleSyncCsv,
  isAdmin,
  isSavingCsvLink,
  isSyncing,
  pendentes,
  setCsvUrl,
}) {
  return (
    <section>
      <article className="panel panel-soft">
        <h2 className="text-lg font-semibold text-zinc-900">Configuração do CSV</h2>
        <p className="mt-1 text-sm text-zinc-600">Defina e salve o link público para sincronização da base.</p>

        <form className="mt-5 space-y-3" onSubmit={handleSalvarCsvLink}>
          <label className="field-label" htmlFor="csvUrl">
            Link público do CSV
          </label>
          <input
            id="csvUrl"
            className="field-input"
            type="url"
            value={csvUrl}
            onChange={(event) => setCsvUrl(event.target.value)}
            placeholder="https://dominio.com/base.csv"
          />
          <button className="btn-primary w-full" type="submit" disabled={isSavingCsvLink || !isAdmin}>
            {isSavingCsvLink ? 'Salvando link...' : 'Salvar link do CSV'}
          </button>
        </form>

        <button
          className="mt-3 btn-primary w-full"
          type="button"
          onClick={handleSyncCsv}
          disabled={isSyncing || !isAdmin}
        >
          {isSyncing ? 'Sincronizando...' : 'Sincronizar base agora'}
        </button>

        {!isAdmin && (
          <p className="mt-2 text-sm font-medium text-amber-700">
            Somente usuários com perfil ADMIN podem alterar configurações.
          </p>
        )}

        <div className="mt-5 rounded-2xl border border-slate-200/70 bg-slate-100/80 p-4 text-sm text-zinc-700">
          <p>Processos em cache: {baseCsv.length}</p>
          <p>Destinações registradas: {destinacoes.length}</p>
          <p>Pagamentos pendentes: {pendentes.length}</p>
        </div>
      </article>
    </section>
  )
}
