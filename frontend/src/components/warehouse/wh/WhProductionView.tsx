import { useState } from 'react';
import ClassicWindow from '../../ui/ClassicWindow';
import ClassicButton from '../../ui/ClassicButton';
import ClassicGrid from '../../ui/ClassicGrid';
import { ChefHat, Plus, Play, Ban, Trash2 } from 'lucide-react';
import {
  useWhProductionOrders, useWhRequirements, useProduce, useCancelOrder,
  useWhWarehouses, useWhItems,
} from '../../../hooks/useWh';

/**
 * ORDENS DE PRODUÇÃO — o que transforma ingredientes em produto.
 *
 * O motor já existia e já estava testado (`inventory/production.py`): faltava o
 * ecrã. Sem ele, a cozinha fazia 20 litros de molho de manhã e o sistema não
 * dava por nada — os ingredientes continuavam em armazém no papel e o molho
 * ficava a custo ZERO. Tudo o que lê esse custo (a margem do prato, a
 * valorização das existências, o custo do mês) saía errado, e sempre para o lado
 * de parecer que a casa ganha mais do que ganha.
 *
 * O ecrã tem três zonas porque a produção tem três momentos, e confundi-los é
 * que faz perder dinheiro:
 *   · O QUE SE VAI FAZER   — a ordem em rascunho. Ainda não mexeu em stock.
 *   · O QUE VAI CONSUMIR   — a conferência: o que a ficha manda gastar, o que há
 *                            em armazém, e o que FALTA (a vermelho). É aqui que o
 *                            chefe descobre a falta, e não a meio da produção.
 *   · O QUE ACONTECEU      — depois de produzir: o que saiu de facto, ao custo do
 *                            dia, e o custo que se formou. Não se desfaz por aqui.
 */
