import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money, Glyph } from './kit';
import PermissoesBotao from './PermissoesBotao';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';

/**
 * CONTAS CORRENTES — quem deve, quanto deve, e quanto já deixou adiantado.
 *
 * Dois saldos, e são coisas diferentes:
 *  · Saldo (Conta Corrente) — faturas emitidas e ainda não recebidas;
 *  · Saldo (Cash Advance)   — o depósito/sinal que a entidade já cá tem.
 * Uma empresa pode dever 300.000 do mês passado e ter 100.000 de sinal do evento
 * de sábado. Misturar os dois é a maneira mais rápida de cobrar duas vezes.
 */
export default function PosCurrentAccounts() {
  const qc = useQueryClient();
  const [scope, setScope] = useState('CC');
  const [soDep, setSoDep] = useState(false);
  const [f, setF] = useState<any>({});
  const [aplicado, setAplicado] = useState<any>({ scope: 'CC' });
  const [sel, setSel] = useState<number | null>(null);
  const [conta, setConta] = useState<number | null>(null);
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);

  const { data: tipos = [] } = useQuery({
    queryKey: ['poscc', 'ctypes'],
    queryFn: async () => (await apiClient.get('pos/config/customer-types/')).data,
  });
  const { data } = useQuery({
    queryKey: ['poscc', 'rows', aplicado],
    queryFn: async () => {
      const params: any = {};
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      return (await apiClient.get('pos/ops/current-accounts/', { params })).data;
    },
  });
  const { data: det } = useQuery({
    queryKey: ['poscc', 'conta', conta],
    queryFn: async () => (await apiClient.get(`pos/ops/current-accounts/${conta}/`)).data,
    enabled: !!conta,
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['poscc'] });
  const acao = useMutation({
    mutationFn: ({ id, ...body }: any) => apiClient.post(`pos/ops/current-accounts/${id}/`, body),
    onSuccess: (r: any) => { inval(); notifyGuide({ title: 'Feito', message: r.data.detail || 'Movimento registado.' }); },
    onError: notifyError,
  });

  const rows: any[] = data?.rows || [];
  const paginas = Math.max(1, Math.ceil(rows.length / pageSize));
  const vista = rows.slice((page - 1) * pageSize, page * pageSize);
  const pesquisar = () => {
    setAplicado({ ...f, scope, only_deposits: soDep ? '1' : '' });
    setPage(1);
  };

  const Campo = ({ k, label }: any) => (
    <div className="flex items-center gap-2">
      <span className="text-[12px] text-[#333] w-[100px]">{label}</span>
      <input value={f[k] ?? ''} onChange={(e) => setF({ ...f, [k]: e.target.value })}
        onKeyDown={(e) => e.key === 'Enter' && pesquisar()}
        className={`${inp} w-[190px]`} style={inputStyle} />
    </div>
  );

  // ---------- a conta de UMA entidade (Contas Correntes / Cash Advance) ----------
  if (conta && det) {
    const porLiquidar = det.documents.filter((d: any) => !d.settled && !d.rectifying);
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-white">
        <div className="px-3 py-2 bg-[#dbe7f3] text-[#1a4f8a] text-[13px] font-bold border-b border-[#a9c4de] flex items-center gap-3">
          <span>{det.entity.name} — [{det.entity.code}] NIF {det.entity.tax_id || '—'}</span>
          {det.entity.blocked && (
            <span className="px-2 py-0.5 bg-[#a01818] text-white text-[11px]">
              BLOQUEADA{det.entity.block_reason ? ` · ${det.entity.block_reason}` : ''}
            </span>
          )}
          <span className="ml-auto text-[12px] font-normal">
            Cash Advance disponível: <b className="text-[15px]">{money(det.advance_balance)} Kz</b>
          </span>
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 overflow-auto border-r border-[#e0e0e0]">
            <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold border-b border-[#d0d0d0]">
              Documentos ({porLiquidar.length} por liquidar)
            </div>
            <table className="w-full text-[12px] border-collapse">
              <thead><tr className="bg-[#f4f4f4]">
                {['Documento', 'Data', 'Total', 'Estado', ''].map((h) => (
                  <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                ))}
              </tr></thead>
              <tbody>
                {det.documents.map((d: any) => (
                  <tr key={d.id} className="border-b border-[#eee]">
                    <td className="px-2 py-1 font-mono">{d.invoice_no}</td>
                    <td className="px-2 py-1">{d.date}</td>
                    <td className="px-2 py-1 text-right font-bold">{money(d.total)}</td>
                    <td className="px-2 py-1">
                      <span className={`px-2 py-0.5 text-[11px] font-semibold ${d.settled
                        ? 'bg-[#e8f5e9] text-[#1f7a34]' : 'bg-[#fdecea] text-[#a01818]'}`}>
                        {d.settled ? 'Liquidado' : 'Por receber'}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-right whitespace-nowrap">
                      {!d.settled && !d.rectifying && (
                        <>
                          <button onClick={() => acao.mutate({ id: conta, action: 'settle', document: d.id })}
                            className="text-[11px] text-[#1a4f8a] hover:underline">Receber</button>
                          <button
                            disabled={Number(det.advance_balance) < Number(d.total)}
                            title={Number(det.advance_balance) < Number(d.total)
                              ? 'O adiantamento não chega' : 'Liquidar com o depósito da entidade'}
                            onClick={() => acao.mutate({ id: conta, action: 'settle', document: d.id, from_deposit: true })}
                            className="text-[11px] text-[#1f7a34] hover:underline ml-3 disabled:text-[#bbb] disabled:no-underline">
                            Usar depósito
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {det.documents.length === 0 && (
                  <tr><td colSpan={5} className="text-center text-[#999] py-8">Sem documentos.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="w-[42%] overflow-auto">
            <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold border-b border-[#d0d0d0]">
              Cash Advance — depósitos
            </div>
            <div className="p-3 flex items-end gap-2 border-b border-[#eee]">
              <div>
                <div className="text-[11px] text-[#666] mb-1">Valor</div>
                <input id="dep" type="number" className={`${inp} w-[120px]`} style={inputStyle} />
              </div>
              <div className="flex-1">
                <div className="text-[11px] text-[#666] mb-1">Motivo</div>
                <input id="depm" className={`${inp} w-full`} style={inputStyle} />
              </div>
              <button onClick={() => {
                const v = (document.getElementById('dep') as HTMLInputElement).value;
                const m = (document.getElementById('depm') as HTMLInputElement).value;
                acao.mutate({ id: conta, action: 'deposit', kind: 'IN', amount: v, reason: m });
              }} className="px-3 py-1.5 bg-[#1f7a34] text-white text-[12px]">Depositar</button>
              <button onClick={() => {
                const v = (document.getElementById('dep') as HTMLInputElement).value;
                acao.mutate({ id: conta, action: 'deposit', kind: 'OUT', amount: v, reason: 'Devolução' });
              }} className="px-3 py-1.5 border border-[#b0b0b0] text-[12px]">Devolver</button>
            </div>
            <table className="w-full text-[12px] border-collapse">
              <tbody>
                {det.deposits.map((x: any) => (
                  <tr key={x.id} className="border-b border-[#eee]">
                    <td className="px-2 py-1">{new Date(x.created_at).toLocaleDateString('pt-PT')}</td>
                    <td className="px-2 py-1">{x.kind_display}</td>
                    <td className="px-2 py-1 text-[#666]">{x.reason || ''}</td>
                    <td className={`px-2 py-1 text-right font-bold ${x.kind === 'IN' ? 'text-[#1f7a34]' : 'text-[#a01818]'}`}>
                      {x.kind === 'IN' ? '+' : '−'}{money(x.amount)}
                    </td>
                  </tr>
                ))}
                {det.deposits.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-[#999] py-8">Sem depósitos.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <Toolbar actions={[{ label: 'Voltar', icon: '◀', color: '#6b6b6b', onClick: () => setConta(null) }]} />
      </div>
    );
  }

  // ---------- pesquisa ----------
  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      <div className="flex gap-3 p-3">
        <fieldset className="border border-[#c8c8c8] bg-white px-3 pb-3 w-[220px]">
          <legend className="text-[12px] text-[#333] px-1">Tipo de pesquisa</legend>
          {[['CC', 'Clientes (Conta Corrente)'], ['ALL', 'Clientes (Todos)']].map(([k, t]) => (
            <label key={k} className="flex items-start gap-2 py-1 text-[12px] cursor-pointer">
              <input type="radio" checked={scope === k} onChange={() => setScope(k)} className="mt-0.5" />
              {t}
            </label>
          ))}
        </fieldset>

        <fieldset className="border border-[#c8c8c8] bg-white flex-1 px-3 pb-3">
          <legend className="text-[12px] text-[#333] px-1">Critérios de pesquisa</legend>
          <div className="flex gap-6">
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-[12px] cursor-pointer">
                <input type="checkbox" checked={soDep} onChange={(e) => setSoDep(e.target.checked)} className="w-4 h-4" />
                Só com depósitos
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#333] w-[100px]">Tipo de entidade:</span>
                <select value={f.entity_type ?? ''} onChange={(e) => setF({ ...f, entity_type: e.target.value })}
                  className={`${inp} w-[170px]`} style={inputStyle}>
                  <option value="">Todos</option>
                  {tipos.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Campo k="id" label="ID:" />
              <Campo k="name" label="Nome:" />
              <Campo k="q" label="Pesquisa livre:" />
            </div>
            <div className="space-y-2">
              <Campo k="tax_id" label="Nr. contrib.:" />
              <Campo k="phone" label="Telefone:" />
              <Campo k="address" label="Morada:" />
            </div>
          </div>
        </fieldset>

        <button onClick={pesquisar}
          className="w-[180px] flex flex-col items-center justify-center gap-2 bg-[#3c3c3c] text-white hover:bg-[#2b2b2b]">
          <Glyph icon="🔄" size={26} />
          <span className="text-[13px]">Pesquisar</span>
        </button>
      </div>

      <div className="flex-1 overflow-auto bg-white border-t border-[#d0d0d0]">
        <table className="w-full text-[12px] border-collapse">
          <thead className="sticky top-0"><tr className="bg-[#f0f0f0]">
            {['Principal', 'Morada', 'Contacto', 'Outra', 'Saldo (Conta Corrente)', 'Saldo (Cash Advance)'].map((h) => (
              <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0] border-r border-r-[#e6e6e6]">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {vista.map((r) => (
              <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setConta(r.id)}
                className={`border-b border-[#eee] cursor-pointer ${sel === r.id ? 'bg-[#dce9f7]' : 'hover:bg-[#f5f9ff]'}`}>
                <td className="px-2 py-1.5 font-semibold">
                  {r.blocked && <span className="text-[#a01818] mr-1 inline-flex align-middle" title="Bloqueada"><Glyph icon="⛔" size={13} /></span>}
                  {r.name}
                </td>
                <td className="px-2 py-1.5">{r.address || '—'}</td>
                <td className="px-2 py-1.5">{r.contact || '—'}</td>
                <td className="px-2 py-1.5 text-[#666]">{r.other || '—'}</td>
                <td className="px-2 py-1.5 text-right font-bold"
                  style={{ color: Number(r.cc_balance) > 0 ? '#a01818' : '#333' }}>
                  {money(r.cc_balance)}
                </td>
                <td className="px-2 py-1.5 text-right font-bold"
                  style={{ color: Number(r.advance_balance) > 0 ? '#1f7a34' : '#333' }}>
                  {money(r.advance_balance)}
                </td>
              </tr>
            ))}
            {vista.length === 0 && (
              <tr><td colSpan={6} className="text-center text-[#999] py-10">Não foram encontrados dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-2 px-3 py-1.5 bg-[#f4f4f4] border-t border-[#d8d8d8] text-[12px]">
        <span>Nº registos a visualizar:</span>
        <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
          className={`${inp} w-[70px]`} style={inputStyle}>
          {[25, 50, 100].map((n) => <option key={n}>{n}</option>)}
        </select>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="px-2 disabled:opacity-30">◀</button>
        <span>Página {page} de {paginas}</span>
        <button disabled={page >= paginas} onClick={() => setPage(page + 1)} className="px-2 disabled:opacity-30">▶</button>
        <span className="ml-auto">
          Por receber: <b className="text-[#a01818]">{money(data?.total_due || 0)} Kz</b>
          <span className="mx-2 text-[#ccc]">|</span>
          Adiantado: <b className="text-[#1f7a34]">{money(data?.total_advance || 0)} Kz</b>
        </span>
      </div>

      <Toolbar actions={[
        { label: 'Contas Correntes', icon: '▸', color: '#1a73c8', disabled: !sel, onClick: () => setConta(sel) },
        { label: 'Cash Advance', icon: '▸', color: '#1f7a34', disabled: !sel, onClick: () => setConta(sel) },
      ]} right={
        <span className="flex items-center gap-2">
          <span className="text-[11px] text-[#666]">
            Duplo-clique abre a conta. Vermelho = deve; verde = tem dinheiro nosso à guarda dele.
          </span>
          <PermissoesBotao right={20003} titulo="Utilitários" />
        </span>
      } />
    </div>
  );
}
