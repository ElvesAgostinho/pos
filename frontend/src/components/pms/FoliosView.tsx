import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { FormSection, Field, btnPrimary, btnNormal } from '../ui/FormKit';
import { ScrollText, Split, ArrowRightLeft, Undo2, FileText, Coins, Plus } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

const CHARGE_TYPES = [
  { value: 'ROOM', label: 'Alojamento' }, { value: 'FNB', label: 'F&B (Restaurante/Bar)' },
  { value: 'MINIBAR', label: 'Minibar' }, { value: 'LAUNDRY', label: 'Lavandaria' },
  { value: 'SPA', label: 'Spa' }, { value: 'TAX', label: 'Taxa' }, { value: 'MISC', label: 'Diversos' },
];
const PAYERS = [
  { value: 'GUEST', label: 'Hóspede' }, { value: 'COMPANY', label: 'Empresa' },
  { value: 'AGENCY', label: 'Agência' }, { value: 'HOUSE', label: 'Cortesia (casa)' },
];

/**
 * CONTAS DO HÓSPEDE (Folios) — nível hoteleiro a sério:
 *   · DIVIDIR: a empresa paga o quarto, o hóspede paga o bar (contas e faturas separadas);
 *   · TRANSFERIR: o consumo foi para a conta errada — move-se, e fica registado de onde veio;
 *   · ESTORNAR: um lançamento errado nunca se apaga — anula-se e fica o rasto (auditoria).
 */