export default function WhProductionView() {
  const warehouses = useWhWarehouses().data ?? [];
  const [estado, setEstado] = useState('');
  const { query, create, remove } = useWhProductionOrders(estado ? { status: estado } : undefined);
  const ordens = query.data ?? [];

  const [sel, setSel] = useState<number | undefined>(undefined);
  const ordem = ordens.find((o: any) => o.id === sel);
  const { data: necessidades } = useWhRequirements(sel);
  const produzir = useProduce();
  const anular = useCancelOrder();

  const [procura, setProcura] = useState('');
  const artigos = useWhItems(procura || undefined).data ?? [];
  const [f, setF] = useState<any>({ item: '', warehouse: '', quantity: '', lot_number: '', expiry_date: '', note: '' });

  const [aviso, setAviso] = useState('');

  const nova = () => {
    if (!f.item || !f.quantity) { setAviso('Escolha o artigo a produzir e a quantidade.'); return; }
    setAviso('');
    create.mutate({
      item: Number(f.item), warehouse: Number(f.warehouse || warehouses[0]?.id),
      quantity: Number(f.quantity), lot_number: f.lot_number || null,
      expiry_date: f.expiry_date || null, note: f.note || null,
    }, {
      onSuccess: (nova: any) => {
        setSel(nova.id);
        setF({ ...f, item: '', quantity: '', lot_number: '', expiry_date: '', note: '' });
      },
      onError: (e: any) => setAviso(e?.response?.data?.detail || 'Não foi possível criar a ordem.'),
    });
  };

  // PRODUZIR É IRREVERSÍVEL: consome os ingredientes e mete o produzido no
  // armazém. O molho feito não volta a ser carne — por isso confirma-se antes, e
  // a correção depois faz-se por ajuste de inventário, que deixa rasto.
  const executar = () => {
    if (!ordem?.id) return;
    const quanto = `${ordem.quantity} de ${ordem.item_name}`;
    if (!window.confirm(`Produzir ${quanto}?\n\nIsto dá SAÍDA dos ingredientes e entrada do produzido. Não se desfaz: para corrigir, faz-se um ajuste de inventário.`)) return;
    setAviso('');
    produzir.mutate(ordem.id, {
      // O 409 do motor traz a razão escrita (que ingrediente, quanto pediu,
      // quanto havia). Mostra-se tal como vem — é a mensagem útil.
      onError: (e: any) => setAviso(e?.response?.data?.detail || 'Não foi possível produzir.'),
    });
  };

  const cor = (s?: string) => s === 'DONE' ? 'text-[#15803D] font-bold'
    : s === 'CANCELLED' ? 'text-[#B91C1C]' : 'text-[#111827] font-bold';

  const num = (v: any) => Number(v ?? 0).toLocaleString('pt-AO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const rascunho = ordem?.status === 'DRAFT';
  const podeProduzir = rascunho && !!necessidades?.can_produce && !produzir.isPending;

  return (
    <ClassicWindow title="Ordens de Produção" icon={<ChefHat size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">
        Ordens: {ordens.length}
        {ordem ? ` · ${ordem.number} (${ordem.status_display})` : ' · nenhuma ordem escolhida'}
        {' · '}o custo do produzido é o que saiu do armazém para o fazer
      </div>}>
      <div className="p-2 space-y-2 h-full flex flex-col">

        {/* ── O QUE SE VAI FAZER ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-2 bg-[#EEF1F5] border border-[#E6E8EC] p-2 text-[11px]">
          <select value={f.warehouse} onChange={(e) => setF({ ...f, warehouse: e.target.value })} className="border border-[#E6E8EC] p-1 bg-white">
            <option value="">Armazém…</option>
            {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input placeholder="Pesquisar artigo" value={procura} onChange={(e) => setProcura(e.target.value)} className="border border-[#E6E8EC] p-1 w-32" />
          <select value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })} className="border border-[#E6E8EC] p-1 bg-white max-w-[180px]">
            <option value="">Artigo a produzir…</option>
            {artigos.map((i: any) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <input type="number" placeholder="Qtd/doses" value={f.quantity} onChange={(e) => setF({ ...f, quantity: e.target.value })} className="border border-[#E6E8EC] p-1 w-20" />
          <input placeholder="Nº lote" value={f.lot_number} onChange={(e) => setF({ ...f, lot_number: e.target.value })} className="border border-[#E6E8EC] p-1 w-24" />
          {/* A VALIDADE VAI NO RÓTULO DO TABULEIRO: o molho de hoje dura três
              dias, e é esta data que a HACCP pede. Em branco, vale a validade em
              dias da ficha do artigo. */}
          <input type="date" title="Validade do produzido (rótulo)" value={f.expiry_date} onChange={(e) => setF({ ...f, expiry_date: e.target.value })} className="border border-[#E6E8EC] p-1" />
          <input placeholder="Observações" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="border border-[#E6E8EC] p-1 w-36" />
          <ClassicButton icon={Plus} label="Nova Ordem" onClick={nova} disabled={create.isPending} />
          <span className="mx-1 w-px h-5 bg-[#E6E8EC]" />
          <ClassicButton icon={Play} label={produzir.isPending ? 'A produzir…' : 'Produzir'} onClick={executar} disabled={!podeProduzir} />
          <ClassicButton icon={Ban} label="Anular" onClick={() => ordem?.id && anular.mutate(ordem.id)} disabled={!rascunho || anular.isPending} />
          <label className="flex items-center gap-1 ml-auto">Estado
            <select value={estado} onChange={(e) => setEstado(e.target.value)} className="border border-[#E6E8EC] p-1 bg-white">
              <option value="">Todas</option>
              <option value="DRAFT">Rascunho</option>
              <option value="DONE">Produzidas</option>
              <option value="CANCELLED">Anuladas</option>
            </select>
          </label>
        </div>

        {aviso && (
          <div className="bg-[#FEF2F2] border border-[#FCA5A5] text-[#B91C1C] p-2 text-[11px] whitespace-pre-line">{aviso}</div>
        )}

        <div className="flex-1 min-h-0 flex gap-2">
          {/* ── A LISTA ────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0 overflow-hidden">
            <ClassicGrid rowKey="id" data={ordens} selectedRowId={sel}
              onRowClick={(r: any) => { setSel(r.id); setAviso(''); }}
              columns={[
                { header: 'Nº', accessor: 'number', width: '12%' },
                { header: 'Data', accessor: (r: any) => (r.created_at || '').slice(0, 10), width: '11%' },
                { header: 'Artigo', accessor: (r: any) => `${r.item_code} · ${r.item_name}`, width: '27%' },
                { header: 'Qtd', accessor: (r: any) => num(r.quantity), width: '9%' },
                { header: 'Armazém', accessor: 'warehouse_name', width: '14%' },
                { header: 'Estado', accessor: (r: any) => <span className={cor(r.status)}>{r.status_display}</span>, width: '11%' },
                { header: 'Custo/un', accessor: (r: any) => r.status === 'DONE' ? num(r.unit_cost) : '—', width: '9%' },
                { header: 'Custo total', accessor: (r: any) => r.status === 'DONE' ? num(r.total_cost) : '—', width: '11%' },
                {
                  header: '', width: '6%',
                  accessor: (r: any) => r.status === 'DRAFT'
                    ? <button title="Apagar rascunho" onClick={(ev) => { ev.stopPropagation(); remove.mutate(r.id); }} className="text-[#B91C1C]"><Trash2 size={12} /></button>
                    // Uma ordem já produzida mexeu no stock: fica no histórico.
                    : <span className="text-gray-300" title="Já mexeu no stock — fica no histórico">—</span>,
                },
              ]} />
          </div>

          {/* ── O QUE VAI CONSUMIR / O QUE ACONTECEU ───────────────── */}
          <div className="w-[42%] min-w-[320px] flex flex-col gap-2 overflow-auto">
            {!ordem && (
              <div className="bg-white border border-[#E6E8EC] p-3 text-[11px] text-gray-600">
                Escolha uma ordem na lista para ver o que ela gasta.
                <div className="mt-1 text-gray-500">
                  Uma ordem em rascunho ainda não mexeu em stock nenhum: só ao
                  <b> Produzir</b> é que os ingredientes saem do armazém.
                </div>
              </div>
            )}

            {ordem && rascunho && (
              <div className="bg-white border border-[#E6E8EC] flex flex-col">
                <div className="px-2 py-1 bg-[#EEF1F5] border-b border-[#E6E8EC] text-[11px] font-bold">
                  O que vai consumir — {ordem.quantity} de {ordem.item_name}
                </div>
                {necessidades?.detail && (
                  <div className="p-2 text-[11px] text-[#B91C1C]">
                    {necessidades.detail}
                    <div className="text-gray-600 mt-1">
                      Sem ficha técnica não há o que consumir nem como formar o custo
                      do produzido. Preencha a ficha do artigo primeiro.
                    </div>
                  </div>
                )}
                {!!necessidades?.lines?.length && (
                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="bg-[#F1F2F4] text-left">
                        <th className="px-2 py-1 font-medium">Ingrediente</th>
                        <th className="px-2 py-1 font-medium">Un</th>
                        <th className="px-2 py-1 font-medium text-right">Precisa</th>
                        <th className="px-2 py-1 font-medium text-right">Há</th>
                        <th className="px-2 py-1 font-medium text-right">Custo/un</th>
                      </tr>
                    </thead>
                    <tbody>
                      {necessidades.lines.map((l) => (
                        <tr key={l.item} className={`border-t border-[#F1F2F4] ${l.missing ? 'bg-[#FEF2F2]' : ''}`}>
                          <td className="px-2 py-1">{l.item_code} · {l.item_name}</td>
                          <td className="px-2 py-1">{l.uom}</td>
                          <td className="px-2 py-1 text-right">{num(l.needed)}</td>
                          {/* O QUE FALTA, A VERMELHO. O motor recusa produzir com
                              falta (produzir com saldo negativo estraga o custo
                              médio do ingrediente e, com ele, o de todos os pratos
                              que o levem) — por isso a falta tem de estar à vista. */}
                          <td className={`px-2 py-1 text-right ${l.missing ? 'text-[#B91C1C] font-bold' : ''}`}>{num(l.on_hand)}</td>
                          <td className="px-2 py-1 text-right">{num(l.unit_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#E6E8EC] bg-[#F1F2F4]">
                        <td className="px-2 py-1 font-bold" colSpan={4}>Custo previsto desta produção</td>
                        <td className="px-2 py-1 text-right font-bold">
                          {num(necessidades.lines.reduce((s, l) => s + Number(l.needed) * Number(l.unit_cost), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
                {necessidades && !necessidades.can_produce && !!necessidades.lines?.length && (
                  <div className="p-2 text-[11px] text-[#B91C1C] border-t border-[#E6E8EC]">
                    Falta stock dos ingredientes assinalados — receba a mercadoria ou
                    corrija o inventário. O botão <b>Produzir</b> só abre quando houver tudo.
                  </div>
                )}
              </div>
            )}

            {ordem && ordem.status === 'DONE' && (
              <div className="bg-white border border-[#E6E8EC]">
                <div className="px-2 py-1 bg-[#EEF1F5] border-b border-[#E6E8EC] text-[11px] font-bold">
                  O que aconteceu — produzida em {(ordem.produced_at || '').slice(0, 16).replace('T', ' ')}
                </div>
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="bg-[#F1F2F4] text-left">
                      <th className="px-2 py-1 font-medium">Saiu do armazém</th>
                      <th className="px-2 py-1 font-medium text-right">Qtd</th>
                      <th className="px-2 py-1 font-medium text-right">Custo/un</th>
                      <th className="px-2 py-1 font-medium text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ordem.consumptions ?? []).map((c: any) => (
                      <tr key={c.id} className="border-t border-[#F1F2F4]">
                        <td className="px-2 py-1">{c.item_code} · {c.item_name}</td>
                        <td className="px-2 py-1 text-right">{num(c.quantity)}</td>
                        <td className="px-2 py-1 text-right">{num(c.unit_cost)}</td>
                        <td className="px-2 py-1 text-right">{num(c.total_cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-[#E6E8EC] bg-[#F1F2F4]">
                      <td className="px-2 py-1 font-bold" colSpan={3}>Custo que se formou</td>
                      <td className="px-2 py-1 text-right font-bold">{num(ordem.total_cost)}</td>
                    </tr>
                    <tr className="bg-[#F1F2F4]">
                      <td className="px-2 py-1 text-gray-600" colSpan={3}>
                        Custo por unidade produzida — é este que vai para a ficha do artigo
                      </td>
                      <td className="px-2 py-1 text-right font-bold">{num(ordem.unit_cost)}</td>
                    </tr>
                  </tfoot>
                </table>
                <div className="p-2 text-[11px] text-gray-600 border-t border-[#E6E8EC]">
                  Lote do produzido: <b>{ordem.lot_number || ordem.number}</b>
                  {ordem.expiry_date ? <> · validade <b>{ordem.expiry_date}</b></> : ' · sem validade'}
                  <div className="mt-1">
                    Desfazer uma produção não se faz por aqui: o molho já foi feito e a
                    carne já não volta a ser carne. Para corrigir, faça um ajuste de
                    inventário — fica o rasto de quem o fez.
                  </div>
                </div>
              </div>
            )}

            {ordem?.note && (
              <div className="bg-white border border-[#E6E8EC] p-2 text-[11px]">
                <span className="text-gray-600">Observações: </span>{ordem.note}
              </div>
            )}
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
