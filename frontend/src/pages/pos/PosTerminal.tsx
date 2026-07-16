import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SectorPicker from './SectorPicker';
import CashOpen from './CashOpen';
import TableMap from './TableMap';
import SalesScreen from './SalesScreen';
import PayPanel from './PayPanel';
import MoveLines from './MoveLines';
import DocsPanel from './DocsPanel';
import GuestsPanel from './GuestsPanel';
import AccountsPanel from './AccountsPanel';
import PinChange from './PinChange';
import TicketPreview from './TicketPreview';

/**
 * O TERMINAL — o ecrã do empregado de mesa.
 *
 * O caminho é sempre o mesmo, e é o do ofício:
 *   entrar → escolher o SETOR (onde vou servir) → abrir a CAIXA (quanto tenho na gaveta)
 *   → o MAPA DE MESAS (onde estão os clientes) → a VENDA (o teclado).
 *
 * Não se salta nenhum passo: sem setor não se sabe que teclado nem que preços; sem caixa
 * aberta, o dinheiro entra num sítio que não existe e o fecho nunca bate certo.
 *
 * O TECLADO só aparece DENTRO da venda — nunca à frente das mesas. Um empregado que vê
 * o teclado sem ter uma mesa escolhida acaba a lançar a comida na conta errada.
 */

export type Etapa = 'SECTOR' | 'CASH' | 'MAP' | 'SALES';