export default function FoliosView() {
  const qc = useQueryClient();
  const [sel, setSel] = useState<number | null>(null);
  const [modal, setModal] = useState<'none' | 'split' | 'charge' | 'transfer' | 'reverse'>('none');
  const [charge, setCharge] = useState<any>(null);
  const [form, setForm] = useState<any>({});

  const { data: folios = [] } = useQuery({
    queryKey: ['pms', 'folios'],
    queryFn: async () => { const r = await apiClient.get('pms/folios/'); return r.data?.results || r.data || []; },
  });
  const active: any = folios.find((f: any) => f.id === sel) || folios[0];
  const inval = () => qc.invalidateQueries({ queryKey: ['pms'] });

  const call = (path: string, body: any, ok: (r: any) => void) =>
    apiClient.post(`pms/folios/${active.id}/${path}/`, body)
      .then((r) => { inval(); setModal('none'); ok(r.data); })
      .catch(notifyError);

  const doSplit = () => call('split', form, (d) => notifyGuide({
    title: 'Conta dividida',
    message: `Aberta a conta ${d.number} (${d.label}). Os consumos podem agora ser lançados ou transferidos para ela.`,
    hint: 'No check-out, cada conta é faturada a quem a paga.',
  }));
  const doCharge = () => call('post_charge', form, () => notifyGuide({ title: 'Lançamento feito', message: 'O consumo entrou na conta.' }));
  const doTransfer = () => call('transfer_charge', { charge: charge.id, target_folio: form.target_folio }, (d) => notifyGuide({
    title: 'Lançamento transferido', message: d.detail,
    hint: 'Fica registado de onde veio — o histórico não se falsifica.',
  }));
  const doReverse = () => call('reverse_charge', { charge: charge.id, reason: form.reason }, (d) => notifyGuide({
    title: 'Lançamento estornado', message: d.detail,
    hint: 'O original e o estorno ficam ambos visíveis — é o que um auditor espera ver.',
  }));
  const doInvoice = () => apiClient.post(`pms/folios/${active.id}/generate_invoice/`)
    .then((r) => { inval(); notifyGuide({ title: 'Fatura emitida', message: `${r.data.invoice_number} · ${money(r.data.total)} · a ${r.data.customer}` }); })
    .catch(notifyError);
  const doSettle = () => apiClient.post(`pms/folios/${active.id}/settle/`, { amount: active.balance })
    .then(() => { inval(); notifyGuide({ title: 'Conta liquidada', message: 'O saldo ficou a zero. O check-out já pode ser feito.' }); })
    .catch(notifyError);

  const open = (m: any, c?: any) => {
    setCharge(c || null);
    setForm(m === 'split' ? { payer_type: 'GUEST' } : m === 'charge' ? { charge_type: 'MISC' } : {});
    setModal(m);
  };

  return (
    <ClassicWindow title="Contas do Hóspede (Folios)" icon={<ScrollText size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Dividir · Transferir · Estornar — nenhum lançamento é apagado, tudo fica no histórico</div>}>
      <div className="h-full flex bg-[#dfe3e8] overflow-hidden">

        {/* Contas */}
        <div className="w-[280px] flex-shrink-0 border-r border-[#9aa6b6] bg-white overflow-auto">
          <div className="px-3 py-1.5 border-b border-[#c0c7d0] text-[12px] font-bold text-[#25405e]"
            style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>Contas</div>
          {folios.map((f: any) => (
            <button key={f.id} onClick={() => setSel(f.id)}
              className={`w-full text-left px-3 py-2 border-b border-[#e6e9ed] text-[12px] ${active?.id === f.id ? 'bg-[#e6f0fa]' : 'hover:bg-[#f2f5f8]'}`}>
              <div className="font-bold text-[#25405e]">{f.label}</div>
              <div className="text-[11px] text-gray-600">{f.guest_name}{f.room_number ? ` · Quarto ${f.room_number}` : ''}</div>
              <div className="flex justify-between text-[11px] mt-0.5">
                <span className="text-gray-500 truncate">{f.payer_name || f.payer_type_display}</span>
                <b className={Number(f.balance) > 0 ? 'text-[#a01818]' : 'text-green-700'}>{money(f.balance)}</b>
              </div>
            </button>
          ))}
          {folios.length === 0 && <div className="p-4 text-center text-gray-400 text-[12px]">Sem contas abertas.</div>}
        </div>

        {/* Detalhe */}
        <div className="flex-1 overflow-auto p-3">
          {!active ? <div className="text-center text-gray-400 py-12">Escolha uma conta.</div> : (
            <>
              <div className="bg-white border border-[#9aa6b6] mb-3">
                <div className="px-3 py-1.5 border-b border-[#c0c7d0] flex items-center justify-between text-[12px] font-bold text-[#25405e]"
                  style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>
                  <span>{active.number} · {active.label}</span>
                  <span className="font-normal text-[11px] text-gray-600">
                    {active.guest_name} · reserva {active.confirmation} · paga: <b>{active.payer_name || active.payer_type_display}</b>
                  </span>
                </div>
                <div className="p-3 flex items-center gap-5 flex-wrap">
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Consumos</div>
                    <div className="text-[18px] font-black text-[#25405e]">{money(active.charges_total)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Pagamentos</div>
                    <div className="text-[18px] font-black text-green-700">{money(active.payments_total)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase text-gray-500 font-bold">Saldo</div>
                    <div className={`text-[22px] font-black ${Number(active.balance) > 0 ? 'text-[#a01818]' : 'text-green-700'}`}>{money(active.balance)}</div>
                  </div>
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => open('charge')} {...btnNormal}><span className="flex items-center gap-1"><Plus size={12} />Lançar consumo</span></button>
                    <button onClick={() => open('split')} {...btnNormal}><span className="flex items-center gap-1"><Split size={12} />Dividir conta</span></button>
                    <button onClick={doSettle} {...btnNormal}><span className="flex items-center gap-1"><Coins size={12} />Liquidar</span></button>
                    <button onClick={doInvoice} {...btnPrimary}><span className="flex items-center gap-1"><FileText size={12} />Faturar</span></button>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-[#9aa6b6]">
                <div className="px-3 py-1.5 border-b border-[#c0c7d0] text-[12px] font-bold text-[#25405e]"
                  style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>Lançamentos</div>
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr className="text-[#25405e] bg-[#f2f5f8]">
                      {['Tipo', 'Descrição', 'Valor', 'Lançado por', ''].map((x) => (
                        <th key={x} className="text-left font-bold px-2 py-1 border-b border-[#c0c7d0]">{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(active.charges || []).map((c: any) => (
                      <tr key={c.id} className={`border-b border-[#e6e9ed] ${c.is_void ? 'bg-[#fdeaea] text-gray-500' : ''}`}>
                        <td className="px-2 py-1">{c.charge_type_display}</td>
                        <td className="px-2 py-1">
                          <span className={c.is_void ? 'line-through' : ''}>{c.description}</span>
                          {c.transferred_from && <span className="ml-1 text-[10px] text-[#1565c0]">(veio de {c.transferred_from})</span>}
                          {c.is_void && !c.reversal_of && <span className="ml-1 text-[10px] font-bold text-[#a01818]">ANULADO — {c.void_reason}</span>}
                        </td>
                        <td className={`px-2 py-1 font-mono ${Number(c.amount) < 0 ? 'text-[#a01818]' : ''}`}>{money(c.amount)}</td>
                        <td className="px-2 py-1 text-gray-600">{c.posted_by || '—'}</td>
                        <td className="px-2 py-1">
                          {!c.is_void && c.charge_type !== 'PAYMENT' && (
                            <div className="flex gap-2">
                              {(active.sibling_folios || []).length > 0 && (
                                <button onClick={() => open('transfer', c)} title="Transferir para outra conta"
                                  className="text-[#1565c0] hover:text-[#0d3d6e] flex items-center gap-1 text-[11px] font-bold">
                                  <ArrowRightLeft size={12} />Transferir
                                </button>
                              )}
                              <button onClick={() => open('reverse', c)} title="Estornar (anular sem apagar)"
                                className="text-[#a01818] hover:text-[#7a1010] flex items-center gap-1 text-[11px] font-bold">
                                <Undo2 size={12} />Estornar
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {(active.charges || []).length === 0 && (
                      <tr><td colSpan={5} className="text-center text-gray-400 py-6">Conta sem lançamentos.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Diálogos */}
      {modal !== 'none' && active && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[60] p-4" onClick={() => setModal('none')}>
          <div className="bg-[#eef1f4] border border-[#9aa6b6] w-[520px] max-h-[92vh] overflow-auto shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-white font-bold text-[12px]" style={{ background: 'linear-gradient(to bottom, #2f5f92, #1e3f66)' }}>
              {modal === 'split' ? 'Dividir a conta' : modal === 'charge' ? 'Lançar consumo'
                : modal === 'transfer' ? 'Transferir lançamento' : 'Estornar lançamento'}
            </div>
            <div className="p-3">
              {modal === 'split' && (
                <FormSection title="Nova conta na mesma reserva" cols={1}
                  hint="ex.: a empresa paga o alojamento, o hóspede paga os extras">
                  <Field label="Nome da conta" value={form.label} onChange={(v) => setForm({ ...form, label: v })} help="Ex.: B · Extras do hóspede" />
                  <Field label="Quem paga esta conta" value={form.payer_type} onChange={(v) => setForm({ ...form, payer_type: v })} options={PAYERS} />
                  <Field label="Nome do pagador" value={form.payer_name} onChange={(v) => setForm({ ...form, payer_name: v })}
                    help="É este o nome que sai na fatura desta conta." />
                  <Field label="NIF do pagador" value={form.payer_nif} onChange={(v) => setForm({ ...form, payer_nif: v })}
                    help="Se a empresa paga, é o NIF dela que vai na fatura." />
                </FormSection>
              )}
              {modal === 'charge' && (
                <FormSection title="Consumo a lançar" cols={1}>
                  <Field label="Tipo" value={form.charge_type} onChange={(v) => setForm({ ...form, charge_type: v })} options={CHARGE_TYPES} />
                  <Field label="Descrição" required value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
                  <Field label="Valor" required type="number" value={form.amount} onChange={(v) => setForm({ ...form, amount: v })} />
                </FormSection>
              )}
              {modal === 'transfer' && (
                <FormSection title={`Transferir "${charge?.description}"`} cols={1}
                  hint="fica registado de onde veio — o histórico não se apaga">
                  <Field label="Conta de destino" required value={form.target_folio} onChange={(v) => setForm({ ...form, target_folio: v })}
                    options={(active.sibling_folios || []).map((s: any) => ({ value: s.id, label: `${s.number} · ${s.label}` }))} />
                </FormSection>
              )}
              {modal === 'reverse' && (
                <FormSection title={`Estornar "${charge?.description}" (${money(charge?.amount)})`} cols={1}
                  hint="o lançamento NÃO é apagado: é anulado e criado um de sinal contrário">
                  <Field label="Motivo do estorno" required value={form.reason} onChange={(v) => setForm({ ...form, reason: v })}
                    help="Fica registado com o seu nome e a hora — é o que o auditor vai ler." />
                </FormSection>
              )}
              <div className="flex gap-2">
                <button onClick={modal === 'split' ? doSplit : modal === 'charge' ? doCharge : modal === 'transfer' ? doTransfer : doReverse}
                  {...btnPrimary}>Confirmar</button>
                <button onClick={() => setModal('none')} {...btnNormal}>Cancelar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ClassicWindow>
  );
}
