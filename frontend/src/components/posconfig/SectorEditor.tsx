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
  { g: 'Geral', n: 8573, name: 'Teclados (Front Office)', kind: 'TEXT' },
  { g: 'Geral', n: 8575, name: 'Complexo', kind: 'CHOICE', choices: ['UNICO (Único)', 'MULTIPLO'] },
  { g: 'Geral', n: 8581, name: 'Tipos de Cliente', kind: 'CHOICE', choices: ['Todos', 'Hóspedes', 'Passantes'] },
  { g: 'Geral', n: 8582, name: 'Descontos', kind: 'CHOICE', choices: ['Todos', 'Nenhum', 'Só supervisor'] },
  { g: 'Geral', n: 8592, name: 'Preços Disponíveis', kind: 'CHOICE', choices: ['Todos', 'Só o do setor'] },
  { g: 'Geral', n: 8596, name: 'Estado da mesa após fechar', kind: 'CHOICE', choices: ['Disponível', 'Limpeza'] },
  { g: 'Geral', n: 8611, name: 'Períodos - Reporting', kind: 'TEXT' },
  { g: 'Documentos', n: 8557, name: 'Fatura Recibo', kind: 'DOC' },
  { g: 'Documentos', n: 8556, name: 'Nota de Crédito', kind: 'DOC' },
  { g: 'Documentos', n: 8555, name: 'Consulta de Conta', kind: 'DOC' },
  { g: 'Documentos', n: 8553, name: 'Talão', kind: 'DOC' },
  { g: 'Documentos', n: 8558, name: 'Recibo', kind: 'DOC' },
  { g: 'Documentos', n: 8562, name: 'Fatura CC', kind: 'DOC' },
  { g: 'Documentos', n: 8587, name: 'Anulação Recibo', kind: 'DOC' },
  { g: 'Documentos', n: 8588, name: 'Nota de Recebimento', kind: 'DOC' },
  { g: 'Documentos', n: 8589, name: 'Anulação nota recebimento', kind: 'DOC' },
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
  const { data: docTypes = [] } = useQuery({ queryKey: ['posc', 'doctypes'], queryFn: async () => { try { const r = await apiClient.get('fiscal/doc-types/'); return r.data?.results || r.data || []; } catch { return []; } } });

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
                          ) : p.kind === 'DOC' ? (
                            <select value={v} onChange={(e) => setP(p.n, e.target.value)} className={cell}>
                              <option value="">(nenhum)</option>
                              {docTypes.map((t: any) => <option key={t.id} value={t.code}>{t.code} ({t.name})</option>)}
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
