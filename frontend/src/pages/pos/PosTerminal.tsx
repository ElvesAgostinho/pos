import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import SectorPicker from './SectorPicker';
import CashOpen from './CashOpen';
import TableMap from './TableMap';
import SalesScreen, { type TopoApi } from './SalesScreen';
import PayPanel from './PayPanel';
import MoveLines from './MoveLines';
import DocsPanel from './DocsPanel';
import ClientPicker from './ClientPicker';
// O painel antigo continua a servir o MAPA DE REFEIÇÕES (outra coisa: quem tem refeição
// incluída hoje). Só a "Info. Hóspede" mudou para o seletor das três abas.
import GuestsPanel from './GuestsPanel';
import EntitySearchPos from './EntitySearchPos';
import PinChange from './PinChange';
import TicketPreview from './TicketPreview';
import DayClose from './DayClose';
import CashClose from './CashClose';
import ReservationsPanel from './ReservationsPanel';
import DeliveriesPanel from './DeliveriesPanel';
import GroupTables from './GroupTables';
import SettingsPanel, { type AcaoPainel } from './SettingsPanel';
import { OpenTablesWindow, HardwareWindow, CashDetailWindow, SalesSummaryWindow } from './TerminalWindows';
import { useProducao, ProductionWindow } from './ProductionBell';
import {
  IcoLupa, IcoMaisMenos, IcoLapis, IcoCliente, IcoMesas, IcoVenda, IcoSino, IcoEngrenagem,
  IcoGaveta, IcoDocumento, IcoLista, IcoImpressora, IcoChave, IcoAtualizar, IcoEcra,
  IcoSangria, IcoCadeado, IcoDetalhe, IcoGrafico, IcoCruz, IcoAviso, IcoParciais, IcoDinheiro,
  IcoTransferir, IcoCalendario, IcoAgrupar, IcoEntrega, IcoCombo, IcoQuarto,
} from './Icons';
import { aviso } from '../../ui/dialogo';

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

/**
 * Um ícone da barra preta. Apagado quando não há linha escolhida — nunca escondido.
 * Relevo pesado, como as teclas: a barra é a mesma superfície do teclado, não uma
 * barra de navegação de página web.
 */
