import { Toaster } from 'react-hot-toast'

export function AuthLoadingView() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-soft">
        <p className="text-sm font-medium text-zinc-600">Validando sessão...</p>
      </div>
    </div>
  )
}

export function LoginView({
  authBusy,
  authForm,
  onEmailChange,
  onGoogleAuth,
  onPasswordChange,
  onSubmit,
}) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <div className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full bg-cyan-300/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 -right-16 h-72 w-72 rounded-full bg-orange-300/30 blur-3xl" />

      <main className="relative z-10 mx-auto max-w-lg">
        <section className="panel panel-hero">
          <p className="text-sm uppercase tracking-[0.2em] text-cyan-700">Acesso protegido</p>
          <h1 className="headline mt-3 text-3xl font-semibold tracking-tight text-zinc-900">
            Entrar no sistema de fomentos
          </h1>
          <p className="mt-3 text-sm text-zinc-600">
            Apenas usuários autenticados podem escrever em destinações, entidades e empresas.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="field-label" htmlFor="authEmail">
                Email
              </label>
              <input
                id="authEmail"
                className="field-input"
                type="email"
                value={authForm.email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="usuario@dominio.com"
              />
            </div>

            <div>
              <label className="field-label" htmlFor="authPassword">
                Senha
              </label>
              <input
                id="authPassword"
                className="field-input"
                type="password"
                value={authForm.password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="********"
              />
            </div>

            <button className="btn-primary w-full" type="submit" disabled={authBusy}>
              {authBusy ? 'Processando...' : 'Entrar'}
            </button>
          </form>

          <button
            className="mt-3 btn-primary w-full"
            type="button"
            onClick={onGoogleAuth}
            disabled={authBusy}
          >
            Entrar com Google
          </button>

          <p className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-center text-sm text-zinc-600">
            Novos acessos são criados somente por administradores.
          </p>
        </section>
      </main>
    </div>
  )
}

export function ProfileLoadingView() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-app-pattern px-4 py-8 text-zinc-900 sm:px-6 lg:px-10">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200/80 bg-white/90 p-8 text-center shadow-soft">
        <p className="text-sm font-medium text-zinc-600">Validando permissão de acesso...</p>
      </div>
    </div>
  )
}
