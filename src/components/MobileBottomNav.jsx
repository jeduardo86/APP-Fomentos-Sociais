export function MobileBottomNav({
  activeMenu,
  handleLogout,
  handleSelectMobileMenu,
  handleToggleFontSize,
  isAdmin,
  isLargeFontEnabled,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  user,
}) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur lg:hidden"
      aria-label="Menu mobile"
    >
      <div className="mx-auto max-w-2xl">
        {isMobileMenuOpen && (
          <div id="mobile-menu-actions" className="mb-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-lg">
            <div className="grid gap-2">
              <div className="rounded-2xl border border-cyan-200 bg-cyan-50/80 px-4 py-3">
                <p className="text-sm uppercase tracking-[0.14em] text-cyan-700">Operação ativa</p>
                <p className="mt-1 break-all text-sm font-semibold text-cyan-900">{user.email || user.uid}</p>
                <p className="mt-1 text-sm font-semibold uppercase tracking-[0.14em] text-cyan-700">
                  Perfil: {isAdmin ? 'ADMIN' : 'OPERADOR'}
                </p>
              </div>

              <button
                type="button"
                className={activeMenu === 'operacional' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => handleSelectMobileMenu('operacional')}
              >
                Operacional
              </button>
              <button
                type="button"
                className={activeMenu === 'cadastros' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => handleSelectMobileMenu('cadastros')}
              >
                Cadastros
              </button>
              <button
                type="button"
                className={activeMenu === 'relatorios' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => handleSelectMobileMenu('relatorios')}
              >
                Relatórios
              </button>
              <button
                type="button"
                className={activeMenu === 'configuracoes' ? 'tab tab-active w-full text-left' : 'tab w-full text-left'}
                onClick={() => handleSelectMobileMenu('configuracoes')}
              >
                Configurações
              </button>
              <button
                type="button"
                className={
                  isLargeFontEnabled
                    ? 'w-full rounded-xl border border-cyan-300 bg-cyan-50 px-4 py-2 text-left text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100'
                    : 'w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-sm font-semibold text-zinc-700 transition hover:bg-slate-50'
                }
                onClick={handleToggleFontSize}
                aria-pressed={isLargeFontEnabled}
                title="Alternar modo de fonte grande"
              >
                {isLargeFontEnabled ? 'Fonte grande: ligada' : 'Fonte grande: desligada'}
              </button>

              <button
                type="button"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-left text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
                onClick={() => {
                  setIsMobileMenuOpen(false)
                  handleLogout()
                }}
              >
                Encerrar Sessão
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          className="tab w-full"
          onClick={() => setIsMobileMenuOpen((current) => !current)}
          aria-expanded={isMobileMenuOpen}
          aria-controls="mobile-menu-actions"
        >
          Menu
        </button>
      </div>
    </nav>
  )
}
