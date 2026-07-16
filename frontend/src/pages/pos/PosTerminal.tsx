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
import DayClose from './DayClose';
import CashClose from './CashClose';
import ReservationsPanel from './ReservationsPanel';
import DeliveriesPanel from './DeliveriesPanel';
import GroupTables from './GroupTables';
import { useProducao, ProductionWindow } from './ProductionBell';

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
  const [janela, setJanela] = useState<'' | 'SPLIT' | 'TRANSFER' | 'DOCS' | 'GUESTS' | 'MEALS' | 'CC' | 'RESERVAS' | 'ENTREGAS' | 'GRUPOS'>('');
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

  // (8088) INATIVIDADE: passado o tempo do parâmetro sem ninguém tocar no ecrã, a
  // sessão do operador termina sozinha — um terminal aberto e abandonado é um
  // terminal onde qualquer um vende em nome de outro. (8138 fecha mais tarde ainda.)
  useEffect(() => {
    if (!cfg?.session_timeout_minutes) return;
    let ultimo = Date.now();
    const mexeu = () => { ultimo = Date.now(); };
    window.addEventListener('pointerdown', mexeu);
    window.addEventListener('keydown', mexeu);
    const t = setInterval(() => {
      const min = (Date.now() - ultimo) / 60000;
      if (min >= (cfg.app_close_minutes || 120) || min >= cfg.session_timeout_minutes) {
        localStorage.removeItem('pos_operator_token');
        nav('/pos/login');
      }
    }, 30000);
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', mexeu);
      window.removeEventListener('keydown', mexeu);
    };
  }, [cfg?.session_timeout_minutes, cfg?.app_close_minutes]);

  // o resto do terminal (teclado tátil, painéis) lê a configuração daqui
  useEffect(() => {
    if (cfg) localStorage.setItem('pos_cfg', JSON.stringify(cfg));
  }, [cfg]);

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
      const s = lista[0];
      setSetor(s);
      // (8300) "Venda Direta" LIGADO: abre LOGO numa conta de balcão — sem mapa.
      // À risca: quem serve ao balcão não tem mesas para escolher.
      if (cfg.require_cash_open) setEtapa('CASH');
      else if (cfg.direct_sale) abrirVendaDireta(1, 'PASSANTE', s);
      else setEtapa('MAP');
    })();
  }, [cfg, setor]);

  const abrirVendaDireta = async (pax: number, tipo: string, s: any = setor) => {
    if (!s) return;
    try {
      const r = await apiClient.post('pos/tickets/', {
        outlet: s.outlet,
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

  // Ao FECHAR uma venda de balcão com o 8300 ligado, volta-se... ao balcão: o terminal
  // vive na venda (é o take-away). Uma conta fechada VAZIA anula-se — senão o fecho do
  // dia enchia-se de contas de 0,00 que ninguém vai cobrar.
  const fecharVenda = async (id: number) => {
    setTicket(null);
    try {
      const t = (await apiClient.get(`pos/tickets/${id}/`)).data;
      if (t.status === 'OPEN' && !(t.lines || []).length && !(t.payments || []).length) {
        await apiClient.post(`pos/tickets/${id}/void/`, { reason: 'Conta vazia fechada no balcão' });
      }
    } catch { /* a conta pode já estar paga/anulada */ }
    inval();
    if (cfg?.direct_sale && !cfg?.ask_sector) abrirVendaDireta(1, 'PASSANTE');
    else setEtapa('MAP');
  };

  const inval = () => qc.invalidateQueries();

  // (Parâmetro 8062) "Permitir fechar o dia no Front Office": abre a JANELA do fecho —
  // lista as contas que travam, e cada uma cobra-se ou anula-se ali mesmo.
  const [fechoAberto, setFechoAberto] = useState(false);
  const fecharDia = () => setFechoAberto(true);
  // FECHO DE CAIXA do operador: contagem (cega, 8005) + sangria/reforço.
  const [fechoCaixa, setFechoCaixa] = useState(false);
  // O SINO: a produção em tempo real do lado da sala (Iniciado/Concluído/Entregue).
  const { linhas: producao, prontos } = useProducao();
  const [verProducao, setVerProducao] = useState(false);

  const sair = () => {
    localStorage.removeItem('pos_operator_token');
    nav('/pos/login');
  };

  // Os MODOS do mapa (consultar/cobrar/parciais/transferir) ligam-se e desligam-se no
  // PRÓPRIO botão: primeiro toque acende (o botão muda de cor), segundo toque apaga e
  // volta-se a lançar pedidos. Nada de faixas por cima do mapa.
  const modoNormal = () => { setEscolher(''); setModoMapa('ORDER'); };
  const alternar = (modo: 'VIEW' | 'PAY', escolha: '' | 'SPLIT' | 'TRANSFER', ligado: boolean) => {
    if (ligado) return modoNormal();
    setEscolher(escolha); setModoMapa(modo); setEtapa('MAP');
  };
  const emConsulta = etapa === 'MAP' && modoMapa === 'VIEW';
  const emPagamentos = etapa === 'MAP' && modoMapa === 'PAY' && !escolher;
  const emParciais = etapa === 'MAP' && escolher === 'SPLIT';
  const emTransfer = etapa === 'MAP' && escolher === 'TRANSFER';

  // As opções da barra da esquerda. As que precisam de uma conta aberta ficam apagadas —
  // não se escondem: o empregado tem o sítio delas na memória e procurá-las-ia.
  const MENU: { label: string; icon: string; act: () => void; on?: boolean; ativo?: boolean }[] = [
    ...(cfg?.direct_sale
      ? [{ label: 'Venda Direta', icon: '🛒', act: vendaDireta, on: !!setor }]
      : []),
    // CONSULTA: toca-se na mesa e vê-se o talão — sem passar pela página de venda.
    { label: 'Consulta de Mesa', icon: '🖨', ativo: emConsulta,
      act: () => alternar('VIEW', '', emConsulta), on: !!sessao || !cfg?.require_cash_open },
    { label: 'Pagamentos', icon: '💰', ativo: emPagamentos,
      act: () => alternar('PAY', '', emPagamentos), on: !!sessao },
    // Parciais e transferências precisam de uma mesa COM conta: escolhe-se no mapa.
    { label: 'Funções Parciais', icon: '⑂', ativo: emParciais,
      act: () => alternar('PAY', 'SPLIT', emParciais), on: !!sessao },
    // (Parâmetro 8124) "Não permitir": o botão desaparece — a casa não transfere mesas.
    ...(cfg?.transfers !== 'Não permitir'
      ? [{ label: 'Transferências', icon: '⇄', ativo: emTransfer,
          act: () => alternar('PAY', 'TRANSFER', emTransfer), on: !!sessao }]
      : []),
    // RESERVAS de mesa (motor POSReservation) e ENTREGAS por destino (dispatch/deliver)
    { label: 'Reservas', icon: '📅', act: () => setJanela('RESERVAS'), on: !!setor },
    { label: 'Agrupar Mesas', icon: '⛓', act: () => setJanela('GRUPOS'), on: !!setor },
    { label: 'Entregas', icon: '🛎', act: () => setJanela('ENTREGAS'), on: true },
    { label: 'Documentos', icon: '🗎', act: () => setJanela('DOCS'), on: true },
    { label: 'Mapa de Refeições', icon: '🍸', act: () => setJanela('MEALS'), on: true },
    { label: 'Info.Hósp.', icon: '👤', act: () => setJanela('GUESTS'), on: true },
    { label: 'Setor', icon: '🖵', act: () => setEtapa('SECTOR'), on: true },
    { label: 'Contas Correntes', icon: '≣', act: () => setJanela('CC'), on: true },
    // FECHO DE CAIXA: o operador conta a gaveta e presta contas (8005 fecho cego).
    { label: 'Fecho de Caixa', icon: '🧮', act: () => setFechoCaixa(true), on: !!sessao },
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
          {/* O SINO DA PRODUÇÃO: pulsa quando há pratos PRONTOS no passe */}
          <button onClick={() => setVerProducao(true)}
            title="Produção (cozinha/bar/pastelaria) em tempo real"
            className={`relative w-[74px] h-[74px] m-2 rounded text-[30px] flex items-center justify-center
              ${prontos > 0 ? 'bg-[#1f7a34] animate-pulse' : 'bg-[#2a2a2a]'}`}>
            🔔
            {prontos > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[26px] h-[26px] px-1 rounded-full bg-[#c0140f]
                text-white text-[15px] font-bold flex items-center justify-center">{prontos}</span>
            )}
          </button>
          <span className="mr-4">{operador?.name || 'Operador'}</span>
          <button onClick={() => setEtapa('SECTOR')}
            className="w-[74px] h-[74px] m-2 rounded bg-[#3a3a3a] text-white text-[34px] flex items-center justify-center">
            ⚙
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ───── barra da esquerda ─────
            Na VENDA a barra desaparece: o balcão é teclado + comanda, a ecrã inteiro.
            As funções da barra são funções de SALA (consultar, cobrar, transferir) —
            dentro da venda não têm lugar, e o espaço delas é dos artigos. */}
        {/* botões de altura CONFORTÁVEL (dedo, não rato) e a lista ROLA — pedido do dono. */}
        {etapa !== 'SALES' && (
        <div className="w-[176px] bg-black flex flex-col flex-shrink-0 overflow-y-auto">
          {MENU.map((m) => (
            <button key={m.label} onClick={() => m.on !== false && m.act()}
              disabled={m.on === false}
              className={`h-[104px] flex-shrink-0 border-b border-[#2a2a2a] flex flex-col items-center justify-center gap-1
                text-white text-[15px] font-semibold leading-tight px-2 text-center
                disabled:text-white/25 disabled:hover:bg-transparent
                ${m.ativo ? 'bg-[#0f8b8d]' : 'hover:bg-[#1f1f1f]'}`}>
              <span className="text-[28px]">{m.icon}</span>
              {m.label}
            </button>
          ))}
          <button onClick={sair}
            className="h-[104px] flex-shrink-0 bg-[#c0140f] text-white flex flex-col items-center justify-center gap-1 font-bold text-[15px]">
            <span className="text-[28px]">✕</span> Sair
          </button>
        </div>
        )}

        {/* ───── o palco ───── */}
        <div className="flex-1 relative overflow-hidden"
          style={{
            // (8271) Imagem/cor de fundo do mapa: desligada, o palco fica neutro.
            background: etapa === 'SALES' ? '#2b2b2b'
              : (cfg?.map_background !== false ? (setor?.map_bg_color || '#c9c3c1') : '#c9c3c1'),
          }}>
          {etapa === 'MAP' && setor && (
            <>
              {/* SEM faixas por cima do mapa: o modo vê-se no botão aceso da barra. */}
              <TableMap setor={setor} modo={modoMapa}
                perguntarTipo={cfg?.ask_guest_type !== false}
                mostrarPagamento={!!cfg?.show_payment_status}
                fundo={cfg?.map_background !== false}
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
              onClose={() => fecharVenda(ticket)} />
          )}

          {/* O seletor de SETOR e a ABERTURA DE CAIXA são janelas por cima do palco:
              o empregado nunca perde de vista onde está. */}
          {etapa === 'SECTOR' && (
            <SectorPicker sectors={boot?.sectors}
              onPick={(s) => {
                setSetor(s);
                // "Exigir abertura de caixa": se estiver desligada, vai-se direto ao serviço.
                // Com a Venda Direta (8300) ligada, o serviço É o balcão — sem mapa.
                if (!sessao && cfg?.require_cash_open !== false) setEtapa('CASH');
                else if (cfg?.direct_sale) abrirVendaDireta(1, 'PASSANTE', s);
                else setEtapa('MAP');
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
          {janela === 'RESERVAS' && setor && (
            <ReservationsPanel setor={setor}
              onOpenTicket={(id) => { setTicket(id); setEtapa('SALES'); }}
              onClose={() => setJanela('')} />
          )}
          {janela === 'ENTREGAS' && <DeliveriesPanel onClose={() => setJanela('')} />}
          {janela === 'GRUPOS' && setor && (
            <GroupTables setor={setor}
              onOpenTicket={(id) => { setTicket(id); setEtapa('SALES'); }}
              onClose={() => setJanela('')} />
          )}

          {/* Consulta de Mesa: o talão de conferência (documento CM da AGT), sem venda. */}
          {aConsultar && (
            <TicketPreview ticket={aConsultar}
              onClose={() => { setAConsultar(null); setModoMapa('ORDER'); }} />
          )}

          {etapa === 'CASH' && setor && (
            <CashOpen setor={setor} operador={operador}
              onOpened={(s) => {
                setSessao(s);
                // (8300) caixa aberta e Venda Direta ligada -> direto ao balcão.
                if (cfg?.direct_sale) abrirVendaDireta(1, 'PASSANTE');
                else setEtapa('MAP');
              }}
              onBack={() => setEtapa('SECTOR')} />
          )}

          {/* A janela da produção — os três estados com os tempos calculados */}
          {verProducao && <ProductionWindow linhas={producao} onClose={() => setVerProducao(false)} />}

          {/* Fecho de Caixa do operador (contagem cega + sangria/reforço) */}
          {fechoCaixa && sessao && (
            <CashClose sessao={sessao}
              onClosed={() => { setFechoCaixa(false); setSessao(null); setTicket(null); setEtapa('CASH'); inval(); }}
              onClose={() => setFechoCaixa(false)} />
          )}

          {/* Fecho do Dia: as contas que travam cobram-se ou anulam-se AQUI. */}
          {fechoAberto && (
            <DayClose
              onClosed={() => { setFechoAberto(false); setSessao(null); setTicket(null); setEtapa('SECTOR'); inval(); }}
              onClose={() => setFechoAberto(false)} />
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
