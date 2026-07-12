import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#dcdcdc] px-1.5 py-1 text-[12px] bg-white';

const HW_TYPES = [
  { value: 'DRAWER', label: 'Gaveta' }, { value: 'SCALE', label: 'Balança' },
  { value: 'SCANNER', label: 'Leitor de códigos' }, { value: 'DISPLAY', label: 'Display de cliente' },
  { value: 'CARD', label: 'Terminal bancário' }, { value: 'OTHER', label: 'Outro' },
];

/**
 * TERMINAL — o posto de venda.
 *
 * Os PARÂMETROS têm número (8523, 8610…) de propósito: é por ele que o suporte fala
 * com o cliente ao telefone ("mude o 8610"). O número não muda, o nome pode mudar.
 */
export default function TerminalEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<'geral' | 'printers' | 'hardware'>('geral');
  const [q, setQ] = useState('');
  const [d, setD] = useState<any>({ terminal_type: 'NORMAL', is_active: true, params: {}, printers: [], hardware: [], ...row });

  const { data: params = [] } = useQuery({ queryKey: ['posc', 'params'], queryFn: async () => (await apiClient.get('pos/config/parameters/')).data });
  const { data: printers = [] } = useQuery({ queryKey: ['posc', 'printers'], queryFn: async () => (await apiClient.get('inventory/pos/printers/')).data });
  const { data: outlets = [] } = useQuery({ queryKey: ['posc', 'outlets'], queryFn: async () => (await apiClient.get('pos/outlets/')).data });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/terminals/', d)
      : apiClient.patch(`pos/config/terminals/${row.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Terminal gravado', message: 'A configuração entra em vigor no próximo início de sessão do terminal.' }); onClose(); },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const setParam = (n: number, v: any) => set('params', { ...(d.params || {}), [n]: v });

  const tprinters: any[] = d.printers || [];
  const hw: any[] = d.hardware || [];
  const togglePrinter = (pid: number) => {
    const has = tprinters.find((x) => x.printer === pid);
    set('printers', has ? tprinters.filter((x) => x.printer !== pid)
      : [...tprinters, { printer: pid, location: 'TERMINAL', is_active: true, one_item_per_ticket: false }]);
  };
  const setP = (pid: number, k: string, v: any) =>
    set('printers', tprinters.map((x) => x.printer === pid ? { ...x, [k]: v } : x));
  const addHw = () => set('hardware', [...hw, { code: '', description: '', hw_type: 'OTHER', port: '', is_active: true }]);
  const setHw = (i: number, k: string, v: any) => set('hardware', hw.map((x, j) => j === i ? { ...x, [k]: v } : x));

  const shown = params.filter((p: any) => !q || `${p.number} ${p.name}`.toLowerCase().includes(q.toLowerCase()));

  const Tab = ({ id, label }: any) => (
    <button onClick={() => setTab(id)}
      className={`px-5 py-1.5 text-[13px] font-semibold border-b-[3px] ${tab === id ? 'border-[#2b2b2b] text-[#111]' : 'border-transparent text-[#666] hover:text-[#111]'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Novo terminal' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      {/* Identificação */}
      <div className="grid grid-cols-2 gap-x-10 gap-y-2 px-4 py-3 border-b border-[#e0e0e0]">
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[90px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
          <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={`${inp} w-[220px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[70px] text-[#333]">Tipo:</span>
          <select value={d.terminal_type} onChange={(e) => set('terminal_type', e.target.value)} className={`${inp} w-[240px]`} style={inputStyle}>
            <option value="NORMAL">Normal</option>
            <option value="VIRTUAL">Virtual</option>
            <option value="MOBILE">Portátil</option>
          </select>
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[90px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
          <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={`${inp} w-[300px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[70px] text-[#333]">Outlet:</span>
          <select value={d.outlet || ''} onChange={(e) => set('outlet', Number(e.target.value) || null)} className={`${inp} w-[240px]`} style={inputStyle}>
            <option value="">—</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>

      <div className="flex border-b-2 border-[#2b2b2b] bg-[#f7f7f7] px-2">
        <Tab id="geral" label="Geral" /><Tab id="printers" label="Impressoras" /><Tab id="hardware" label="Hardware" />
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'geral' && (
          <>
            <div className="flex items-center gap-3 mb-2 text-[13px] bg-[#f0f0f0] px-3 py-2 border border-[#e0e0e0]">
              <span>Pesquisar:</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} w-[240px]`} style={inputStyle} />
              <span className="text-[11px] text-[#666] ml-auto">
                O número (ex.: 8610) é a referência do parâmetro — é por ele que o suporte fala consigo.
              </span>
            </div>
            <table className="w-full text-[12px] border-collapse">
              <thead><tr className="bg-[#e9e9e9]"><th colSpan={2} className="text-left px-2 py-1.5 border border-[#d5d5d5] font-bold">Geral</th></tr></thead>
              <tbody>
                {shown.map((p: any) => {
                  const v = (d.params || {})[p.number] ?? p.default;
                  return (
                    <tr key={p.number} className="border-b border-[#eee] hover:bg-[#f7f9fb]">
                      <td className="px-2 py-1.5 border border-[#eee]" title={p.help_text}>
                        <span className="text-[#666]">({p.number})</span> {p.name}
                      </td>
                      <td className="px-2 py-1 border border-[#eee] w-[45%]">
                        {p.kind === 'BOOL' ? (
                          <input type="checkbox" checked={v === true || v === 'true'} onChange={(e) => setParam(p.number, e.target.checked)} className="w-4 h-4" />
                        ) : p.kind === 'CHOICE' ? (
                          <select value={v || ''} onChange={(e) => setParam(p.number, e.target.value)} className={cell}>
                            <option value="">(nenhum)</option>
                            {(p.choices || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        ) : (
                          <input type={p.kind === 'INT' ? 'number' : 'text'} value={v || ''}
                            onChange={(e) => setParam(p.number, e.target.value)} placeholder="(nenhum)" className={cell} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {tab === 'printers' && (
          <table className="w-full text-[12px] border-collapse">
            <thead><tr className="bg-[#f0f0f0]">
              {['Ativo', 'Código', 'Descrição', 'Porta', 'Localização Impressora', 'Um artigo por talão', 'Monitores de cozinha'].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {printers.map((p: any) => {
                const tp = tprinters.find((x) => x.printer === p.id);
                return (
                  <tr key={p.id} className="border-b border-[#eee]">
                    <td className="text-center border border-[#eee]">
                      <input type="checkbox" checked={!!tp} onChange={() => togglePrinter(p.id)} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-1.5 border border-[#eee] font-mono">{p.code}</td>
                    <td className="px-2 py-1.5 border border-[#eee]">{p.name}</td>
                    <td className="p-0.5 border border-[#eee] w-[110px]">
                      <input value={tp?.port || ''} disabled={!tp} onChange={(e) => setP(p.id, 'port', e.target.value)}
                        placeholder="COM1 / IP" className={`${cell} disabled:bg-[#f4f4f4]`} />
                    </td>
                    <td className="p-0.5 border border-[#eee] w-[150px]">
                      <select value={tp?.location || 'TERMINAL'} disabled={!tp} onChange={(e) => setP(p.id, 'location', e.target.value)}
                        className={`${cell} disabled:bg-[#f4f4f4]`}>
                        <option value="TERMINAL">Terminal</option><option value="SERVER">Servidor</option><option value="NETWORK">Rede</option>
                      </select>
                    </td>
                    <td className="text-center border border-[#eee]">
                      <input type="checkbox" checked={!!tp?.one_item_per_ticket} disabled={!tp}
                        onChange={(e) => setP(p.id, 'one_item_per_ticket', e.target.checked)} className="w-4 h-4" />
                    </td>
                    <td className="p-0.5 border border-[#eee] w-[150px]">
                      <input value={tp?.kds_monitor || ''} disabled={!tp} onChange={(e) => setP(p.id, 'kds_monitor', e.target.value)}
                        placeholder="(nenhum)" className={`${cell} disabled:bg-[#f4f4f4]`} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {tab === 'hardware' && (
          <div>
            <table className="w-full text-[12px] border-collapse">
              <thead><tr className="bg-[#f0f0f0]">
                {['Código', 'Descrição', 'Tipo', 'Porta', 'Ativo', ''].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#d5d5d5]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {hw.map((h, i) => (
                  <tr key={i} className="border-b border-[#eee]">
                    <td className="p-0.5 border border-[#eee]"><input value={h.code} onChange={(e) => setHw(i, 'code', e.target.value)} className={cell} /></td>
                    <td className="p-0.5 border border-[#eee]"><input value={h.description} onChange={(e) => setHw(i, 'description', e.target.value)} className={cell} /></td>
                    <td className="p-0.5 border border-[#eee] w-[180px]">
                      <select value={h.hw_type} onChange={(e) => setHw(i, 'hw_type', e.target.value)} className={cell}>
                        {HW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="p-0.5 border border-[#eee] w-[120px]"><input value={h.port || ''} onChange={(e) => setHw(i, 'port', e.target.value)} placeholder="COM1" className={cell} /></td>
                    <td className="text-center border border-[#eee]"><input type="checkbox" checked={!!h.is_active} onChange={(e) => setHw(i, 'is_active', e.target.checked)} className="w-4 h-4" /></td>
                    <td className="text-center border border-[#eee]">
                      <button onClick={() => set('hardware', hw.filter((_, j) => j !== i))} className="text-red-600 font-bold text-[11px]">Apagar</button>
                    </td>
                  </tr>
                ))}
                {hw.length === 0 && <tr><td colSpan={6} className="text-center text-[#999] py-8">Sem periféricos ligados a este terminal.</td></tr>}
              </tbody>
            </table>
            <button onClick={addHw} className="flex items-center gap-2 mt-2 text-[13px] text-[#333] px-1 py-1 hover:bg-[#f0f0f0]">
              <span className="w-6 h-6 rounded-full bg-[#2b2b2b] text-white flex items-center justify-center">＋</span> Adicionar
            </button>
          </div>
        )}
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
