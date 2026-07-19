import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { comPerguntas } from '../posPrompt';
import EntitySearchPos from './EntitySearchPos';
import ClientPicker from './ClientPicker';
import CustomerIdForm from './CustomerIdForm';
import NotesDialog from './NotesDialog';
import PaymentReceipt from './PaymentReceipt';
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
  const total = Number(conta.grand_total || 0);
  // O QUE JÁ ENTROU no servidor (pagamentos anteriores desta conta).
  const jaPago = total - Number(conta.balance_due ?? total);
  // AS FRAÇÕES por confirmar: {id do meio: {amount, nome, metodo, room?}}
  const [parcelas, setParcelas] = useState<Record<number, any>>({});
  const somaExcluindo = (p: Record<number, any>, excluir?: number) =>
    jaPago + Object.entries(p).reduce((s, [k, v]) =>
      s + (Number(k) === excluir ? 0 : Number(v.amount || 0)), 0);
  const pago = somaExcluindo(parcelas);
  const falta = Number(Math.max(0, total - pago).toFixed(2));

  // CONTA QUARTO: o quarto escolhe-se da LISTA DO PMS (parâmetros 8035/8064 mandam),
  // não se escreve à mão — é assim que o jantar não vai parar ao quarto errado.
  const [pedirQuarto, setPedirQuarto] = useState<any | null>(null);
  // As três janelas dos ícones de baixo.
  const [dadosCliente, setDadosCliente] = useState(false);
  const [verObs, setVerObs] = useState(false);
  const [escolherSerie, setEscolherSerie] = useState(false);
  // O RECIBO final: guarda o numero do documento (ou '' se ainda nao ha).
  const [recibo, setRecibo] = useState<string | null>(null);

  // AS SÉRIES vêm do backoffice (Configuração POS › Séries de Documento).
  const { data: series = [] } = useQuery({
    queryKey: ['pos-doc-series'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/documents/');
      return ((r.data?.results || r.data || []) as any[]).filter((s) => s.is_active !== false);
    },
    enabled: escolherSerie,
  });

  // O NÚMERO DO DOCUMENTO desta conta, lido dos documentos emitidos.
  const numeroDoc = async (): Promise<string | null> => {
    try {
      const dd = await apiClient.get('pos/reports/documents/', { params: { search: conta.ticket_number } });
      return ((dd.data?.rows || dd.data?.results || []) as any[])[0]?.number || null;
    } catch { return null; }
  };

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

  /**
   * COMPOR O PAGAMENTO — tocar num meio NÃO cobra: reparte.
   *
   * O cliente tem metade no cartão e metade em dinheiro; ou a mesa inteira quer dividir
   * a conta. Cobrar logo o total ao primeiro toque tornava isso impossível: ficava pago
   * e para repartir era preciso estornar. Agora cada toque põe uma FRAÇÃO no meio
   * tocado — escreve-se o valor no teclado e toca-se, ou toca-se sem escrever e leva o
   * que falta. O ✔ é que confirma tudo de uma vez.
   *
   * Enquanto não se confirma, não entrou dinheiro nenhum no servidor: pode-se corrigir
   * à vontade, que é como se conta dinheiro à frente do cliente.
   */
  /**
   * DIVISÃO AUTOMÁTICA entre os meios escolhidos.
   *
   * Há duas maneiras de repartir, e o terminal tem de aceitar as duas:
   *
   *   SEM ESCREVER VALOR — toca-se nos meios e a conta divide-se sozinha por eles.
   *     Um meio: leva tudo. Dois: metade cada. Três: um terço cada. É o caso do
   *     cliente que tem metade em dinheiro e metade para transferir e não sabe de
   *     cabeça quanto é metade.
   *
   *   ESCREVENDO O VALOR — o meio leva exatamente o que se escreveu e fica FIXO. O que
   *     sobra reparte-se pelos outros. É o caso do "tenho 5000 em dinheiro, o resto no
   *     cartão".
   *
   * Antes, o primeiro meio tocado levava o TOTAL e não sobrava nada: tocar num segundo
   * meio não fazia rigorosamente nada. Pagar metade e metade era impossível.
   */
  const repartir = (m: any) => {
    const chave = m.payment_method;
    const escrito = Number(String(valor).replace(',', '.'));
    setParcelas((p) => {
      const novo: Record<number, any> = { ...p };
      // tocar num meio que já lá está TIRA-O (e o valor dele volta para os outros)
      if (!valor && novo[chave] != null) delete novo[chave];
      else {
        novo[chave] = {
          ...(novo[chave] || {}),
          nome: m.payment_method_name, metodo: m,
          amount: valor && escrito > 0 ? escrito : 0,
          // FIXO = o empregado escreveu o valor. Os outros ajustam-se à volta dele.
          fixa: !!(valor && escrito > 0),
        };
      }
      return redistribuir(novo);
    });
    setValor('');
  };

  /**
   * Reparte o que falta pelos meios que NÃO têm valor escrito. O último leva os cêntimos
   * da divisão, para a soma bater sempre certo com o total — um cêntimo a menos deixa a
   * conta por fechar e ninguém percebe porquê.
   */
  const redistribuir = (p: Record<number, any>) => {
    const chaves = Object.keys(p).map(Number);
    const fixos = chaves.filter((k) => p[k].fixa);
    const autos = chaves.filter((k) => !p[k].fixa);
    const somaFixos = fixos.reduce((s, k) => s + Number(p[k].amount || 0), 0);
    let resto = Number((total - jaPago - somaFixos).toFixed(2));
    if (resto < 0) resto = 0;
    if (!autos.length) return p;
    const fatia = Math.floor((resto / autos.length) * 100) / 100;
    autos.forEach((k, i) => {
      p[k] = { ...p[k], amount: i === autos.length - 1
        ? Number((resto - fatia * (autos.length - 1)).toFixed(2)) : fatia };
    });
    return p;
  };

  /**
   * CONFIRMAR — agora sim, o dinheiro entra.
   *
   * Cada fração vai ao motor pelo mesmo caminho de sempre (um pagamento por meio), e é
   * o servidor que decide troco, gaveta, sangria e conta corrente. Se uma falhar, para-se
   * ali e diz-se qual: metade cobrada e metade não é pior do que nada cobrado.
   */
  const confirmar = async () => {
    if (exigirEntidade && !entidade) { setEscolherEntidade(true); return; }
    const linhas = Object.values(parcelas);
    if (!linhas.length) return aviso('Escolha primeiro como o cliente paga.');
    setBusy(true);
    try {
      for (const l of linhas) {
        // CONTA QUARTO precisa do quarto — pergunta-se antes de mandar nada.
        if (l.metodo.method_type_code === 'ROOM' && !l.room) {
          setBusy(false); setPedirQuarto(l.metodo); return;
        }
        const r = await comPerguntas(`pos/tickets/${ticket.id}/pay/`, {
          payment_method: l.metodo.payment_method,
          amount: l.amount,
          ...(l.room ? { room: l.room } : {}),
          ...(entidade ? { customer: entidade.id } : {}),
          ...(modoCartao ? { card_mode: modoCartao } : {}),
        }, async (label, detalhe) => await pedir(`${detalhe}\n\n${label}:`));
        if (r?.pickup_alert) aviso(r.pickup_alert);
        if (r?.print_counter_value) aviso(`Contravalor: ${r.print_counter_value}`);
      }

      const tk = (await apiClient.get(`pos/tickets/${ticket.id}/`)).data;
      setConta(tk);
      setParcelas({});
      setValor('');
      setModoCartao('');
      // O RECIBO — quanto era, quanto entrou em cada meio, o troco e o documento.
      let doc: string | null = null;
      try {
        const dd = await apiClient.get('pos/reports/documents/', { params: { search: tk.ticket_number } });
        doc = ((dd.data?.rows || dd.data?.results || []) as any[])[0]?.number || null;
      } catch { /* sem documento ainda: o recibo diz isso e deixa emitir */ }
      setRecibo(doc || '');
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
              const jaEntrou = (conta.payments || [])
                .filter((p: any) => p.payment_method === m.payment_method)
                .reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
              const fracao = parcelas[m.payment_method]?.amount;
              // Um meio com fração fica ACESO — vê-se de relance como a conta está
              // repartida antes de se confirmar.
              const aceso = fracao != null;
              return (
                <button key={m.id} onClick={() => !busy && repartir(m)} disabled={busy}
                  title={aceso ? 'Tocar outra vez para tirar' : 'Escreva o valor e toque; sem valor, leva o que falta'}
                  className={`h-[132px] rounded-[3px] text-white px-2 leading-tight border-2 border-black
                    shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-3px_0_rgba(0,0,0,0.4)]
                    active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.55)]
                    disabled:opacity-40 disabled:shadow-none
                    flex flex-col items-center justify-center gap-1
                    ${aceso ? 'bg-gradient-to-b from-[#22c3c5] to-[#0d8385] ring-[3px] ring-white/80 ring-inset'
                      : 'bg-gradient-to-b from-[#1aa3a5] to-[#0b6b6d]'}`}>
                  <span className="text-[17px] font-bold text-center">{m.payment_method_name}</span>
                  {/* A BARRA DE FRAÇÃO: o que este meio leva desta conta. */}
                  {(aceso || jaEntrou > 0) && (
                    <>
                      <span className="w-[78%] h-[2px] bg-white/70" />
                      <span className="text-[20px] font-bold">{money(fracao ?? jaEntrou)}</span>
                      {jaEntrou > 0 && aceso && (
                        <span className="text-[11px] text-white/70">já entrou {money(jaEntrou)}</span>
                      )}
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
          <BotaoPag
            onClick={() => (Object.keys(parcelas).length ? confirmar() : onPaid())}
            on={!busy && (Object.keys(parcelas).length > 0 || falta <= 0)} cor="#2ecc40"
            titulo={Object.keys(parcelas).length
              ? `Confirmar o pagamento (${money(pago - jaPago)} Kz)`
              : falta > 0 ? `Escolha como o cliente paga` : 'Fechar a conta'}>
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

      {/* O RECIBO — aparece assim que a conta fica saldada. */}
      {recibo !== null && (
        <PaymentReceipt conta={conta} documento={recibo || null}
          onFechar={() => { setRecibo(null); onPaid(); }}
          onEmitir={async () => { await emitir(); const d = await numeroDoc(); setRecibo(d || ''); }}
          onEscolherSerie={() => setEscolherSerie(true)} />
      )}

      {escolherEntidade && (
        <EntitySearchPos onPick={(e) => { setEntidade(e); setEscolherEntidade(false); }}
          onClose={() => setEscolherEntidade(false)} />
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
          onPick={(g) => {
            const m = pedirQuarto; setPedirQuarto(null);
            setParcelas((p) => ({
              ...p,
              [m.payment_method]: {
                amount: p[m.payment_method]?.amount ?? falta,
                nome: m.payment_method_name, metodo: m, room: g.room,
              },
            }));
          }}
          onClose={() => setPedirQuarto(null)} />
      )}
    </Window>
  );
}
