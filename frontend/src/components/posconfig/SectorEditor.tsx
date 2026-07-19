import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';
import TableMapDesigner from './TableMapDesigner';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

// Parâmetros do SETOR (os do terminal são outros). O número é a referência do suporte.
const SECTOR_PARAMS = [
  { g: 'Geral', n: 8573, name: 'Teclados (Front Office)', kind: 'LIST', src: 'keyboards' },
  { g: 'Geral', n: 8575, name: 'Complexo', kind: 'CHOICE', choices: ['UNICO (Único)', 'MULTIPLO'] },
  { g: 'Geral', n: 8581, name: 'Tipos de Cliente', kind: 'LIST', src: 'customerTypes', todos: true },
  { g: 'Geral', n: 8582, name: 'Descontos', kind: 'LIST', src: 'discounts', todos: true },
  { g: 'Geral', n: 8592, name: 'Preços Disponíveis', kind: 'CHOICE', choices: ['Preço 1', 'Preço 2', 'Preço 3', 'Preço 4', 'Preço 5', 'Preço 6'] },
  { g: 'Geral', n: 8596, name: 'Estado da mesa após fechar', kind: 'CHOICE', choices: ['Disponível', 'Limpeza', 'Reservada'] },
  { g: 'Geral', n: 8611, name: 'Períodos - Reporting', kind: 'LIST', src: 'timeBands' },
  // Cada linha só oferece as séries DO SEU TIPO (dt = tipos de documento aceites): pôr
  // uma série de Nota de Crédito na linha da Fatura-Recibo era emitir o documento errado
  // — e um documento fiscal errado não se apaga, anula-se. Onde não há tipo exato na
  // tabela de séries, a linha mostra todas em vez de esconder o que existe.
  { g: 'Documentos', n: 8557, name: 'Fatura Recibo', kind: 'LIST', src: 'series', dt: [2] },
  { g: 'Documentos', n: 8556, name: 'Nota de Crédito', kind: 'LIST', src: 'series', dt: [5] },
  { g: 'Documentos', n: 8555, name: 'Consulta de Conta', kind: 'LIST', src: 'series', dt: [7] },
  { g: 'Documentos', n: 8553, name: 'Talão', kind: 'LIST', src: 'series', dt: [3, 4] },
  { g: 'Documentos', n: 8558, name: 'Recibo', kind: 'LIST', src: 'series', dt: [12] },
  { g: 'Documentos', n: 8562, name: 'Fatura CC', kind: 'LIST', src: 'series', dt: [1] },
  { g: 'Documentos', n: 8587, name: 'Anulação Recibo', kind: 'LIST', src: 'series' },
  { g: 'Documentos', n: 8588, name: 'Nota de Recebimento', kind: 'LIST', src: 'series', dt: [10, 11] },
  { g: 'Documentos', n: 8589, name: 'Anulação nota recebimento', kind: 'LIST', src: 'series' },
];

