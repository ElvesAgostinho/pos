import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { comPerguntas } from '../posPrompt';
import EntityPicker from './EntityPicker';
import GuestPick from './GuestPick';

/**
 * PAGAMENTOS — o momento em que o dinheiro entra.
 *
 * As caixas do modo de pagamento mandam, e quem manda é o SERVIDOR: parcial, misto,
 * multi-moeda, troco, gaveta, TPA, conta corrente, cartão de membro. O terminal não
 * reimplementa nenhuma dessas regras — pede, e se faltar alguma coisa, o servidor diz o
 * quê e o terminal pergunta (posPrompt.ts). Duas cópias da mesma regra divergem sempre.
 *
 * PAGO e A PAGAR estão sempre à vista: é a única forma de o empregado saber se ainda
 * falta receber. Um pagamento misto (metade em dinheiro, metade no cartão) faz-se aqui
 * tocando duas vezes, e o "A pagar" desce.
 */
export default function PayPanel({ ticket, entidade: entidadeInicial, exigirEntidade, onClose, onPaid }: {
  ticket: any; entidade?: any | null; exigirEntidade?: boolean;
  onClose: () => void; onPaid: () => void;
}) {
  const [entidade, setEntidade] = useState<any | null>(entidadeInicial || null);
  // (Parâmetro 8310) "Pedir a entidade antes de cobrar": o painel abre já a perguntar
  // QUEM paga — casas que faturam sempre com NIF não deixam cobrar ao "consumidor final".
  const [escolherEntidade, setEscolherEntidade] = useState(!!exigirEntidade && !entidadeInicial);
  const [valor, setValor] = useState('');
  const [teclado, setTeclado] = useState(false);
  const [modoCartao, setModoCartao] = useState('');
  const [busy, setBusy] = useState(false);
  const [conta, setConta] = useState(ticket);

  const { data: metodos = [] } = useQuery({
    queryKey: ['pos-payments', ticket.outlet],
    queryFn: async () => {
      const r = await apiClient.get('pos/outlet-payment-methods/', { params: { outlet: ticket.outlet } });
      const lista = ((r.data?.results || r.data || []) as any[]).filter((m) => m.is_active);
      // (8012) o MEIO DE PAGAMENTO BASE aparece primeiro — é o que a mão procura.
      try {
        const base = (JSON.parse(localStorage.getItem('pos_cfg') || '{}').base_payment_mode || 'Cash');
        const tipo = { Cash: 'CASH', 'Cartão': 'CARD', 'Transferência': 'OTHER' }[base as string] || 'CASH';
        lista.sort((a, b) => (a.method_type_code === tipo ? -1 : 0) - (b.method_type_code === tipo ? -1 : 0));
      } catch { /* sem configuração ainda */ }
      return lista;
    },
  });
  const { data: cartao } = useQuery({
    queryKey: ['pos-card', entidade?.id],
    queryFn: async () => (await apiClient.get(`pos/cards/account/${entidade.id}/`)).data,
    enabled: !!entidade?.id && !!entidade?.member_card,
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const pago = Number(conta.grand_total || 0) - Number(conta.balance_due ?? conta.grand_total ?? 0);
  const falta = Number(conta.balance_due ?? conta.grand_total ?? 0);

  // CONTA QUARTO: o quarto escolhe-se da LISTA DO PMS (parâmetros 8035/8064 mandam),
  // não se escreve à mão — é assim que o jantar não vai parar ao quarto errado.
  const [pedirQuarto, setPedirQuarto] = useState<any | null>(null);

  const cobrar = async (m: any, extra: any = {}) => {
    // Com o 8310 ligado não há cobrança sem entidade — a escolha volta a abrir-se.
    if (exigirEntidade && !entidade) { setEscolherEntidade(true); return; }
    if (m.method_type_code === 'ROOM' && !extra.room) { setPedirQuarto(m); return; }
    setBusy(true);
    try {
      const r = await comPerguntas(`pos/tickets/${ticket.id}/pay/`, {
        payment_method: m.payment_method,
        // Sem valor escrito, cobra-se o que falta — que é o que acontece em 9 de 10 contas.
        amount: valor || falta,
        ...(entidade ? { customer: entidade.id } : {}),
        ...(modoCartao ? { card_mode: modoCartao } : {}),
        ...extra,
      }, async (label, detalhe) => window.prompt(`${detalhe}\n\n${label}:`));

      if (r?.pickup_alert) alert(r.pickup_alert);
      if (r?.print_counter_value) alert(`Contravalor: ${r.print_counter_value}`);
      if (r?.change_returned && Number(r.change_returned) > 0) {
        alert(`TROCO: ${money(r.change_returned)} Kz`);
      }

      const tk = (await apiClient.get(`pos/tickets/${ticket.id}/`)).data;
      setConta(tk);
      setValor('');
      setModoCartao('');
      if (Number(tk.balance_due ?? 0) <= 0) onPaid();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível cobrar.');
    } finally { setBusy(false); }
  };

  const tecla = (t: string) => {
    if (t === 'C') return setValor('');
    if (t === '⌫') return setValor(valor.slice(0, -1));
    setValor(valor + t);
  };

  return (
    <Window title="Pagamentos" width={820} tone="#0f8b8d" onClose={onClose}>
      <div>

        {/* o valor a entregar (vazio = cobra o que falta) */}
        <button onClick={() => setTeclado(!teclado)}
          className="w-full h-[62px] bg-[#3a3a3a] flex items-center justify-between px-4 border-b border-black">
          <span className="text-white text-[22px] font-bold">Kz</span>
          <span className="text-white text-[26px] font-bold">{valor || money(falta)}</span>
        </button>

        {teclado && (
          <div className="grid grid-cols-3 gap-1 p-2 bg-[#1f1f1f]">
            {['7', '8', '9', '4', '5', '6', '1', '2', '3', 'C', '0', '⌫'].map((t) => (
              <button key={t} onClick={() => tecla(t)}
                className={`h-[46px] text-[19px] font-bold rounded ${t === 'C'
                  ? 'bg-[#c0140f] text-white' : 'bg-[#3a3a3a] text-white'}`}>{t}</button>
            ))}
          </div>
        )}

        {/* os meios de pagamento AUTORIZADOS neste ponto de venda. "Conta Quarto" só
            aparece a HÓSPEDES — o passante e o consumo interno não têm quarto onde
            a conta caia (o tipo perguntou-se ao abrir a mesa, parâmetro 8175). */}
        <div className="p-3 bg-[#2b2b2b]">
          <div className="grid grid-cols-5 gap-2">
            {metodos.filter((m: any) =>
              m.method_type_code !== 'ROOM' || conta.guest_type === 'HOTEL').map((m: any) => (
              <button key={m.id} onClick={() => !busy && cobrar(m)} disabled={busy || falta <= 0}
                className="h-[86px] bg-[#0f8b8d] text-white text-[15px] font-bold rounded-sm
                  px-2 leading-tight active:scale-95 disabled:opacity-40">
                {m.payment_method_name}
              </button>
            ))}
            {metodos.length === 0 && (
              <div className="col-span-5 text-white/50 text-center py-12">
                Nenhum meio de pagamento autorizado neste ponto de venda.
              </div>
            )}
          </div>

          {/* cartão de membro da entidade escolhida */}
          {cartao && (
            <div className="mt-3 border border-[#4a4a4a] p-2">
              <div className="text-white/70 text-[13px] mb-2">
                {entidade.name} · crédito <b className="text-white">{money(cartao.credit)}</b> ·
                dívida <b className="text-white">{money(cartao.debt)}</b> ·
                pontos <b className="text-white">{cartao.points}</b> ({money(cartao.points_value)} Kz)
              </div>
              <div className="grid grid-cols-3 gap-2">
                {cartao.card.has_credit && (
                  <button onClick={() => setModoCartao(modoCartao === 'CREDIT' ? '' : 'CREDIT')}
                    className={`h-[50px] rounded text-[15px] font-bold ${modoCartao === 'CREDIT'
                      ? 'bg-[#1f7a34] text-white' : 'bg-[#3a3a3a] text-white/80'}`}>Usar crédito</button>
                )}
                {cartao.card.has_debit && (
                  <button onClick={() => setModoCartao(modoCartao === 'DEBIT' ? '' : 'DEBIT')}
                    className={`h-[50px] rounded text-[15px] font-bold ${modoCartao === 'DEBIT'
                      ? 'bg-[#8a6100] text-white' : 'bg-[#3a3a3a] text-white/80'}`}>Fica a dever</button>
                )}
                {cartao.card.has_points && (
                  <button onClick={() => setModoCartao(modoCartao === 'POINTS' ? '' : 'POINTS')}
                    className={`h-[50px] rounded text-[15px] font-bold ${modoCartao === 'POINTS'
                      ? 'bg-[#1a4f8a] text-white' : 'bg-[#3a3a3a] text-white/80'}`}>Pagar com pontos</button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* PAGAMENTO MISTO — o que JÁ entrou, meio a meio: metade em dinheiro, o resto
            no cartão ou por transferência. Cada toque num meio cobra o valor escrito
            (ou o que falta), e a lista mostra as parcelas até a conta fechar. */}
        {(conta.payments || []).length > 0 && (
          <div className="bg-[#242424] px-4 py-2 border-t border-black max-h-[120px] overflow-auto">
            {(conta.payments || []).map((p: any) => (
              <div key={p.id} className="flex justify-between text-white/85 text-[15px] leading-[1.7]">
                <span>{p.payment_method_name}</span>
                <span>{money(p.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {/* pago / a pagar */}
        <div className="h-[54px] bg-[#3a3a3a] flex items-center px-4 text-white text-[20px] font-semibold">
          <span>Pago: {money(pago)}</span>
          <span className="ml-auto">A pagar: {money(falta)}</span>
        </div>

        {/* ações */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-black">
          <button onClick={() => setEscolherEntidade(true)}
            className="h-[56px] bg-[#1f1f1f] text-white text-[22px]" title="Entidade (quem leva a fatura)">
            👤+ <span className="text-[14px] align-middle ml-1">
              {entidade ? entidade.name.slice(0, 12) : 'Venda Direta'}
            </span>
          </button>
          <button onClick={async () => {
            // GIFT CARD: o saldo do cartão abate à conta (motor redeem_gift — o saldo
            // vive no servidor; aqui só se lê o código).
            const codigo = window.prompt('GIFT CARD — leia ou escreva o código:');
            if (!codigo) return;
            try {
              const r = await apiClient.post(`pos/tickets/${ticket.id}/redeem_gift/`, { code: codigo.trim() });
              const tk = (await apiClient.get(`pos/tickets/${ticket.id}/`)).data;
              setConta(tk);
              if (Number(tk.balance_due ?? 0) <= 0) onPaid();
              else alert(`Gift aplicado. Falta: ${money(tk.balance_due)} Kz`);
            } catch (e: any) { alert(e?.response?.data?.detail || 'Gift card inválido.'); }
          }}
            className="h-[56px] bg-[#1f1f1f] text-white text-[22px]" title="Gift card">🎁</button>
          <button onClick={() => setTeclado(!teclado)}
            className="h-[56px] bg-[#1f1f1f] text-white text-[22px]" title="Escrever o valor entregue">✎</button>
          <button onClick={() => { setValor(''); setModoCartao(''); }}
            className="h-[56px] bg-[#1f1f1f] text-white text-[22px]" title="Limpar">⌫</button>
        </div>
        <div className="grid grid-cols-3 gap-1 p-1 pt-0 bg-black">
          <button onClick={onPaid} disabled={falta > 0}
            className="h-[56px] bg-[#1f1f1f] text-[#2ecc40] text-[26px] disabled:opacity-30"
            title="Fechar a conta">✔</button>
          <button onClick={async () => {
            try {
              const r = await apiClient.post(`pos/tickets/${ticket.id}/issue_document/`, {
                doc_type: falta > 0 ? 'FT' : 'FR',
                ...(entidade ? { customer: entidade.id } : {}),
              });
              alert(`Documento emitido: ${r.data.invoice_no}`);
            } catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao faturar.'); }
          }}
            className="h-[56px] bg-[#1f1f1f] text-[#2ecc40] text-[22px]" title="Emitir documento e fechar">
            🗎 ✔
          </button>
          <button onClick={onClose}
            className="h-[56px] bg-[#1f1f1f] text-[#e02020] text-[26px]">✖</button>
        </div>
      </div>

      {escolherEntidade && (
        <EntityPicker onPick={(e) => { setEntidade(e); setEscolherEntidade(false); }}
          onCancel={() => setEscolherEntidade(false)} />
      )}

      {/* Conta Quarto: o quarto vem da lista do PMS, com um toque */}
      {pedirQuarto && (
        <GuestPick titulo="Lançar no quarto de…"
          onPick={(g) => { const m = pedirQuarto; setPedirQuarto(null); cobrar(m, { room: g.room }); }}
          onClose={() => setPedirQuarto(null)} />
      )}
    </Window>
  );
}