const IconeTopo = ({ icon, titulo, act, on = true, aceso = false }: {
  icon: any; titulo: string; act: () => void; on?: boolean; aceso?: boolean;
}) => (
  <button onClick={() => on && act()} disabled={!on} title={titulo}
    className={`w-[64px] h-[62px] m-1 rounded-[3px] text-white flex items-center justify-center
      border-2 border-black
      shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
      active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
      disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed
      ${aceso ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00]'
        : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]'}`}>
    {icon}
  </button>
);

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
  const [janela, setJanela] = useState<'' | 'SPLIT' | 'TRANSFER' | 'DOCS' | 'GUESTS' | 'MEALS' | 'CC' | 'RESERVAS' | 'ENTREGAS' | 'GRUPOS'
    | 'MESAS' | 'HARDWARE' | 'CXDETALHE' | 'RESUMO'>('');
  const [contaAtual, setContaAtual] = useState<any | null>(null);
  // Modo de escolha de mesa: para as parciais e as transferências é preciso saber QUAL.
  const [escolher, setEscolher] = useState<'' | 'SPLIT' | 'TRANSFER'>('');
  const [agora, setAgora] = useState(new Date());
  // O PAINEL DA ENGRENAGEM (Conta/Geral/Caixa). A aba fica GUARDADA entre aberturas:
  // quem está a fechar a caixa abre a engrenagem três vezes seguidas e quer a mesma aba.
  const [menu, setMenu] = useState(false);
  const [menuAba, setMenuAba] = useState('Geral');
  const [trocarPin, setTrocarPin] = useState(false);
  // A aba CONTA é da VENDA (é lá que estão a linha escolhida e a conta). A venda publica
  // aqui as suas funções — o painel é o mesmo, venha de onde vier.
  const [acoesConta, setAcoesConta] = useState<AcaoPainel[]>([]);
  const [topo, setTopo] = useState<TopoApi | null>(null);

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
      aviso(e?.response?.data?.detail || 'Não foi possível abrir a venda.');
    }
  };

  /**
   * VENDA DIRETA — a conta de balcão, sem mesa. Sem popup nenhum: quem toca no ícone da
   * venda quer vender JÁ. Perguntas são para as mesas.
   *
   * RETOMA a conta de balcão que já está aberta, em vez de abrir outra.
   *
   * Uma conta de balcão não tem mesa — logo não aparece no mapa. Como cada toque neste
   * ícone criava uma conta NOVA, quem lançava três cafés, tocava no ✔ e voltava ao
   * balcão caía numa conta vazia: os cafés continuavam lá, numa conta que já não tinha
   * como ser encontrada. Era o "não guarda a conta" — e as contas antigas iam-se
   * acumulando abertas, com dinheiro dentro, à espera do fecho do dia.
   *
   * Agora só se abre conta nova quando não há nenhuma de balcão por fechar.
   */
  const vendaDireta = async () => {
    if (!setor) return;
    try {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN,SUSPENDED' } });
      const abertas = (r.data?.results || r.data || []) as any[];
      // SÓ DESTA CAIXA. Retomar "a conta de balcão que está aberta" tem de querer dizer
      // a DESTE turno: contas de balcão esquecidas de ontem (ou de outro operador)
      // continuam abertas na base, e ao tocar em Venda Direta apareciam com o consumo
      // de outra pessoa lá dentro — o empregado começava a vender por cima da conta
      // alheia. A caixa aberta é a fronteira do turno; fora dela, começa-se do zero.
      // As antigas não se perdem: estão em Geral › Mesas Abertas, para cobrar ou anular.
      const balcao = abertas.find((t) => !t.table && t.outlet === setor.outlet
        && (t.status === 'OPEN' || t.status === 'SUSPENDED')
        && sessao?.id && t.cash_session === sessao.id);
      if (balcao) { setTicket(balcao.id); setEtapa('SALES'); return; }
    } catch { /* sem lista, abre-se uma nova — é o comportamento seguro */ }
    abrirVendaDireta(1, 'PASSANTE');
  };

  // Ao FECHAR uma venda de balcão com o 8300 ligado, volta-se... ao balcão: o terminal
  // vive na venda (é o take-away). Uma conta fechada VAZIA anula-se — senão o fecho do
  // dia enchia-se de contas de 0,00 que ninguém vai cobrar.
  /**
   * SAIR DA VENDA — e a regra da mesa ocupada.
   *
   * UMA MESA SÓ FICA OCUPADA SE TIVER CONSUMO.
   *
   *   conta COM artigos   -> fica aberta na mesa (vermelha). O empregado vai buscar as
   *                          bebidas, atende outra mesa, e volta a esta para continuar.
   *   conta VAZIA         -> fecha-se e a mesa fica LIVRE. Ao voltar lá, o terminal
   *                          pergunta outra vez quantos são e de que tipo.
   *
   * Sem isto, cada toque numa mesa deixava-a ocupada para sempre: o mapa enchia-se de
   * mesas vermelhas sem nada dentro, ninguém sabia quais eram reais, e o fecho do dia
   * ficava preso a contas de 0,00 que nunca ninguém ia cobrar. O mesmo vale depois de
   * anular a venda — se ficou vazia, a mesa volta a estar disponível.
   *
   * O que NÃO se toca: contas com artigos, com pagamentos ou com documento. Essas só
   * saem por pagamento ou por anulação com motivo.
   */
  const fecharVenda = async (id: number) => {
    setTicket(null);
    try {
      const t = (await apiClient.get(`pos/tickets/${id}/`)).data;
      const temConsumo = ((t.lines || []) as any[]).some((l) => !l.is_void);
      const temDinheiro = ((t.payments || []) as any[]).length > 0;
      if (t.status === 'OPEN' && !temConsumo && !temDinheiro) {
        await apiClient.post(`pos/tickets/${id}/void/`, {
          reason: 'Conta fechada sem consumo — mesa libertada',
        });
      }
    } catch { /* a conta pode já estar paga ou anulada: nada a fazer */ }
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
  const MENU: { label: string; icon: any; act: () => void; on?: boolean; ativo?: boolean }[] = [
    ...(cfg?.direct_sale
      ? [{ label: 'Venda Direta', icon: <IcoVenda size={28} />, act: vendaDireta, on: !!setor }]
      : []),
    // CONSULTA: toca-se na mesa e vê-se o talão — sem passar pela página de venda.
    { label: 'Consulta de Mesa', icon: <IcoImpressora size={28} />, ativo: emConsulta,
      act: () => alternar('VIEW', '', emConsulta), on: !!sessao || !cfg?.require_cash_open },
    { label: 'Pagamentos', icon: <IcoDinheiro size={28} />, ativo: emPagamentos,
      act: () => alternar('PAY', '', emPagamentos), on: !!sessao },
    // Parciais e transferências precisam de uma mesa COM conta: escolhe-se no mapa.
    { label: 'Funções Parciais', icon: <IcoParciais size={28} />, ativo: emParciais,
      act: () => alternar('PAY', 'SPLIT', emParciais), on: !!sessao },
    // (Parâmetro 8124) "Não permitir": o botão desaparece — a casa não transfere mesas.
    ...(cfg?.transfers !== 'Não permitir'
      ? [{ label: 'Transferências', icon: <IcoTransferir size={28} />, ativo: emTransfer,
          act: () => alternar('PAY', 'TRANSFER', emTransfer), on: !!sessao }]
      : []),
    // RESERVAS de mesa (motor POSReservation) e ENTREGAS por destino (dispatch/deliver)
    { label: 'Reservas', icon: <IcoCalendario size={28} />, act: () => setJanela('RESERVAS'), on: !!setor },
    { label: 'Agrupar Mesas', icon: <IcoAgrupar size={28} />, act: () => setJanela('GRUPOS'), on: !!setor },
    { label: 'Entregas', icon: <IcoEntrega size={28} />, act: () => setJanela('ENTREGAS'), on: true },
    { label: 'Documentos', icon: <IcoDocumento size={40} />, act: () => setJanela('DOCS'), on: true },
    { label: 'Mapa de Refeições', icon: <IcoCombo size={28} />, act: () => setJanela('MEALS'), on: true },
    { label: 'Info.Hósp.', icon: <IcoQuarto size={28} />, act: () => setJanela('GUESTS'), on: true },
    { label: 'Setor', icon: <IcoEcra size={28} />, act: () => setEtapa('SECTOR'), on: true },
    { label: 'Contas Correntes', icon: <IcoLista size={40} />, act: () => setJanela('CC'), on: true },
    // FECHO DE CAIXA: o operador conta a gaveta e presta contas (8005 fecho cego).
    { label: 'Fecho de Caixa', icon: <IcoCadeado size={40} />, act: () => setFechoCaixa(true), on: !!sessao },
    // (Parâmetro 8062) o fecho do dia só aparece se o backoffice o permitir aqui.
    ...(cfg?.allow_day_close
      ? [{ label: 'Fecho do Dia', icon: <IcoCadeado size={28} />, act: fecharDia, on: true }]
      : []),
  ];

  // ─── O PAINEL DA ENGRENAGEM ────────────────────────────────────────────────
  // Estas duas abas são do TERMINAL e do DINHEIRO — valem com ou sem conta aberta,
  // por isso vivem aqui e são emprestadas à venda (a aba "Conta" é que é de lá).
  const fecharMenu = () => setMenu(false);
  const abrirJanela = (j: typeof janela) => { setJanela(j); fecharMenu(); };

  // ABRIR GAVETA sem venda: o troco que se acerta, a nota que se troca. Entra na MESMA
  // fila das comandas (PrintJob) — a gaveta abre pelo impulso da impressora, e fica
  // registado quem a abriu fora de um pagamento. Uma gaveta que abre sem rasto é
  // exatamente o buraco por onde o dinheiro desaparece.
  const abrirGaveta = async () => {
    try {
      const r = await apiClient.post('pos/terminal/open-drawer/', {
        outlet: setor?.outlet ?? null,
        operator: operador?.name || 'Operador',
        reference: sessao ? `CX-${sessao.id}` : null,
      });
      fecharMenu();
      // DIZER POR ONDE FOI. Uma gaveta que não abre pode ser cabo, impressora ou
      // configuração — sem saber por que aparelho o pulso saiu, não há por onde começar.
      aviso(r.data?.detail || 'Gaveta aberta.', 'Gaveta');
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível abrir a gaveta.', 'Gaveta');
    }
  };


  const acoesGeral: AcaoPainel[] = [
    { label: 'Abrir Gaveta', icon: <IcoGaveta size={40} />, act: abrirGaveta, on: !!sessao,
      why: 'Sem caixa aberta não há gaveta para abrir.' },
    { label: 'Documentos', icon: <IcoDocumento size={40} />, act: () => abrirJanela('DOCS'), on: true },
    { label: 'Contas Correntes', icon: <IcoLista size={40} />, act: () => abrirJanela('CC'), on: true },
    { label: 'Mesas Abertas', icon: <IcoMesas size={30} />, act: () => abrirJanela('MESAS'), on: true },
    { label: 'Impressoras', icon: <IcoImpressora size={40} />, act: () => abrirJanela('HARDWARE'), on: true },
    { label: 'Alterar password', icon: <IcoChave size={40} />, act: () => { setTrocarPin(true); fecharMenu(); }, on: true },
    // ATUALIZAR: outro terminal mexeu na mesa e este ainda mostra o antigo.
    { label: 'Atualizar', icon: <IcoAtualizar size={40} />, act: () => { inval(); fecharMenu(); }, on: true },
    { label: 'Trocar de Setor', icon: <IcoEcra size={40} />, act: () => { setEtapa('SECTOR'); fecharMenu(); }, on: true },
  ];

  const acoesCaixa: AcaoPainel[] = [
    // CASH PICKUP (sangria): o dinheiro a mais sai da gaveta e vai para o cofre. É o
    // mesmo fecho, em modo sangria — não é um segundo motor a mexer no mesmo dinheiro.
    { label: 'Cash Pickup', icon: <IcoSangria size={40} />, act: () => { setFechoCaixa(true); fecharMenu(); }, on: !!sessao,
      why: 'Sem caixa aberta não há dinheiro a levantar.' },
    { label: 'Fecho da Caixa', icon: <IcoCadeado size={40} />, act: () => { setFechoCaixa(true); fecharMenu(); }, on: !!sessao,
      why: 'A caixa já está fechada.' },
    { label: 'Reimprimir', icon: <IcoImpressora size={40} />, act: () => abrirJanela('DOCS'), on: true },
    { label: 'Detalhe da Caixa', icon: <IcoDetalhe size={40} />, act: () => abrirJanela('CXDETALHE'), on: !!sessao,
      why: 'Sem caixa aberta não há detalhe para mostrar.' },
    { label: 'Resumo de vendas', icon: <IcoGrafico size={40} />, act: () => abrirJanela('RESUMO'), on: true },
    ...(cfg?.allow_day_close
      ? [{ label: 'Fecho do Dia', icon: <IcoCadeado size={40} />, act: () => { fecharDia(); fecharMenu(); }, on: true }]
      : []),
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-[#1a1a1a] select-none overflow-hidden">
      {/* ───── barra de cima: as duas vistas (mesas / venda) e a engrenagem ───── */}
      <div className="h-[76px] bg-black flex items-stretch flex-shrink-0">
        <div className="w-[112px] flex items-center justify-center">
          <span className="text-[26px] font-black text-white tracking-tight">
            ML<span className="text-[#c9a400]">.</span>
          </span>
        </div>

        <button onClick={() => setEtapa('MAP')} disabled={!sessao} title="Mapa de mesas"
          className={`w-[86px] m-1 rounded-[3px] flex items-center justify-center border-2 border-black
            shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
            active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] disabled:opacity-30 disabled:shadow-none
            ${etapa === 'MAP' ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white'
              : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424] text-white/80'}`}>
          <IcoMesas size={30} />
        </button>
        {/* O ícone da VENDA: com uma conta aberta, mostra-a; SEM conta, abre a VENDA
            DIRETA (a conta de balcão, sem mesa). É assim no original — o balcão não
            escolhe mesa nenhuma, toca aqui e vende. */}
        <button
          onClick={() => (ticket ? setEtapa('SALES') : vendaDireta())}
          disabled={!setor}
          title={ticket ? 'Voltar à venda' : 'Venda Direta (sem mesa)'}
          className={`w-[86px] m-1 rounded-[3px] flex items-center justify-center border-2 border-black
            shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
            active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)] disabled:opacity-30 disabled:shadow-none
            ${etapa === 'SALES' ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white'
              : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424] text-white/80'}`}>
          <IcoVenda size={30} />
        </button>

        <div className="flex-1" />

        {/* ───── OS QUATRO ÍCONES DA VENDA ─────
            Vivem aqui, na barra preta, como no original — e não espalhados dentro da
            comanda. Só aparecem DENTRO da venda: fora dela não há linha escolhida nem
            conta em que actuar, e um ícone que não faz nada ensina o empregado a não
            confiar no ecrã. Quem os executa é o SalesScreen (publica-os para aqui). */}
        {etapa === 'SALES' && topo && (
          <div className="flex items-center">
            <IconeTopo icon={<IcoLupa size={26} />} titulo="Pesquisar artigos" act={topo.procurar} />
            <IconeTopo icon={<IcoMaisMenos size={26} />} titulo={topo.temSel
              ? 'Alterar a quantidade da linha escolhida'
              : 'Escolha primeiro uma linha da comanda (um toque)'}
              act={topo.quantidade} on={topo.temSel} />
            <IconeTopo icon={<IcoLapis size={26} />} titulo={topo.temSel
              ? 'Mensagens para a produção'
              : 'Escolha primeiro uma linha da comanda (um toque)'}
              act={topo.mensagens} on={topo.temSel} />
            {/* ONDE ESTOU + QUEM PAGA, no mesmo botão: a mesa por cima (é o que o
                empregado confirma antes de lançar) e o cliente por baixo. Estava numa
                faixa própria dentro da venda a gastar uma linha inteira do teclado. */}
            <button onClick={topo.cliente}
              title="Quem leva a fatura (Entidade · Quarto · Eventos)"
              className="h-[62px] min-w-[150px] px-3 m-1 rounded-[3px] border-2 border-black
                bg-gradient-to-b from-[#4a4a4a] to-[#242424]
                shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
                active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
                flex flex-col items-center justify-center gap-1 leading-tight">
              <span className="text-[#f0c000] text-[11px] font-bold max-w-[150px] truncate">
                {topo.onde}
              </span>
              <span className="flex items-center gap-2 text-white">
                <IcoCliente size={20} />
                <span className="text-[11px] max-w-[110px] truncate">
                  {topo.cliente_atual || 'Consumidor Final'}
                </span>
              </span>
            </button>
          </div>
        )}

        <div className="flex items-center pr-3 text-white/80 text-sm">
          {/* O SINO DA PRODUÇÃO: pulsa quando há pratos PRONTOS no passe */}
          <button onClick={() => setVerProducao(true)}
            title="Produção (cozinha/bar/pastelaria) em tempo real"
            className={`relative w-[64px] h-[62px] m-1 rounded-[3px] text-white flex items-center
              justify-center border-2 border-black
              shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
              ${prontos > 0 ? 'bg-gradient-to-b from-[#2b9c48] to-[#125c26] animate-pulse'
                : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]'}`}>
            <IcoSino size={26} />
            {prontos > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[26px] h-[26px] px-1 rounded-full bg-[#c0140f]
                text-white text-[15px] font-bold flex items-center justify-center border border-black">{prontos}</span>
            )}
          </button>
          <span className="mr-2 ml-1 text-[13px]">{operador?.name || 'Operador'}</span>
          {/* A ENGRENAGEM abre o PAINEL (Conta/Geral/Caixa) por cima do teclado, com a
              comanda à vista. Saltava para o seletor de setor — trocar de setor faz-se
              uma vez ao início do turno, e continua lá dentro, na aba Geral. */}
          <button onClick={() => setMenu((v) => !v)}
            title="Funções do terminal (Conta · Geral · Caixa)"
            className={`w-[64px] h-[62px] m-1 rounded-[3px] text-white flex items-center justify-center
              border-2 border-black
              shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.55)]
              active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
              ${menu ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00]'
                : 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]'}`}>
            <IcoEngrenagem size={26} />
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
              <span>{m.icon}</span>
              {m.label}
            </button>
          ))}
          <button onClick={sair}
            className="h-[104px] flex-shrink-0 text-white flex flex-col items-center justify-center gap-1
              font-bold text-[15px] border-y-2 border-black
              bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]
              shadow-[inset_0_2px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.5)]
              active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
            <IcoCruz size={30} /> Sair
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

                onPayTicket={(t) => {
                  if (escolher) { setContaAtual(t); setJanela(escolher); setEscolher(''); setModoMapa('ORDER'); }
                  else setACobrar(t);
                }} />

            </>
          )}
          {etapa === 'SALES' && ticket && (
            /*
             * A CHAVE (key) É O QUE FAZ ISTO FUNCIONAR.
             *
             * A venda guarda o número da conta em estado próprio (useState), e o
             * useState só olha para o valor inicial. Sem a chave, React reaproveitava o
             * MESMO ecrã ao mudar de mesa: abria-se a mesa 2 e a venda continuava
             * agarrada à conta da mesa 1. Tudo o que se fizesse a seguir ia para a
             * conta errada — os artigos lançavam-se na mesa 1, a consulta e o pagamento
             * batiam numa conta já paga, e a mesa 2 ficava vazia como se nada tivesse
             * sido guardado. Era este o "não vende, não guarda, não consulta".
             *
             * Com a chave, cada conta tem o seu ecrã: entra limpo e sai com ela.
             */
            <SalesScreen key={ticket} ticketId={ticket} setor={setor} cfg={cfg}
              publicarAcoes={setAcoesConta} publicarTopo={setTopo}
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
          {/* INFO. HÓSPEDE — o MESMO seletor que abre sozinho no balcão (Entidade ·
              Quarto · Eventos), aberto na aba do Quarto. Havia aqui um painel diferente
              a mostrar a mesma informação: duas listas de hóspedes, com colunas
              diferentes, e o empregado a aprender as duas. */}
          {janela === 'GUESTS' && (
            <ClientPicker titulo="Info. Hóspede" abaInicial="QUARTO" podeSaltar={false}
              onPick={() => setJanela('')} onClose={() => setJanela('')} />
          )}
          {janela === 'MEALS' && <GuestsPanel aba="MEALS" onClose={() => setJanela('')} />}
          {janela === 'CC' && <EntitySearchPos onClose={() => setJanela('')} />}
          {janela === 'RESERVAS' && setor && (
            <ReservationsPanel setor={setor}
              onOpenTicket={(id) => { setTicket(id); setEtapa('SALES'); }}
              onClose={() => setJanela('')} />
          )}
          {janela === 'ENTREGAS' && <DeliveriesPanel onClose={() => setJanela('')} />}
          {/* as janelas do painel da engrenagem */}
          {janela === 'MESAS' && (
            <OpenTablesWindow onClose={() => setJanela('')}
              onAbrir={(id) => { setJanela(''); setTicket(id); setEtapa('SALES'); }} />
          )}
          {janela === 'HARDWARE' && (
            <HardwareWindow outlet={setor?.outlet} onClose={() => setJanela('')} />
          )}
          {janela === 'CXDETALHE' && sessao && (
            <CashDetailWindow sessao={sessao} onClose={() => setJanela('')} />
          )}
          {janela === 'RESUMO' && <SalesSummaryWindow onClose={() => setJanela('')} />}
          {janela === 'GRUPOS' && setor && (
            <GroupTables setor={setor}
              onOpenTicket={(id) => { setTicket(id); setEtapa('SALES'); }}
              onClose={() => setJanela('')} />
          )}

          {/* ───── O PAINEL DA ENGRENAGEM ─────
              Dentro da VENDA deixa os 520px da comanda à vista: mexe-se no preço e vê-se
              o total a mudar. Fora da venda ocupa o palco todo. */}
          {menu && (
            <SettingsPanel
              aba={menuAba} onAba={setMenuAba} onClose={() => setMenu(false)}
              direita={etapa === 'SALES' ? 520 : 0}
              flutuante={etapa !== 'SALES'}
              abas={[
                // FORA DA VENDA não existe aba "Conta" — não há conta nenhuma em que
                // mexer. Mostrá-la vazia era prometer funções que não estão lá.
                ...(etapa === 'SALES'
                  ? [{ nome: 'Conta', titulo: 'Conta', acoes: acoesConta }]
                  : []),
                { nome: 'Geral', titulo: 'Geral', acoes: acoesGeral },
                { nome: 'Caixa', titulo: sessao ? 'Caixa Aberta' : 'Caixa', acoes: acoesCaixa },
              ]} />
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
          {/* Troca VOLUNTÁRIA da password (Geral › Alterar password) — o mesmo ecrã
              da troca obrigatória, para não haver dois sítios a mudar a mesma coisa. */}
          {trocarPin && !pinObrigatorio && (
            <PinChange operador={operador} onDone={() => setTrocarPin(false)} />
          )}
        </div>
      </div>

      {/* ───── barra de baixo: onde estou, e que horas são ───── */}
      <div className="h-[58px] bg-black text-white flex items-center px-3 flex-shrink-0">
        <span className="text-[#e0a020] mr-3"><IcoAviso size={28} /></span>
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
