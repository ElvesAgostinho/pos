import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputCls, inputStyle } from './kit';

/**
 * FICHA DA SUB-FAMÍLIA.
 *
 * Além do código/descrição, tem os dois mapeamentos POR OUTLET que fazem o sistema
 * funcionar de verdade:
 *   · ARMAZÉM — as polpas vendidas no Restaurante saem do armazém RESTAURANTE; as do
 *     Bar da Piscina saem do armazém BAR PISCINA. Sem isto, as contagens nunca batem.
 *   · ENCARGO PMS — o consumo do hóspede entra no folio do quarto com o código certo
 *     (REST_BEB_N, BAR_BEB_NA…), que leva a taxa correta.
 */
export default function SubFamilyEditor({ row, families, onClose }:
  { row: any; families: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [d, setD] = useState<any>({ print_order: 0, ...row });
  const [tab, setTab] = useState<'pms' | 'wh'>('pms');
  const [bulk, setBulk] = useState<any>({ warehouse: '', pms_charge_code: '', pms_charge_tax: '' });
  const [q, setQ] = useState('');

  const { data: map } = useQuery({
    queryKey: ['posc', 'subfam-map', row?.id],
    queryFn: async () => (await apiClient.get(`inventory/pos/subfamilies/${row.id}/mappings/`)).data,
    enabled: !isNew,
  });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('inventory/pos/subfamilies/', d)
      : apiClient.patch(`inventory/pos/subfamilies/${row.id}/`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['posc'] }); notifyGuide({ title: 'Sub-família gravada', message: 'As alterações entraram já no POS.' }); onClose(); },
    onError: notifyError,
  });

  const setMap = useMutation({
    mutationFn: (body: any) => apiClient.post(`inventory/pos/subfamilies/${row.id}/set_mapping/`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posc', 'subfam-map', row?.id] }),
    onError: notifyError,
  });

  const applyToAll = () => {
    (map?.rows || []).forEach((r: any) => setMap.mutate({
      outlet: r.outlet,
      warehouse: tab === 'wh' ? (bulk.warehouse || null) : r.warehouse,
      pms_charge_code: tab === 'pms' ? bulk.pms_charge_code : r.pms_charge_code,
      pms_charge_tax: tab === 'pms' ? (bulk.pms_charge_tax || null) : r.pms_charge_tax,
    }));
  };

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const rows = (map?.rows || []).filter((r: any) => !q || r.outlet_name.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#f0f0f0] border-b border-[#d0d0d0]">
        <span className="text-[13px] font-bold text-[#333]">{isNew ? 'Nova sub-família' : `A editar ${d.name}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#666] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {/* Identificação */}
        <div className="space-y-2 mb-4">
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[200px] text-[#333]">Código:<span className="text-[#a01818]">*</span></span>
            <input value={d.code || ''} onChange={(e) => set('code', e.target.value)} className={`${inputCls} w-[290px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[200px] text-[#333]">Descrição:<span className="text-[#a01818]">*</span></span>
            <input value={d.name || ''} onChange={(e) => set('name', e.target.value)} className={`${inputCls} w-[640px] flex-none`} style={inputStyle} />
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[200px] text-[#333]">Família:<span className="text-[#a01818]">*</span></span>
            <select value={d.family || ''} onChange={(e) => set('family', Number(e.target.value) || null)} className={`${inputCls} w-[290px] flex-none`} style={inputStyle}>
              <option value="">—</option>
              {families.map((f: any) => <option key={f.id} value={f.id}>{f.group_name} → {f.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[200px] text-[#333]">Ordem impressão no pedido:</span>
            <input type="number" value={d.print_order ?? 0} onChange={(e) => set('print_order', Number(e.target.value))}
              className={`${inputCls} w-[210px] flex-none`} style={inputStyle} />
            <span className="text-[11px] text-[#888]">Ordem por que sai na comanda (as entradas antes dos pratos).</span>
          </label>
          <label className="flex items-center gap-3 text-[13px]">
            <span className="w-[200px] text-[#333]">Conta de Contabilidade:</span>
            <input value={d.accounting_account || ''} onChange={(e) => set('accounting_account', e.target.value)}
              className={`${inputCls} w-[210px] flex-none`} style={inputStyle} />
          </label>
        </div>

        {isNew ? (
          <div className="text-[12px] text-[#a01818]">Grave a sub-família para poder configurar os mapeamentos por outlet.</div>
        ) : (
          <>
            {/* Separadores dos mapeamentos */}
            <div className="flex">
              {([['pms', 'Interface com PMS (Mapeamento de sub-famílias)'], ['wh', 'Mapeamentos Setor/Armazéns']] as const).map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)}
                  className={`px-4 py-2 text-[13px] font-semibold border border-b-0 ${tab === k ? 'bg-white text-[#111] border-[#c0c0c0]' : 'bg-[#e8e8e8] text-[#555] border-[#d5d5d5]'}`}>
                  {label}
                </button>
              ))}
            </div>

            <div className="border border-[#c0c0c0] p-3">
              {/* Barra de aplicação em massa */}
              <div className="flex items-center gap-3 mb-3 text-[13px]">
                <span>Pesquisar:</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[180px]" style={inputStyle} />
                {tab === 'wh' ? (
                  <>
                    <span>Armazém:</span>
                    <select value={bulk.warehouse} onChange={(e) => setBulk({ ...bulk, warehouse: e.target.value })}
                      className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[300px]" style={inputStyle}>
                      <option value="">(nenhum)</option>
                      {(map?.warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </>
                ) : (
                  <>
                    <span>Encargo:</span>
                    <input value={bulk.pms_charge_code} onChange={(e) => setBulk({ ...bulk, pms_charge_code: e.target.value })}
                      placeholder="(nenhum) — ex.: REST_BEB_N" className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[240px]" style={inputStyle} />
                    <input type="number" value={bulk.pms_charge_tax} onChange={(e) => setBulk({ ...bulk, pms_charge_tax: e.target.value })}
                      placeholder="Taxa %" className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[80px]" style={inputStyle} />
                  </>
                )}
                <button onClick={applyToAll} className="flex items-center gap-1.5 text-[13px] text-[#1f7a34] font-semibold">
                  <span className="w-6 h-6 rounded-full bg-[#1f7a34] text-white flex items-center justify-center text-[13px]">✔</span>
                  Aplicar à selecção
                </button>
              </div>

              {/* Grelha: uma coluna por outlet */}
              <table className="w-full text-[12px] border-collapse">
                <thead>
                  <tr className="bg-[#f0f0f0]">
                    <th className="text-left px-2 py-2 border border-[#d0d0d0] w-[280px]">Descrição</th>
                    {rows.map((r: any) => (
                      <th key={r.outlet} className="text-left px-2 py-1 border border-[#d0d0d0]">
                        <div className="font-bold">{r.outlet_name}</div>
                        <div className="text-[10px] font-normal text-[#888]">
                          Default: {tab === 'wh' ? (r.warehouse_name || '(nenhum)') : (r.pms_charge_code || '(nenhum)')}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-2 py-1.5 border border-[#e5e5e5]">{d.code} - {d.name}</td>
                    {rows.map((r: any) => (
                      <td key={r.outlet} className={`px-1 py-1 border border-[#e5e5e5] ${tab === 'pms' && r.pms_charge_code ? 'bg-[#ffd9a0]' : ''}`}>
                        {tab === 'wh' ? (
                          <select value={r.warehouse || ''}
                            onChange={(e) => setMap.mutate({ outlet: r.outlet, warehouse: e.target.value || null, pms_charge_code: r.pms_charge_code, pms_charge_tax: r.pms_charge_tax })}
                            className="w-full border border-[#c8c8c8] px-1 py-0.5 text-[12px] bg-transparent">
                            <option value="">(nenhum)</option>
                            {(map?.warehouses || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                          </select>
                        ) : (
                          <div className="flex gap-1">
                            <input defaultValue={r.pms_charge_code || ''}
                              onBlur={(e) => setMap.mutate({ outlet: r.outlet, warehouse: r.warehouse, pms_charge_code: e.target.value, pms_charge_tax: r.pms_charge_tax })}
                              placeholder="(nenhum)" className="flex-1 min-w-0 border border-[#c8c8c8] px-1 py-0.5 text-[12px] bg-transparent" />
                            <input type="number" defaultValue={r.pms_charge_tax || ''}
                              onBlur={(e) => setMap.mutate({ outlet: r.outlet, warehouse: r.warehouse, pms_charge_code: r.pms_charge_code, pms_charge_tax: e.target.value || null })}
                              placeholder="%" className="w-[52px] border border-[#c8c8c8] px-1 py-0.5 text-[12px] bg-transparent" />
                          </div>
                        )}
                      </td>
                    ))}
                    {rows.length === 0 && <td className="px-2 py-6 text-center text-[#999] border border-[#e5e5e5]">Sem outlets configurados.</td>}
                  </tr>
                </tbody>
              </table>

              <div className="text-[11px] text-[#666] mt-2">
                {tab === 'wh'
                  ? 'De que armazém sai o stock quando este tipo de artigo é vendido em cada ponto de venda.'
                  : 'Com que código de encargo o consumo entra no folio do quarto (e com que taxa).'}
              </div>
            </div>
          </>
        )}
      </div>

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#c0392b', onClick: onClose },
      ]} />
    </div>
  );
}
