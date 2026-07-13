import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

/**
 * MAPEAMENTO SETOR / ARMAZÉNS — de que armazém sai cada sub-família em cada setor.
 *
 * As mesmas águas vendidas no Restaurante saem do armazém do Restaurante; as do Bar
 * da Piscina, do armazém do Bar. Sem isto, o stock sai sempre do mesmo sítio e as
 * contagens NUNCA batem certo — e ninguém percebe porquê.
 *
 * As células a vermelho não têm armazém: aí, a venda desconta do armazém errado
 * (ou de nenhum).
 */
export default function SectorWarehouseMap() {
  const qc = useQueryClient();
  const [d, setD] = useState<any>({ outlets: [], warehouses: [], rows: [] });
  const [q, setQ] = useState('');
  const [armazem, setArmazem] = useState('');
  const [sel, setSel] = useState<number[]>([]);
  const [dirty, setDirty] = useState<Record<string, any>>({});

  const { data } = useQuery({
    queryKey: ['posc', 'sector-wh'],
    queryFn: async () => (await apiClient.get('pos/config/sector-warehouses/')).data,
  });
  useEffect(() => { if (data) setD(data); }, [data]);

  const save = useMutation({
    mutationFn: () => apiClient.post('pos/config/sector-warehouses/', { cells: Object.values(dirty) }),
    onSuccess: () => {
      setDirty({});
      qc.invalidateQueries({ queryKey: ['posc', 'sector-wh'] });
      notifyGuide({
        title: 'Mapeamentos gravados',
        message: 'A venda passa a descontar do armazém certo em cada ponto de venda.',
      });
    },
    onError: notifyError,
  });

  const setCell = (sf: number, outlet: number, wh: string) => {
    setD((o: any) => ({
      ...o,
      rows: o.rows.map((r: any) => r.id !== sf ? r : {
        ...r,
        cells: {
          ...r.cells,
          [outlet]: {
            warehouse: wh ? Number(wh) : null,
            name: (d.warehouses.find((w: any) => w.id === Number(wh)) || {}).name || null,
          },
        },
      }),
    }));
    setDirty((o) => ({ ...o, [`${sf}-${outlet}`]: { subfamily: sf, outlet, warehouse: wh ? Number(wh) : null } }));
  };

  const rows = (d.rows || []).filter((r: any) =>
    !q || `${r.code} ${r.name}`.toLowerCase().includes(q.toLowerCase()));

  /** Aplica o armazém escolhido às linhas selecionadas, em todos os pontos de venda. */
  const aplicar = () => {
    if (!armazem || sel.length === 0) return;
    sel.forEach((sf) => (d.outlets || []).forEach((o: any) => setCell(sf, o.id, armazem)));
    notifyGuide({ title: 'Armazém aplicado', message: `${sel.length} sub-família(s). Carregue em Gravar.` });
  };

  const emFalta = (d.rows || []).filter((r: any) => r.incomplete).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center gap-3 px-3 py-2 bg-[#f7f7f7] border-b border-[#d0d0d0] text-[12px]">
        <span>Pesquisar:</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} w-[200px]`} style={inputStyle} />
        <span className="ml-2">Armazém:</span>
        <select value={armazem} onChange={(e) => setArmazem(e.target.value)}
          className={`${inp} w-[240px]`} style={inputStyle}>
          <option value="">—</option>
          {(d.warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
        <button onClick={aplicar} disabled={!armazem || sel.length === 0}
          className="flex items-center gap-2 px-2 py-1 hover:bg-[#e8e8e8] disabled:opacity-35">
          <span className="w-5 h-5 rounded-full bg-[#1f7a34] text-white flex items-center justify-center text-[11px]">✔</span>
          Aplicar à seleção ({sel.length})
        </button>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            <th className="w-[36px] border-b border-[#d0d0d0]" />
            <th className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">Descrição</th>
            {(d.outlets || []).map((o: any) => (
              <th key={o.id} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{o.name}</th>
            ))}
          </tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.id} className="border-b border-[#eee]">
                <td className="text-center">
                  <input type="checkbox" checked={sel.includes(r.id)} className="w-4 h-4"
                    onChange={(e) => setSel(e.target.checked ? [...sel, r.id] : sel.filter((x) => x !== r.id))} />
                </td>
                <td className="px-2 py-1 whitespace-nowrap">{r.code} - {r.name}</td>
                {(d.outlets || []).map((o: any) => {
                  const c = r.cells?.[o.id] || {};
                  return (
                    <td key={o.id} className="p-0.5" style={{ background: c.warehouse ? undefined : '#ffcdd2' }}>
                      <select value={c.warehouse || ''} onChange={(e) => setCell(r.id, o.id, e.target.value)}
                        className="w-full border-0 bg-transparent text-[12px] outline-none py-1">
                        <option value="">— sem armazém —</option>
                        {(d.warehouses || []).map((w: any) => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={2 + (d.outlets?.length || 0)} className="text-center text-[#999] py-10">
                Sem sub-famílias.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {emFalta > 0 && (
        <div className="px-3 py-1 text-[11px] text-[#a01818] bg-[#fdecea] border-t border-[#e6b0aa]">
          <b>{emFalta}</b> sub-família(s) sem armazém nalgum ponto de venda: aí, a venda desconta do
          armazém errado — e as contagens nunca vão bater certo.
        </div>
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : `Gravar${Object.keys(dirty).length ? ` (${Object.keys(dirty).length})` : ''}`,
          color: '#1f7a34', onClick: () => save.mutate() },
      ]} />
    </div>
  );
}