export default function PosTerminal() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [etapa, setEtapa] = useState<Etapa>('SECTOR');
  const [setor, setSetor] = useState<any | null>(null);
  const [sessao, setSessao] = useState<any | null>(null);
  const [ticket, setTicket] = useState<number | null>(null);
  // Modo do mapa: lançar artigos, cobrar, ou CONSULTAR (mostrar o talão sem abrir a venda).
  const [modoMapa, setModoMapa] = useState<'ORDER' | 'PAY' | 'VIEW'>('ORDER');
  const [aCobrar, setACobrar] = useState<any | null>(null);
  const [aConsultar, setAConsultar] = useState<any | null>(null);
  // As janelas da barra da esquerda. Uma de cada vez — o empregado não faz duas coisas
  // ao mesmo tempo com uma mesa à espera.
  const [janela, setJanela] = useState<'' | 'SPLIT' | 'TRANSFER' | 'DOCS' | 'GUESTS' | 'MEALS' | 'CC'>('');
  const [contaAtual, setContaAtual] = useState<any | null>(null);
  // Modo de escolha de mesa: para as parciais e as transferências é preciso saber QUAL.
  const [escolher, setEscolher] = useState<'' | 'SPLIT' | 'TRANSFER'>('');
  const [agora, setAgora] = useState(new Date());

  // O TERMINAL NÃO TEM OPINIÃO PRÓPRIA: pergunta ao servidor como se comporta. Estas
  // caixas vivem em Configuração POS › Parâmetros, e mudam o caminho do empregado.
  // CONFIGURATION ENGINE: UMA chamada traz tudo — empresa, licença, módulos, setores
  // permitidos a ESTE operador, meios de pagamento, moedas, taxas e os parâmetros do
  // terminal. O terminal interpreta; quem decide é o backoffice.
  const { data: boot } = useQuery({
    queryKey: ['pos-bootstrap'],
    queryFn: async () => {
      const op = JSON.parse(localStorage.getItem('pos_operator') || '{}');
      return (await apiClient.get('pos/terminal/bootstrap/', {
        params: op?.operator_id ? { operator: op.operator_id } : undefined,
      })).data;
    },
  });
  const cfg = boot?.terminal;

  const operador = (() => {
    try { return JSON.parse(localStorage.getItem('pos_operator') || '{}'); } catch { return {}; }
  })();

  // (Utilizador POS) "Obrigar a mudar o PIN": o terminal PARA aqui, antes das mesas.
  // A caixa vem da ficha do operador — viaja no login, dentro de operator.flags.
  const [pinObrigatorio, setPinObrigatorio] = useState(!!operador?.flags?.must_change_pin);
  const pinTrocado = () => {
    const op = { ...operador, flags: { ...(operador?.flags || {}), must_change_pin: false } };
    localStorage.setItem('pos_operator', JSON.stringify(op));
    setPinObrigatorio(false);
  };

  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // O ARRANQUE obedece aos parâmetros:
  //   · "Escolher o setor ao entrar" desligado -> usa o primeiro setor e não pergunta;
  //   · "Exigir abertura de caixa" desligado   -> salta a caixa (terminais que não recebem
  //     dinheiro, só lançam no quarto);
  //   · "Venda Direta" ligado                  -> abre logo uma conta de balcão, sem mesas.
  useEffect(() => {
    if (!cfg || setor) return;
    (async () => {
      if (cfg.ask_sector) return;                       // o seletor fica, como está
      // Os setores já vieram no bootstrap — filtrados pela caixa "Todos os setores".
      const lista = boot?.sectors || [];
      if (!lista.length) return;
      setSetor(lista[0]);
      setEtapa(cfg.require_cash_open ? 'CASH' : 'MAP');
    })();
  }, [cfg, setor]);

  const abrirVendaDireta = async (pax: number, tipo: string) => {
    if (!setor) return;
    try {
      const r = await apiClient.post('pos/tickets/', {
        outlet: setor.outlet,
        operator_name: operador?.name || 'Operador',
        guests: pax,
        guest_type: tipo,
      });
      setTicket(r.data.id);
      setEtapa('SALES');
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível abrir a venda.');
    }
  };

  // VENDA DIRETA — a conta de balcão, sem mesa. NÃO tem popup nenhum: quem toca no ícone
  // da venda (ou em "Passante") quer vender JÁ. Perguntas são para as mesas.
  const vendaDireta = () => {
    if (!setor) return;
    abrirVendaDireta(1, 'PASSANTE');
  };

  const inval = () => qc.invalidateQueries();

  // (Parâmetro 8062) "Permitir fechar o dia no Front Office": o fecho que normalmente é
  // do backoffice pode ser feito aqui — casas pequenas onde o gerente é o caixa.
  const fecharDia = async () => {
    try {
      const r = await apiClient.get('pos/ops/day-close/');
      const d = r.data || {};
      if (d.can_close === false) return alert(d.blocker || 'Ainda há contas abertas.');
      const resumo = `FECHO DO DIA — ${d.date}\n\nVendas de hoje: ${d.sales_today?.count ?? 0} conta(s), `
        + `${Number(d.sales_today?.total || 0).toLocaleString('pt-PT')} Kz`
        + `\nCaixas abertas a fechar: ${(d.open_cash_sessions || []).length}`
        + `\n\nFechar o dia agora?`;
      if (!window.confirm(resumo)) return;
      const rr = await apiClient.post('pos/ops/day-close/', {});
      alert(rr.data?.detail || 'Dia fechado.');
      setSessao(null); setTicket(null); setEtapa('SECTOR'); inval();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível fechar o dia.');
    }
  };

  const sair = () => {
    localStorage.removeItem('pos_operator_token');
    nav('/pos/login');
  };

  // As opções da barra da esquerda. As que precisam de uma conta aberta ficam apagadas —
  // não se escondem: o empregado tem o sítio delas na memória e procurá-las-ia.
  const MENU: { label: string; icon: string; act: () => void; on?: boolean }[] = [
    ...(cfg?.direct_sale
      ? [{ label: 'Venda Direta', icon: '🛒', act: vendaDireta, on: !!setor }]
      : []),
    // CONSULTA: toca-se na mesa e vê-se o talão — sem passar pela página de venda.
    { label: 'Consulta de Mesa', icon: '🖨', act: () => { setModoMapa('VIEW'); setEtapa('MAP'); },
      on: !!sessao || !cfg?.require_cash_open },
    { label: 'Pagamentos', icon: '💰', act: () => { setModoMapa('PAY'); setEtapa('MAP'); }, on: !!sessao },
    // Parciais e transferências precisam de uma mesa COM conta: escolhe-se no mapa.
    { label: 'Funções Parciais', icon: '⑂', act: () => { setEscolher('SPLIT'); setModoMapa('PAY'); setEtapa('MAP'); }, on: !!sessao },
    // (Parâmetro 8124) "Não permitir": o botão desaparece — a casa não transfere mesas.
    ...(cfg?.transfers !== 'Não permitir'
      ? [{ label: 'Transferências', icon: '⇄', act: () => { setEscolher('TRANSFER'); setModoMapa('PAY'); setEtapa('MAP'); }, on: !!sessao }]
      : []),
    { label: 'Documentos', icon: '🗎', act: () => setJanela('DOCS'), on: true },
    { label: 'Mapa de Refeições', icon: '🍸', act: () => setJanela('MEALS'), on: true },
    { label: 'Info.Hósp.', icon: '👤', act: () => setJanela('GUESTS'), on: true },
    { label: 'Setor', icon: '🖵', act: () => setEtapa('SECTOR'), on: true },
    { label: 'Contas Correntes', icon: '≣', act: () => setJanela('CC'), on: true },
    // (Parâmetro 8062) o fecho do dia só aparece se o backoffice o permitir aqui.
    ...(cfg?.allow_day_close
      ? [{ label: 'Fecho do Dia', icon: '🔒', act: fecharDia, on: true }]
      : []),
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] select-none overflow-hidden">
      {/* ───── barra de cima: as duas vistas (mesas / venda) e a engrenagem ───── */}
      <div className="h-[92px] bg-black flex items-stretch flex-shrink-0">
        <div className="w-[210px] flex items-center justify-center">
          <span className="text-[34px] font-black text-white tracking-tight">
            ML<span className="text-[#c9a400]">.</span>
          </span>
        </div>

        <button onClick={() => setEtapa('MAP')} disabled={!sessao}
          className={`w-[150px] m-2 rounded flex items-center justify-center text-[40px] disabled:opacity-30
            ${etapa === 'MAP' ? 'bg-[#b39100] text-white' : 'bg-[#2a2a2a] text-white/70'}`}>
          ▦
        </button>
        {/* O ícone da VENDA: com uma conta aberta, mostra-a; SEM conta, abre a VENDA
            DIRETA (a conta de balcão, sem mesa). É assim no original — o balcão não
            escolhe mesa nenhuma, toca aqui e vende. */}
        <button
          onClick={() => (ticket ? setEtapa('SALES') : vendaDireta())}
          disabled={!setor}
          title={ticket ? 'Voltar à venda' : 'Venda Direta (sem mesa)'}
          className={`w-[150px] my-2 rounded flex items-center justify-center gap-1 disabled:opacity-30
            ${etapa === 'SALES' ? 'bg-[#b39100] text-white' : 'bg-[#2a2a2a] text-white/70'}`}>
          <span className="flex flex-col gap-[5px]">
            <span className="w-[26px] h-[4px] bg-current rounded" />
            <span className="w-[26px] h-[4px] bg-current rounded" />
            <span className="w-[26px] h-[4px] bg-current rounded" />
          </span>
          <span className="text-[30px]">💰</span>
        </button>

        <div className="flex-1" />
        <div className="flex items-center pr-3 text-white/80 text-sm">
          <span className="mr-4">{operador?.name || 'Operador'}</span>
          <button onClick={() => setEtapa('SECTOR')}
            className="w-[74px] h-[74px] m-2 rounded bg-[#3a3a3a] text-white text-[34px] flex items-center justify-center">
            ⚙
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ───── barra da esquerda ───── */}
        <div className="w-[176px] bg-black flex flex-col flex-shrink-0 overflow-auto">
          {MENU.map((m) => (
            <button key={m.label} onClick={() => m.on !== false && m.act()}
              disabled={m.on === false}
              className="h-[120px] border-b border-[#2a2a2a] flex flex-col items-center justify-center gap-1
                text-white text-[15px] font-semibold leading-tight px-2 text-center
                disabled:text-white/25 hover:bg-[#1f1f1f] disabled:hover:bg-transparent">
              <span className="text-[30px]">{m.icon}</span>
              {m.label}
            </button>
          ))}
          <button onClick={sair}
            className="h-[120px] bg-[#c0140f] text-white flex flex-col items-center justify-center gap-1 font-bold mt-auto">
            <span className="text-[32px]">✕</span> Sair
          </button>
        </div>

        {/* ───── o palco ───── */}
        <div className="flex-1 relative overflow-hidden"
          style={{ background: etapa === 'SALES' ? '#2b2b2b' : (setor?.map_bg_color || '#c9c3c1') }}>
          {etapa === 'MAP' && setor && (
            <>
              {modoMapa !== 'ORDER' && (
                <div className="absolute top-0 inset-x-0 h-[34px] bg-[#0f8b8d] text-white
                  flex items-center justify-center font-bold z-10">
                  {modoMapa === 'VIEW' ? 'Consulta de Mesa — toque na mesa para ver o consumo'
                    : escolher === 'SPLIT' ? 'Funções Parciais — escolha a mesa'
                      : escolher === 'TRANSFER' ? 'Transferências — escolha a mesa de origem'
                        : 'Pagamentos — escolha a mesa a cobrar'}
                </div>
              )}
              <TableMap setor={setor} modo={modoMapa}
                perguntarTipo={cfg?.ask_guest_type !== false}
                refrescar={(cfg?.tables_refresh_seconds || 8) * 1000}
                onOpenTicket={(id) => { setTicket(id); setEtapa('SALES'); }}
                onViewTicket={(t) => setAConsultar(t)}
                onDirectSale={vendaDireta}
                onPayTicket={(t) => {
                  if (escolher) { setContaAtual(t); setJanela(escolher); setEscolher(''); setModoMapa('ORDER'); }
                  else setACobrar(t);
                }} />
            </>
          )}
          {etapa === 'SALES' && ticket && (
            <SalesScreen ticketId={ticket} setor={setor} cfg={cfg}
              onClose={() => { setTicket(null); setEtapa('MAP'); inval(); }} />
          )}

          {/* O seletor de SETOR e a ABERTURA DE CAIXA são janelas por cima do palco:
              o empregado nunca perde de vista onde está. */}
          {etapa === 'SECTOR' && (
            <SectorPicker sectors={boot?.sectors}
              onPick={(s) => {
                setSetor(s);
                // "Exigir abertura de caixa": se estiver desligada, vai-se direto ao serviço.
                setEtapa(sessao || cfg?.require_cash_open === false ? 'MAP' : 'CASH');
              }}
              onCancel={setor ? () => setEtapa(sessao ? 'MAP' : 'CASH') : undefined}
            />
          )}
          {aCobrar && (
            <PayPanel ticket={aCobrar} exigirEntidade={!!cfg?.ask_entity_before_pay}
              onClose={() => setACobrar(null)}
              onPaid={() => { setACobrar(null); setModoMapa('ORDER'); inval(); }} />
          )}

          {(janela === 'SPLIT' || janela === 'TRANSFER') && contaAtual && (
            <MoveLines modo={janela} ticket={contaAtual} setor={setor}
              modoTransfer={cfg?.transfers}
              onClose={() => { setJanela(''); setContaAtual(null); inval(); }} />
          )}
          {janela === 'DOCS' && <DocsPanel onClose={() => setJanela('')} />}
          {janela === 'GUESTS' && <GuestsPanel aba="GUESTS" onClose={() => setJanela('')} />}
          {janela === 'MEALS' && <GuestsPanel aba="MEALS" onClose={() => setJanela('')} />}
          {janela === 'CC' && <AccountsPanel onClose={() => setJanela('')} />}

          {/* Consulta de Mesa: o talão de conferência (documento CM da AGT), sem venda. */}
          {aConsultar && (
            <TicketPreview ticket={aConsultar}
              onClose={() => { setAConsultar(null); setModoMapa('ORDER'); }} />
          )}

          {etapa === 'CASH' && setor && (
            <CashOpen setor={setor} operador={operador}
              onOpened={(s) => { setSessao(s); setEtapa('MAP'); }}
              onBack={() => setEtapa('SECTOR')} />
          )}

          {/* A troca de PIN obrigatória fica POR CIMA de tudo — não se trabalha sem ela. */}
          {pinObrigatorio && <PinChange operador={operador} onDone={pinTrocado} />}
        </div>
      </div>

      {/* ───── barra de baixo: onde estou, e que horas são ───── */}
      <div className="h-[58px] bg-black text-white flex items-center px-3 flex-shrink-0">
        <span className="text-[#e0a020] text-[28px] mr-3">⚠</span>
        <span className="text-[20px] font-bold">{setor ? setor.name : '(nenhum)'}</span>
        {sessao && (
          <span className="ml-4 text-white/60 text-sm">
            Caixa aberta · fundo {Number(sessao.opening_float).toLocaleString('pt-PT')} Kz
          </span>
        )}
        <div className="ml-auto text-right leading-tight">
          {/* o NOME DA CASA vem da configuração fiscal (bootstrap) — não do código */}
          <div className="font-bold">{boot?.company?.name || 'Mwana Lodge'}</div>
          <div className="text-sm">
            {agora.toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
            {' '}{agora.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>
    </div>
  );
}
