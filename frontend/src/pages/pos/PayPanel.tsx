import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { comPerguntas } from '../posPrompt';
import EntityPicker from './EntityPicker';
import ClientPicker from './ClientPicker';
import CustomerIdForm from './CustomerIdForm';
import NotesDialog from './NotesDialog';
import {
  IcoCliente, IcoLapis, IcoLimpar, IcoPreco, IcoVisto, IcoCruz, IcoDocumento, IcoLista,
} from './Icons';
import { aviso, pedir } from '../../ui/dialogo';

/** Um botão do rodapé do painel de pagamentos — relevo pesado, alvo de dedo. */
const BotaoPag = ({ children, onClick, titulo, cor = '#ffffff', on = true }: {
  children: any; onClick: () => void; titulo: string; cor?: string; on?: boolean;
}) => (
  <button onClick={() => on && onClick()} disabled={!on} title={titulo} style={{ color: cor }}
    className="h-[64px] flex items-center justify-center gap-2 rounded-[3px] border-2 border-black
      bg-gradient-to-b from-[#4a4a4a] to-[#242424]
      shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
      active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
      disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed">
    {children}
  </button>
);

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
  // As três janelas dos ícones de baixo.
  const [dadosCliente, setDadosCliente] = useState(false);
  const [verObs, setVerObs] = useState(false);
  const [escolherSerie, setEscolherSerie] = useState(false);

  // AS SÉRIES vêm do backoffice (Configuração POS › Séries de Documento).
  const { data: series = [] } = useQuery({
    queryKey: ['pos-doc-series'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/documents/');
      return ((r.data?.results || r.data || []) as any[]).filter((s) => s.is_active !== false);
    },
    enabled: escolherSerie,
  });

  // EMITIR O DOCUMENTO. Sem série indicada, o motor usa a da ficha do setor.
  const emitir = async (serie?: any) => {
    try {
      const r = await apiClient.post(`pos/tickets/${ticket.id}/issue_document/`, {
        doc_type: serie?.type_code || (falta > 0 ? 'FT' : 'FR'),
        ...(serie ? { series: serie.id } : {}),
        ...(entidade ? { customer: entidade.id } : {}),
      });
      setEscolherSerie(false);
      aviso(`Documento emitido: ${r.data.invoice_no}`);
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Erro ao faturar.'); }
  };

  // OBSERVAÇÕES na conta — ficam gravadas no servidor, não só no ecrã.
  const gravarObs = async (texto: string) => {
    setVerObs(false);
    try {
      await apiClient.patch(`pos/tickets/${ticket.id}/`, { payment_notes: texto || null });
      setConta({ ...conta, payment_notes: texto });
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível gravar as observações.'); }
  };

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
      }, async (label, detalhe) => await pedir(`${detalhe}\n\n${label}:`));

      if (r?.pickup_alert) aviso(r.pickup_alert);
      if (r?.print_counter_value) aviso(`Contravalor: ${r.print_counter_value}`);
      if (r?.change_returned && Number(r.change_returned) > 0) {
        aviso(`TROCO: ${money(r.change_returned)} Kz`);
      }

      const tk = (await apiClient.get(`pos/tickets/${ticket.id}/`)).data;
      setConta(tk);
      setValor('');
      setModoCartao('');
      if (Number(tk.balance_due ?? 0) <= 0) onPaid();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível cobrar.');
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
        <div className="p-2 bg-[#2b2b2b] min-h-[300px]">
          <div className="grid grid-cols-5 gap-1.5">
            {metodos.filter((m: any) =>
              m.method_type_code !== 'ROOM' || conta.guest_type === 'HOTEL').map((m: any) => {
              // O QUE JÁ ENTROU POR ESTE MEIO. Um pagamento misto faz-se tocando em dois
              // meios; sem ver quanto entrou em cada um, o empregado perde a conta de
              // quanto já recebeu em dinheiro e quanto passou no cartão — e o fecho de
              // caixa não bate. A BARRA separa o nome do valor: é o que o original faz.
              const nesteMeio = (conta.payments || [])
                .filter((p: any) => p.payment_method === m.payment_method)
                .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
              return (
                <button key={m.id} onClick={() => !busy && cobrar(m)} disabled={busy || falta <= 0}
                  className="h-[132px] rounded-[3px] text-white px-2 leading-tight border-2 border-black
                    bg-gradient-to-b from-[#1aa3a5] to-[#0b6b6d]
                    shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-3px_0_rgba(0,0,0,0.4)]
                    active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.55)]
                    disabled:opacity-40 disabled:shadow-none
                    flex flex-col items-center justify-center gap-1">
                  <span className="text-[17px] font-bold text-center">{m.payment_method_name}</span>
                  {nesteMeio > 0 && (
                    <>
                      <span className="w-[78%] h-[2px] bg-white/70" />
                      <span className="text-[20px] font-bold">{money(nesteMeio)}</span>
                    </>
                  )}
                </button>
              );
            })}
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

        {/* ─── PRIMEIRA FILA: identificar · observar · limpar · gift ───
            O gift card ficou nesta fila (o original tem três botões, nós temos quatro):
            é uma função que já existia no nosso POS e não se tira nada do que cá está —
            escondê-la era obrigar quem tem vales a ir procurá-los noutro sítio. */}
        <div className="grid grid-cols-4 gap-1 p-1 bg-black">
          <BotaoPag onClick={() => setDadosCliente(true)}
            titulo={entidade ? `Cliente: ${entidade.name}` : 'Registar / procurar o cliente (NIF para a fatura)'}>
            <IcoCliente size={30} />
            {entidade && <span className="text-[12px] truncate max-w-[120px]">{entidade.name}</span>}
          </BotaoPag>
          <BotaoPag onClick={() => setVerObs(true)}
            titulo="Observações de pagamento (fica na conta e na auditoria)">
            <IcoLapis size={30} />
            {conta.payment_notes && <span className="w-2 h-2 rounded-full bg-[#f0c000]" />}
          </BotaoPag>
          {/* A BORRACHA limpa o VALOR escrito e o modo de cartão — não desfaz pagamentos
              já cobrados: esses são movimentos de dinheiro, e desfazem-se com estorno. */}
          <BotaoPag onClick={() => { setValor(''); setModoCartao(''); }}
            titulo="Limpar o valor escrito (não desfaz pagamentos já cobrados)">
            <IcoLimpar size={30} />
          </BotaoPag>
          <BotaoPag onClick={async () => {
            // GIFT CARD: o saldo do cartão abate à conta (motor redeem_gift — o saldo
            // vive no servidor; aqui só se lê o código).
            const codigo = await pedir('GIFT CARD — leia ou escreva o código:');
            if (!codigo) return;
            try {
              await apiClient.post(`pos/tickets/${ticket.id}/redeem_gift/`, { code: codigo.trim() });
              const tk = (await apiClient.get(`pos/tickets/${ticket.id}/`)).data;
              setConta(tk);
              if (Number(tk.balance_due ?? 0) <= 0) onPaid();
              else aviso(`Gift aplicado. Falta: ${money(tk.balance_due)} Kz`);
            } catch (e: any) { aviso(e?.response?.data?.detail || 'Gift card inválido.'); }
          }} titulo="Gift card / voucher">
            <IcoPreco size={30} />
          </BotaoPag>
        </div>

        {/* ─── SEGUNDA FILA: fechar · faturar · escolher série · cancelar ─── */}
        <div className="grid grid-cols-4 gap-1 p-1 pt-0 bg-black">
          <BotaoPag onClick={onPaid} on={falta <= 0} cor="#2ecc40"
            titulo={falta > 0 ? `Ainda falta receber ${money(falta)} Kz` : 'Fechar a conta'}>
            <IcoVisto size={32} />
          </BotaoPag>
          <BotaoPag onClick={() => emitir()} cor="#2ecc40"
            titulo="Emitir o documento fiscal (a série vem da ficha do setor)">
            <span className="flex items-center gap-1">
              <IcoDocumento size={26} /><IcoVisto size={24} />
            </span>
          </BotaoPag>
          {/* ESCOLHER A SÉRIE: por norma a série vem da ficha do setor (parâmetros
              8553-8589). Este botão é para a exceção — faturar por outra série sem ir
              ao backoffice trocar a configuração da sala toda. */}
          <BotaoPag onClick={() => setEscolherSerie(true)} cor="#2ecc40"
            titulo="Emitir escolhendo a série de documento">
            <span className="flex items-center gap-1">
              <IcoLista size={26} /><IcoVisto size={24} />
            </span>
          </BotaoPag>
          <BotaoPag onClick={onClose} cor="#e02020" titulo="Fechar o painel">
            <IcoCruz size={32} />
          </BotaoPag>
        </div>
      </div>

      {escolherEntidade && (
        <EntityPicker onPick={(e) => { setEntidade(e); setEscolherEntidade(false); }}
          onCancel={() => setEscolherEntidade(false)} />
      )}

      {/* 1º ícone — a ficha do cliente (procurar no ficheiro ou registar de novo) */}
      {dadosCliente && (
        <CustomerIdForm onClose={() => setDadosCliente(false)}
          onPick={async (e) => {
            setEntidade(e); setDadosCliente(false);
            // o NIF tem de ir para a CONTA, senão a fatura sai a Consumidor Final
            try {
              await apiClient.post(`pos/tickets/${ticket.id}/set_customer/`, {
                entity: e.id, customer_name: e.name, customer_tax_id: e.tax_id || null,
              });
              const tk = (await apiClient.get(`pos/tickets/${ticket.id}/`)).data;
              setConta(tk);
            } catch { /* a entidade fica escolhida na mesma para a emissão */ }
          }} />
      )}

      {/* 2º ícone — observações de pagamento */}
      {verObs && (
        <NotesDialog inicial={conta.payment_notes || ''}
          onOk={gravarObs} onClose={() => setVerObs(false)} />
      )}

      {/* escolher a SÉRIE antes de emitir (a exceção; a regra é a ficha do setor) */}
      {escolherSerie && (
        <Window title="Série do documento" width={620} tone="#0f8b8d"
          onClose={() => setEscolherSerie(false)}>
          <div className="max-h-[60vh] overflow-auto">
            {series.length === 0 && (
              <div className="p-6 text-white/60">
                Sem séries configuradas em <b>Configuração POS › Séries de Documento</b>.
              </div>
            )}
            {series.map((s: any) => (
              <button key={s.id} onClick={() => emitir(s)}
                className="w-full h-[60px] px-5 text-left text-white text-[18px]
                  bg-[#2b2b2b] hover:bg-[#3a3a3a] border-b border-black">
                <b>{s.type_code}</b> — {s.name || s.type_name}
                <span className="text-white/50 text-[14px] ml-2">
                  (série {s.code}{s.year ? `/${s.year}` : ''})
                </span>
              </button>
            ))}
          </div>
        </Window>
      )}

      {/* Conta Quarto: o quarto vem da lista do PMS, com um toque */}
      {pedirQuarto && (
        <ClientPicker titulo="Lançar no quarto de…" soAba="QUARTO" podeSaltar={false}
          onPick={(g) => { const m = pedirQuarto; setPedirQuarto(null); cobrar(m, { room: g.room }); }}
          onClose={() => setPedirQuarto(null)} />
      )}
    </Window>
  );
}