/** SETOR — a sala de venda. Define o teclado, o preço, o armazém e o happy hour. */
export default function SectorEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ price_level: 1, seats: 0, params: {}, is_active: true, ...row });
  const [map, setMap] = useState<'none' | 'design' | 'online'>('none');

  const { data: warehouses = [] } = useQuery({ queryKey: ['posc', 'whs'], queryFn: async () => { const r = await apiClient.get('inventory/warehouses/'); return r.data?.results || r.data || []; } });
  const { data: promos = [] } = useQuery({ queryKey: ['posc', 'promos'], queryFn: async () => { try { const r = await apiClient.get('commercial/promotions/'); return r.data?.results || r.data || []; } catch { return []; } } });
  const { data: outlets = [] } = useQuery({ queryKey: ['posc', 'outlets'], queryFn: async () => (await apiClient.get('pos/outlets/')).data });
  // AS LISTAS REAIS do backoffice — é daqui que vêm as opções de cada linha.
  const lista = (chave: string, url: string) => useQuery({
    queryKey: ['posc', chave],
    queryFn: async () => { try { const r = await apiClient.get(url); return (r.data?.results || r.data || []) as any[]; } catch { return []; } },
  }).data || [];
  const FONTES: Record<string, { id: any; label: string; dt?: number }[]> = {
    // (8573) os TECLADOS criados — escolhe-se qual serve esta sala
    keyboards: lista('keyboards', 'pos/config/keyboards/').map((k: any) => ({ id: k.id, label: `${k.number} · ${k.name}` })),
    // (8553-8589) as SÉRIES de documento (é a série que numera e assina).
    // O nome da série é opcional e quase nunca está preenchido — identificá-la só por
    // ele dava doze linhas iguais ("A — null") e nenhuma escolhível. Quem manda é o
    // TIPO (FR, NC, CM…); a letra da série vem a seguir, que é como se distinguem duas
    // séries do mesmo tipo.
    series: lista('docseries', 'pos/config/documents/').map((x: any) => ({
      id: x.id, dt: x.doc_type,
      label: `${x.type_code} — ${x.name || x.type_name}${x.code ? ` (série ${x.code}${x.year ? '/' + x.year : ''})` : ''}`,
    })),
    customerTypes: lista('custtypes', 'pos/config/customer-types/').map((x: any) => ({ id: x.id, label: x.name })),
    discounts: lista('descontos', 'pos/config/discounts/').map((x: any) => ({ id: x.id, label: `${x.code} — ${x.name}` })),
    timeBands: lista('bands', 'pos/config/time-bands/').map((x: any) => ({ id: x.id, label: x.name })),
  };

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/sectors/', d)
      : apiClient.patch(`pos/config/sectors/${row.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Setor gravado', message: 'O teclado, o preço e o armazém deste setor entram em vigor no próximo início de sessão.' }); onClose(); },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const setP = (n: number, v: any) => set('params', { ...(d.params || {}), [n]: v });
  const groups = Array.from(new Set(SECTOR_PARAMS.map((p) => p.g)));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo setor' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Identificação */}
        <div className="w-[46%] flex-shrink-0 p-4 space-y-2 border-r border-[#e0e0e0] overflow-auto">
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={`${inp} w-[280px]`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={`${inp} flex-1`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Tipo Preço:</span>
            <input type="number" min={1} max={6} value={d.price_level ?? 1} onChange={(e) => set('price_level', Number(e.target.value))}
              className={`${inp} w-[280px]`} style={inputStyle} />
            <span className="text-[11px] text-[#666]">nível de preço do artigo</span>
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Happy Hour:</span>
            <select value={d.happy_hour || ''} onChange={(e) => set('happy_hour', Number(e.target.value) || null)} className={`${inp} w-[280px]`} style={inputStyle}>
              <option value="">Nenhum</option>
              {promos.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Armazém:</span>
            <select value={d.warehouse || ''} onChange={(e) => set('warehouse', Number(e.target.value) || null)} className={`${inp} w-[280px]`} style={inputStyle}>
              <option value="">Nenhum</option>
              {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
            <span className="text-[11px] text-[#666]">de onde sai o stock</span>
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Outlet:</span>
            <select value={d.outlet || ''} onChange={(e) => set('outlet', Number(e.target.value) || null)} className={`${inp} w-[280px]`} style={inputStyle}>
              <option value="">—</option>
              {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[90px] text-[#333]">Lugares:</span>
            <input type="number" value={d.seats ?? 0} onChange={(e) => set('seats', Number(e.target.value))} className={`${inp} w-[280px]`} style={inputStyle} />
          </label>
        </div>

        {/* Parâmetros do setor */}
        <div className="flex-1 overflow-auto">
          {groups.map((g) => (
            <div key={g}>
              <div className="px-3 py-1.5 bg-[#e9e9e9] text-[13px] font-bold text-[#333] border-y border-[#d0d0d0]">{g}</div>
              <table className="w-full text-[12px] border-collapse">
                <tbody>
                  {SECTOR_PARAMS.filter((p) => p.g === g).map((p) => {
                    const v = (d.params || {})[p.n] ?? '';
                    return (
                      <tr key={p.n} className="border-b border-[#eee] hover:bg-[#f7f9fb]">
                        <td className="px-3 py-1.5 w-[55%]"><span className="text-[#666]">({p.n})</span> {p.name}</td>
                        <td className="px-2 py-1">
                          {p.kind === 'CHOICE' ? (
                            <select value={v} onChange={(e) => setP(p.n, e.target.value)} className={cell}>
                              <option value="">(nenhum)</option>
                              {p.choices!.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          ) : p.kind === 'LIST' ? (
                            <select value={v} onChange={(e) => setP(p.n, e.target.value)} className={cell}>
                              <option value="">(nenhum)</option>
                              {(p as any).todos && <option value="TODOS">(todos)</option>}
                              {(FONTES[(p as any).src] || [])
                                .filter((o) => !(p as any).dt || o.dt == null
                                  || (p as any).dt.includes(o.dt))
                                .map((o) => (
                                  <option key={o.id} value={o.id}>{o.label}</option>))}
                            </select>
                          ) : (
                            <input value={v} onChange={(e) => setP(p.n, e.target.value)} placeholder="(nenhum)" className={cell} />
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>

      {map !== 'none' && !isNew && (
        <TableMapDesigner sector={d} mode={map} onClose={() => { setMap('none'); qc.invalidateQueries({ queryKey: ['posc'] }); }} />
      )}

      <Toolbar actions={[
        { icon: '▦', label: 'Mesas', color: '#4caf50', disabled: isNew, onClick: () => setMap('design') },
        { icon: '▦', label: 'Mesas - Online', color: '#29b6f6', disabled: isNew, onClick: () => setMap('online') },
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
