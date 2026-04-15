import React from 'react'

export function ConfirmacaoAcaoModal({ isOpen, onClose, onEscolha, loading }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-zinc-900/45 p-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <h2 className="text-lg font-semibold text-zinc-900 mb-2">Salvar destinação</h2>
        <p className="text-zinc-700 mb-6">Deseja baixar o arquivo PDF após salvar ou apenas efetuar o lançamento?</p>
        <div className="flex gap-3 justify-end">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-zinc-700 transition hover:bg-slate-50"
            onClick={onClose}
            disabled={loading}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="btn-primary px-4 py-2"
            onClick={() => onEscolha('baixar')}
            disabled={loading}
          >
            Baixar PDF
          </button>
          <button
            type="button"
            className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:opacity-60"
            onClick={() => onEscolha('lançar')}
            disabled={loading}
          >
            Apenas lançar
          </button>
        </div>
      </div>
    </div>
  )
}
