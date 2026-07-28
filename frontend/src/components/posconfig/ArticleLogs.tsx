import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

/** "Visualizar Logs" — cada campo alterado desta ficha, com o que era e o que
    passou a ser (inventory.ItemChangeLog, registado a cada Gravar). */
export default function ArticleLogs({ id, nome, onClose }: {
  id: number; nome?: string; onClose: () => void;
}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [de, setDe] = useState('2018-01-01');
  const [ate, setAte] = useState(hoje);
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isFetching } = useQuery({
    queryKey: ['posc', 'article-logs', id, de, ate, page],
    queryFn: async () => {
      const r = await apiClient.get(`inventory/pos/articles/${id}/logs/`, {
        params: { from: de, to: ate, page, page_size: pageSize },
      });
      if (Array.isArray(r.data)) return { results: r.data, count: r.data.length };
      return r.data;
    },
  });

  const linhas = data?.results || [];
  const total = data?.count ?? linhas.length;
  const totalPaginas = Math.max(1, Math.ceil(total / pageSize));

  const exportar = () => {
    const cab = 'Log Time;Utilizador;Campo;Antes;Depois\n';
    const corpo = linhas.map((l: any) =>
      `${new Date(l.changed_at).toLocaleString('pt-PT')};${l.changed_by};${l.field_name};${l.old_value ?? ''};${l.new_value ?? ''}`
    ).join('\n');
    const blob = new Blob(['﻿' + cab + corpo], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `logs_${nome || id}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px]';

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="bg-white w-[900px] max-w-[95vw] h-[640px] max-h-[92vh] flex flex-col shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-3 py-2 bg-[#2b2b2b] text-white">
          <span className="text-[14px] font-bold">Visualizar Logs{nome ? `: ${nome}` : ''}</span>
          <button onClick={onClose} className="text-white/80 hover:text-white text-[16px]">✕</button>
        </div>

        <div className="p-3 border-b border-[#ddd] flex items-end gap-3">
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">De data:
            <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPage(1); }} className={inp} />
          </label>
          <label className="text-[11px] text-[#555] flex flex-col gap-0.5">Até à data:
            <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPage(1); }} className={inp} />
          </label>
          <span className="text-[11px] text-[#999] ml-auto">{isFetching ? 'A atualizar…' : `${total} registo(s)`}</span>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full text-[12px] border-collapse">
            <thead className="sticky top-0 bg-[#eee]">
              <tr>
                {['Log Time', 'Utilizador', 'Campo', 'Antes', 'Depois'].map((h) => (
                  <th key={h} className="text-left px-2 py-1 border border-[#ddd] font-semibold">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l: any) => (
                <tr key={l.id} className="hover:bg-[#f5f5f5]">
                  <td className="px-2 py-1 border border-[#eee] whitespace-nowrap">{new Date(l.changed_at).toLocaleString('pt-PT')}</td>
                  <td className="px-2 py-1 border border-[#eee]">{l.changed_by}</td>
                  <td className="px-2 py-1 border border-[#eee] font-mono">{l.field_name}</td>
                  <td className="px-2 py-1 border border-[#eee] text-[#a01818]">{l.old_value || '(nenhum)'}</td>
                  <td className="px-2 py-1 border border-[#eee] text-[#1f7a34]">{l.new_value || '(nenhum)'}</td>
                </tr>
              ))}
              {!isFetching && linhas.length === 0 && (
                <tr><td colSpan={5} className="text-center text-[#999] py-8">Sem alterações neste período.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between px-3 py-2 border-t border-[#ddd] bg-[#f7f7f7] text-[12px]">
          <span>Página {page} de {totalPaginas}</span>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1} className="px-2 py-1 border border-[#ccc] disabled:opacity-30">‹</button>
            <button onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas} className="px-2 py-1 border border-[#ccc] disabled:opacity-30">›</button>
          </div>
        </div>

        <div className="flex justify-between px-3 py-2 border-t border-[#ddd]">
          <button onClick={exportar}
            className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-bold text-white" style={{ background: '#1f7a34' }}>
            ⬇ Exportar para Excel
          </button>
          <button onClick={onClose}
            className="flex items-center gap-2 px-4 py-1.5 text-[12px] font-bold text-white" style={{ background: '#c0392b' }}>
            ✖ Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
