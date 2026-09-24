import { Fragment, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, Box } from './kit';

const inp = 'border border-[#7FA9B1] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#EEF4F5] px-1.5 py-1 text-[12px] bg-white';

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

  // Só os parâmetros de SCOPE=TERMINAL — os globais vivem noutro ecrã (Parâmetros),
  // e o valor de cada um aqui é a substituição DESTE terminal (PosTerminal.params),
  // nunca o campo `value` do catálogo (esse é só para os globais).
  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'tparams'], queryFn: async () => (await apiClient.get('pos/config/params/?scope=TERMINAL')).data });
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

  const shown = groups
    .map((g: any) => ({ ...g, params: g.params.filter((p: any) =>
      !q || `${p.number} ${p.name}`.toLowerCase().includes(q.toLowerCase())) }))
    .filter((g: any) => g.params.length > 0);

  const Tab = ({ id, label }: any) => (
    <button onClick={() => setTab(id)}
      className={`px-5 py-1.5 text-[13px] font-semibold border-b-[3px] ${tab === id ? 'border-[#062A31] text-[#062A31]' : 'border-transparent text-[#5C8891] hover:text-[#062A31]'}`}>
      {label}
    </button>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F7FAFA] border-b border-[#EEF4F5]">
        <span className="text-[13px] font-bold text-[#041F24]">{isNew ? 'Novo terminal' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#5C8891] hover:text-black leading-none">×</button>
      </div>

      {/* Identificação */}
      <div className="px-4 py-3 border-b border-[#EEF4F5]">
      <Box title="Identificação">
      <div className="grid grid-cols-2 gap-x-10 gap-y-2 pt-1.5">
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[90px] text-[#041F24]">Código:<span className="text-[#B0392B]">*</span></span>
          <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={`${inp} w-[220px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[70px] text-[#041F24]">Tipo:</span>
          <select value={d.terminal_type} onChange={(e) => set('terminal_type', e.target.value)} className={`${inp} w-[240px]`} style={inputStyle}>
            <option value="NORMAL">Normal</option>
            <option value="VIRTUAL">Virtual</option>
            <option value="MOBILE">Portátil</option>
          </select>
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[90px] text-[#041F24]">Descrição:<span className="text-[#B0392B]">*</span></span>
          <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={`${inp} w-[300px]`} style={inputStyle} />
        </label>
        <label className="flex items-center gap-3 text-[13px]">
          <span className="w-[70px] text-[#041F24]">Outlet:</span>
          <select value={d.outlet || ''} onChange={(e) => set('outlet', Number(e.target.value) || null)} className={`${inp} w-[240px]`} style={inputStyle}>
            <option value="">—</option>
            {outlets.map((o: any) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>
      </div>
      </Box>
      </div>

      <div className="flex border-b-2 border-[#062A31] bg-[#F7FAFA] px-2">
        <Tab id="geral" label="Geral" /><Tab id="printers" label="Impressoras" /><Tab id="hardware" label="Hardware" />
      </div>

      <div className="flex-1 overflow-auto p-3">
        {tab === 'geral' && (
          <>
            <div className="flex items-center gap-3 mb-2 text-[13px] bg-[#F7FAFA] px-3 py-2 border border-[#EEF4F5]">
              <span>Pesquisar:</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} className={`${inp} w-[240px]`} style={inputStyle} />
              <span className="text-[11px] text-[#5C8891] ml-auto">
                O número (ex.: 8610) é a referência do parâmetro — é por ele que o suporte fala consigo.
              </span>
            </div>
            <table className="w-full text-[12px] border-collapse">
              <tbody>
                {shown.map((g: any) => (
                  <Fragment key={g.group}>
                    <tr className="bg-[#F7FAFA]">
                      <td colSpan={2} className="px-2 py-1.5 border border-[#EEF4F5] font-bold">{g.group}</td>
                    </tr>
                    {g.params.map((p: any) => {
                      const v = (d.params || {})[p.number] ?? p.default;
                      return (
                        <tr key={p.number} className="border-b border-[#F7FAFA] hover:bg-[#FFFFFF]">
                          <td className="px-2 py-1.5 border border-[#F7FAFA]" title={p.help_text}>
                            <span className="text-[#5C8891]">({p.number})</span> {p.name}
                            {p.help_text && <div className="text-[10px] text-[#5C8891] mt-0.5">{p.help_text}</div>}
                          </td>
                          <td className="px-2 py-1 border border-[#F7FAFA] w-[45%]">
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
                  </Fragment>
                ))}
                {shown.length === 0 && (
                  <tr><td colSpan={2} className="text-center text-[#7FA9B1] py-8">Nenhum parâmetro corresponde à pesquisa.</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}

        {tab === 'printers' && (
          <table className="w-full text-[12px] border-collapse">
            <thead><tr className="bg-[#F7FAFA]">
              {['Ativo', 'Código', 'Descrição', 'Porta', 'Localização Impressora', 'Um artigo por talão', 'Monitores de cozinha'].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {printers.map((p: any) => {
                const tp = tprinters.find((x) => x.printer === p.id);
                return (
                  <tr key={p.id} className="border-b border-[#F7FAFA]">
                    <td className="text-center border border-[#F7FAFA]">
                      <input type="checkbox" checked={!!tp} onChange={() => togglePrinter(p.id)} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-1.5 border border-[#F7FAFA] font-mono">{p.code}</td>
                    <td className="px-2 py-1.5 border border-[#F7FAFA]">{p.name}</td>
                    <td className="p-0.5 border border-[#F7FAFA] w-[110px]">
                      <input value={tp?.port || ''} disabled={!tp} onChange={(e) => setP(p.id, 'port', e.target.value)}
                        placeholder="COM1 / IP" className={`${cell} disabled:bg-[#F7FAFA]`} />
                    </td>
                    <td className="p-0.5 border border-[#F7FAFA] w-[150px]">
                      <select value={tp?.location || 'TERMINAL'} disabled={!tp} onChange={(e) => setP(p.id, 'location', e.target.value)}
                        className={`${cell} disabled:bg-[#F7FAFA]`}>
                        <option value="TERMINAL">Terminal</option><option value="SERVER">Servidor</option><option value="NETWORK">Rede</option>
                      </select>
                    </td>
                    <td className="text-center border border-[#F7FAFA]">
                      <input type="checkbox" checked={!!tp?.one_item_per_ticket} disabled={!tp}
                        onChange={(e) => setP(p.id, 'one_item_per_ticket', e.target.checked)} className="w-4 h-4" />
                    </td>
                    <td className="p-0.5 border border-[#F7FAFA] w-[150px]">
                      <input value={tp?.kds_monitor || ''} disabled={!tp} onChange={(e) => setP(p.id, 'kds_monitor', e.target.value)}
                        placeholder="(nenhum)" className={`${cell} disabled:bg-[#F7FAFA]`} />
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
              <thead><tr className="bg-[#F7FAFA]">
                {['Código', 'Descrição', 'Tipo', 'Porta', 'Ativo', ''].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {hw.map((h, i) => (
                  <tr key={i} className="border-b border-[#F7FAFA]">
                    <td className="p-0.5 border border-[#F7FAFA]"><input value={h.code} onChange={(e) => setHw(i, 'code', e.target.value)} className={cell} /></td>
                    <td className="p-0.5 border border-[#F7FAFA]"><input value={h.description} onChange={(e) => setHw(i, 'description', e.target.value)} className={cell} /></td>
                    <td className="p-0.5 border border-[#F7FAFA] w-[180px]">
                      <select value={h.hw_type} onChange={(e) => setHw(i, 'hw_type', e.target.value)} className={cell}>
                        {HW_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </td>
                    <td className="p-0.5 border border-[#F7FAFA] w-[120px]"><input value={h.port || ''} onChange={(e) => setHw(i, 'port', e.target.value)} placeholder="COM1" className={cell} /></td>
                    <td className="text-center border border-[#F7FAFA]"><input type="checkbox" checked={!!h.is_active} onChange={(e) => setHw(i, 'is_active', e.target.checked)} className="w-4 h-4" /></td>
                    <td className="text-center border border-[#F7FAFA]">
                      <button onClick={() => set('hardware', hw.filter((_, j) => j !== i))} className="text-[#8C2B1F] font-bold text-[11px]">Apagar</button>
                    </td>
                  </tr>
                ))}
                {hw.length === 0 && <tr><td colSpan={6} className="text-center text-[#7FA9B1] py-8">Sem periféricos ligados a este terminal.</td></tr>}
              </tbody>
            </table>
            <button onClick={addHw} className="flex items-center gap-2 mt-2 text-[13px] text-[#041F24] px-1 py-1 hover:bg-[#F7FAFA]">
              <span className="w-6 h-6 rounded-full bg-[#062A31] text-white flex items-center justify-center">＋</span> Adicionar
            </button>
          </div>
        )}
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#062A31', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#B0392B', onClick: onClose },
      ]} />
    </div>
  );
}
