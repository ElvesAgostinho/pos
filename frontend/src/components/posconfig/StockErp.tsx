import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

function Row({ label, children }: { label: string; children: any }) {
  return (
    <label className="flex items-center gap-3 text-[12px]">
      <span className="w-[130px] flex-shrink-0 text-[#333]">{label}</span>
      {children}
    </label>
  );
}

/**
 * INTERFACE COM CONTROLO DE STOCKS — ligação a um ERP externo.
 *
 * Há hotéis que já têm um ERP de compras e armazém e não o vão largar. Em vez de
 * ter dois números para a mesma garrafa, o POS vai lá buscar os saldos.
 *
 * DESLIGADA (como está), manda o motor de stock interno do sistema — que é o que
 * o hotel normal usa e o que já desconta o stock em cada venda.
 */
export default function StockErp() {
  const qc = useQueryClient();
  const [d, setD] = useState<any>({ is_active: false, import_rows: 500, block_mode: 'WARN' });
  const [pw, setPw] = useState('');

  const { data } = useQuery({
    queryKey: ['posc', 'stock-erp'],
    queryFn: async () => (await apiClient.get('pos/config/stock-erp/current/')).data,
  });
  useEffect(() => { if (data) setD(data); }, [data]);

  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'groups'], queryFn: async () => (await apiClient.get('inventory/pos/groups/')).data });
  const { data: families = [] } = useQuery({ queryKey: ['posc', 'families'], queryFn: async () => (await apiClient.get('inventory/pos/families/')).data });
  const { data: subs = [] } = useQuery({ queryKey: ['posc', 'subs'], queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/')).data });

  const save = useMutation({
    mutationFn: () => {
      const body = { ...d };
      if (pw) body.password = pw; else delete body.password;
      return apiClient.patch(`pos/config/stock-erp/${d.id}/`, body);
    },
    onSuccess: () => {
      setPw('');
      qc.invalidateQueries({ queryKey: ['posc', 'stock-erp'] });
      notifyGuide({ title: 'Ligação gravada', message: 'Use "Testar Ligação" para confirmar que o ERP responde.' });
    },
    onError: notifyError,
  });

  const test = useMutation({
    mutationFn: () => apiClient.post(`pos/config/stock-erp/${d.id}/test/`),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['posc', 'stock-erp'] });
      notifyGuide({ title: r.data.ok ? 'ERP respondeu' : 'Sem resposta', message: r.data.detail });
    },
    onError: notifyError,
  });

  const sync = useMutation({
    mutationFn: () => apiClient.post(`pos/config/stock-erp/${d.id}/sync/`),
    onSuccess: (r: any) => notifyGuide({ title: 'Stocks', message: r.data.detail }),
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const off = !d.is_active;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex border-b-2 border-[#2b2b2b] px-3 bg-[#f7f7f7]">
        <span className="px-4 py-2 text-[13px] font-semibold border-b-[3px] border-[#2b2b2b] bg-white">
          ERP Externo - Avançado
        </span>
      </div>

      <div className="flex-1 overflow-auto p-4">
        <label className="flex items-center gap-2 text-[12px] mb-3">
          <input type="checkbox" checked={!!d.is_active} onChange={(e) => set('is_active', e.target.checked)} className="w-4 h-4" />
          Ativo
        </label>

        {off && (
          <div className="text-[11px] text-[#8a6100] bg-[#fff7e6] border border-[#e0c080] px-3 py-2 mb-3 max-w-[900px]">
            Desligada: o <b>stock é gerido pelo motor interno</b> do sistema — que já desconta a
            mercadoria em cada venda e faz o custo médio. Ligue isto só se a verdade do stock
            estiver mesmo num ERP de fora; caso contrário fica com dois números para a mesma garrafa.
          </div>
        )}

        <div className={`grid grid-cols-2 gap-6 items-start ${off ? 'opacity-55' : ''}`}>
          <fieldset className="border border-[#c8c8c8] px-4 pb-4 pt-1" disabled={off}>
            <legend className="text-[12px] px-1">Ligações externas</legend>
            <div className="space-y-2">
              <Row label="URL:">
                <input value={d.url || ''} onChange={(e) => set('url', e.target.value)}
                  placeholder="https://erp.hotel.local/api" className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <Row label="Instância:">
                <input value={d.instance || ''} onChange={(e) => set('instance', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <Row label="Empresa:">
                <input value={d.company || ''} onChange={(e) => set('company', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <Row label="Utilizador:">
                <input value={d.username || ''} onChange={(e) => set('username', e.target.value)}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
              <Row label="Password:">
                <input type="password" value={pw} onChange={(e) => setPw(e.target.value)}
                  placeholder={d.has_password ? '(guardada — escreva para substituir)' : ''}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>
            </div>
          </fieldset>

          <fieldset className="border border-[#c8c8c8] px-4 pb-4 pt-1" disabled={off}>
            <legend className="text-[12px] px-1">Tabelas</legend>
            <div className="space-y-2">
              <Row label="Grupo:">
                <select value={d.group || ''} onChange={(e) => set('group', Number(e.target.value) || null)}
                  className={`${inp} flex-1`} style={inputStyle}>
                  <option value="">(nenhum)</option>
                  {(groups as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Row>
              <Row label="Família:">
                <select value={d.family || ''} onChange={(e) => set('family', Number(e.target.value) || null)}
                  className={`${inp} flex-1`} style={inputStyle}>
                  <option value="">(nenhum)</option>
                  {(families as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Row>
              <Row label="Sub Família:">
                <select value={d.subfamily || ''} onChange={(e) => set('subfamily', Number(e.target.value) || null)}
                  className={`${inp} flex-1`} style={inputStyle}>
                  <option value="">(nenhum)</option>
                  {(subs as any[]).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </Row>

              <div className="flex items-center gap-3 pt-1">
                <label className="flex items-center gap-2 text-[12px] w-[130px]">
                  <input type="checkbox" checked={!!d.stock_control}
                    onChange={(e) => set('stock_control', e.target.checked)} className="w-4 h-4" />
                  Controlo de Stock
                </label>
                <select value={d.block_mode} disabled={!d.stock_control}
                  onChange={(e) => set('block_mode', e.target.value)}
                  className={`${inp} flex-1 disabled:bg-[#f0f0f0] disabled:text-[#999]`} style={inputStyle}>
                  <option value="WARN">Avisar</option>
                  <option value="BLOCK">Bloqueio</option>
                  <option value="NONE">Não controlar</option>
                </select>
              </div>

              <Row label="Importação - Nº linhas:">
                <input type="number" value={d.import_rows ?? 500}
                  onChange={(e) => set('import_rows', Number(e.target.value))}
                  className={`${inp} flex-1`} style={inputStyle} />
              </Row>

              <button onClick={() => sync.mutate()} disabled={off}
                className="w-full py-3 bg-[#3c3c3c] text-white text-[13px] font-semibold hover:bg-[#2b2b2b] disabled:opacity-40 mt-2">
                {sync.isPending ? 'A atualizar…' : 'Stocks - Atualizar'}
              </button>
            </div>
          </fieldset>
        </div>

        {d.last_test_detail && (
          <div className={`text-[11px] px-3 py-2 border mt-3 max-w-[900px] ${d.last_test_ok
            ? 'bg-[#e8f5e9] border-[#b6d7b9] text-[#1f7a34]'
            : 'bg-[#fdecea] border-[#e6b0aa] text-[#a01818]'}`}>
            Último teste: {d.last_test_detail}
          </div>
        )}
      </div>

      <Toolbar actions={[
        { icon: '⟳', label: test.isPending ? 'A testar…' : 'Testar Ligação', color: '#5d4037',
          disabled: !d.id, onClick: () => test.mutate() },
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#1f7a34', onClick: () => save.mutate() },
      ]} />
    </div>
  );
}
