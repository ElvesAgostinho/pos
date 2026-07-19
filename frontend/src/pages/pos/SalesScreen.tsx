import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { comPerguntas } from '../posPrompt';
import EntityPicker from './EntityPicker';
import PayPanel from './PayPanel';
import SubcontaBar from './SubcontaBar';
import ArticleSearch from './ArticleSearch';
import GuestsPanel from './GuestsPanel';
import DocsPanel from './DocsPanel';
import TicketPreview from './TicketPreview';
import GuestPick from './GuestPick';
import CustomerForm from './CustomerForm';
// SEM este import, o <Window> das janelas em baixo resolvia para o Window DO BROWSER
// (o DOM global) — React fazia `new Window()` e rebentava com "Illegal constructor".
import Window from './Window';
import type { AcaoPainel } from './SettingsPanel';
import MoveLines from './MoveLines';
import VoidReasonDialog from './VoidReasonDialog';
import NumPad from './NumPad';
import MessagesPanel from './MessagesPanel';
import ClientPicker from './ClientPicker';

/**
 * A VENDA — o teclado e a comanda, lado a lado.
 *
 * O TECLADO é o que foi configurado (páginas, pastas, cores, colunas, códigos, preços,
 * nível de preço). Não é uma lista de artigos inventada aqui: é o mapa que o dono montou,
 * e é o mapa que o empregado tem na cabeça.
 *
 * A COMANDA à direita é a conta a nascer. A QUANTIDADE (1,2,3,4…) aplica-se à próxima
 * tecla que se tocar — é assim que se lançam "três cafés" com dois toques em vez de seis.
 *
 * As caixas do artigo mandam aqui: preço manual, "pergunta sempre a quantidade", balança,
 * texto livre. O servidor diz o que falta; o terminal pergunta (ver posPrompt.ts). As
 * regras vivem num sítio só.
 */
export type TopoApi = {
  procurar: () => void;
  quantidade: () => void;
  mensagens: () => void;
  cliente: () => void;
  temSel: boolean;
  cliente_atual: string | null;
};

export default function SalesScreen({ ticketId, setor, cfg, publicarAcoes, publicarTopo, onClose }: {
  ticketId: number; setor: any; cfg?: any; onClose: () => void;
  /** a venda entrega as suas funções ao painel da engrenagem (aba "Conta") */
  publicarAcoes?: (acoes: AcaoPainel[]) => void;
  /** …e aos quatro ícones da barra preta do terminal */
  publicarTopo?: (api: TopoApi) => void;
}) {
  const qc = useQueryClient();
  // A subconta ATIVA: numa mesa com várias pessoas, o carrossel troca-a sem sair da venda.
  const [tid, setTid] = useState(ticketId);
  const [caminho, setCaminho] = useState<any[]>([]);
  const [qtd, setQtd] = useState(1);
  const [entidade, setEntidade] = useState<any | null>(null);
  const [escolherEntidade, setEscolherEntidade] = useState(false);
  const [pagar, setPagar] = useState(false);
  const [procurar, setProcurar] = useState(false);   // consulta de artigo (catálogo inteiro)
  // A VENDA CONSULTA TUDO sem sair: artigos, hóspedes e documentos — os mesmos
  // painéis do backoffice, abertos por cima do teclado (a "junção").
  const [painel, setPainel] = useState<'' | 'GUESTS' | 'DOCS'>('');
  const [verTalao, setVerTalao] = useState(false);   // Consulta de Mesa desta conta
  // O FORMULÁRIO DO CLIENTE reage ao TIPO da conta (parâmetro 8175):
  // HOTEL pede o hóspede do PMS; INTERNO pede o colaborador (RH); PASSANTE é opcional.
  const [formCliente, setFormCliente] = useState(false);
  const [pedirHospede, setPedirHospede] = useState(false);
  const [verCombos, setVerCombos] = useState(false);     // combos do Commercial
  const [verHistorico, setVerHistorico] = useState(false); // auditoria da conta
  const [verDestinos, setVerDestinos] = useState(false);  // Quarto/Piscina/Praia…
  const [jaPediu, setJaPediu] = useState<number[]>([]);   // 1 pergunta por conta, não em loop
  // A LINHA ESCOLHIDA. As funções da aba "Conta" (preço, quantidade, desconto do artigo,
  // mensagem) atuam sobre ELA: sem uma linha escolhida, "alterar preço" não sabe de quê.
  const [sel, setSel] = useState<number | null>(null);
  // (Parâmetros do teclado) o que as teclas mostram — alterna-se aqui, no painel, sem
  // ir ao backoffice: o preço à vista é uma preferência de quem está a servir.
  const [verPrecos, setVerPrecos] = useState(true);
  const [agrupar, setAgrupar] = useState(false);
  // Parciais e transferências DESTA conta, sem voltar ao mapa.
  const [mover, setMover] = useState<'' | 'SPLIT' | 'TRANSFER'>('');
  // As janelas dos quatro ícones do topo e do botão de anular.
  const [anular, setAnular] = useState(false);          // motivo de anulação
  const [editarQtd, setEditarQtd] = useState(false);    // teclado numérico (+/−)
  const [verMensagens, setVerMensagens] = useState(false);
  const [escolherCliente, setEscolherCliente] = useState(false);
  // Só se pergunta UMA vez por conta quem é o cliente — senão o ecrã reabria a cada
  // refrescamento e o empregado não conseguia lançar nada.
  const perguntouCliente = useRef<number | null>(null);

  // O teclado pede-se COM o operador: a caixa "Usa preço de custo" da ficha dele
  // muda os preços que as teclas mostram (staff/consumo interno vê o custo).
  const operId = (() => {
    try { return JSON.parse(localStorage.getItem('pos_operator') || '{}')?.id; } catch { return undefined; }
  })();
  const { data: teclado } = useQuery({
    queryKey: ['pos-keypad', operId, setor?.id],
    queryFn: async () => (await apiClient.get('pos/terminal/keyboard/', {
      // o SETOR escolhe o teclado (parâmetro 8176) e o NÍVEL DE PREÇO dele
      params: { ...(operId ? { operator: operId } : {}), ...(setor?.id ? { sector: setor.id } : {}) },
    })).data,
  });
  const { data: conta } = useQuery({
    queryKey: ["pos-ticket", tid],
    queryFn: async () => (await apiClient.get(`pos/tickets/${tid}/`)).data,
    refetchInterval: 5000,
  });

  const inval = () => {
    qc.invalidateQueries({ queryKey: ["pos-ticket", tid] });
    qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
  };

  const kb = teclado?.keyboard;
  const nivel: any[] = caminho.length
    ? (caminho[caminho.length - 1].children || [])
    : (teclado?.pages || []);

  // O TECLADO ABRE-SE SOZINHO: ao entrar na venda, a primeira página já está aberta
  // com as teclas à vista — no balcão não se toca duas vezes para começar a vender.
  useEffect(() => {
    if (!caminho.length && teclado?.pages?.length) setCaminho([teclado.pages[0]]);
  }, [teclado]);

  // AO ABRIR a conta, o tipo manda: HÓSPEDE sem nome -> lista do PMS; CONSUMO INTERNO
  // sem nome -> lista de colaboradores (RH do backoffice). O passante não é incomodado.
  useEffect(() => {
    if (!conta || conta.customer_name || jaPediu.includes(conta.id)) return;
    if (conta.guest_type === 'HOTEL') { setPedirHospede(true); setJaPediu([...jaPediu, conta.id]); }
    else if (conta.guest_type === 'INTERNO') { setFormCliente(true); setJaPediu([...jaPediu, conta.id]); }
  }, [conta?.id, conta?.guest_type, conta?.customer_name]);

  const lancar = async (k: any) => {
    if (k.available === false) return;
    try {
      await comPerguntas(`pos/tickets/${tid}/add_line/`,
        // o OPERADOR segue no pedido: as caixas da ficha dele (preço de custo,
        // consumo interno) decidem o preço e a autorização — no servidor.
        { item: k.item, quantity: qtd, operator: operId },
        async (label, detalhe) => window.prompt(`${detalhe}\n\n${label}:`));
      setQtd(1);
      // (Parâmetro 8308) "Enviar para a cozinha automaticamente": cada artigo lançado
      // segue LOGO para a produção — não fica à espera do botão. É o modo dos bares
      // rápidos, onde o pedido não se acumula.
      if (cfg?.auto_fire_kitchen) {
        try { await apiClient.post(`pos/tickets/${tid}/fire_kitchen/`, {}); } catch { /* sem produção configurada */ }
      }
      inval();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível lançar o artigo.');
    }
  };

  const tocar = (k: any) => {
    if (k.kind === 'ITEM' && k.item) return lancar(k);
    setCaminho([...caminho, k]);
  };

  // NOTA PARA A COZINHA ("sem cebola", "bem passado") — um toque na linha. As
  // MENSAGENS DE PRODUÇÃO do backoffice aparecem numeradas; ou escreve-se livre.
  const notaLinha = async (l: any) => {
    try {
      // sem o módulo de Produção licenciado, não há mensagens pré-definidas —
      // a nota escreve-se livre na mesma (o motor da linha aceita texto).
      let msgs: any[] = [];
      try {
        const r = await apiClient.get('pos/config/kitchen-messages/');
        msgs = ((r.data?.results || r.data || []) as any[]).filter((m) => m.is_active !== false);
      } catch { /* módulo ausente: segue com texto livre */ }
      const lista = msgs.map((m, i) => `${i + 1}. ${m.name}`).join('\n');
      const escolha = window.prompt(
        `NOTA PARA A COZINHA — ${l.description}\n\n${lista || '(sem mensagens configuradas)'}\n\n` +
        'Escreva o Nº da mensagem, ou texto livre:', l.note || '');
      if (escolha === null) return;
      const n = Number(escolha.trim());
      const nota = (Number.isInteger(n) && n >= 1 && n <= msgs.length) ? msgs[n - 1].name : escolha.trim();
      await apiClient.patch(`pos/ticket-lines/${l.id}/`, { note: nota || null });
      inval();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível gravar a nota.'); }
  };

  const apagarLinha = async (l: any) => {
    const emProducao = ['FIRED', 'PREPARING', 'READY'].includes(l.kds_status);
    let motivo: string | null = null;
    if (emProducao) {
      motivo = window.prompt(
        `"${l.description}" já foi para a produção.\n\nAnular obriga a um motivo (a cozinha é avisada e fica registado).\n\nMotivo:`);
      if (!motivo) return;
    }
    try {
      await apiClient.delete(`pos/ticket-lines/${l.id}/`,
        { params: motivo ? { reason: motivo } : undefined });
      inval();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao anular.'); }
  };

  // DESCONTO — os códigos do backoffice primeiro (validade + grupos autorizados no
  // servidor); sem código, manual em % (acima do 8620, o servidor exige supervisor).
  const aplicarDesconto = async () => {
    try {
      const r = await apiClient.get('pos/config/discounts/');
      const codigos = ((r.data?.results || r.data || []) as any[])
        .filter((d) => d.is_active !== false && d.for_pos !== false);
      const lista = codigos.map((d, i) => `${i + 1}. ${d.code} — ${d.name} (${Number(d.value)}${d.base === 'PERCENT' ? '%' : ' Kz'})`).join('\n');
      const escolha = window.prompt(
        `DESCONTO DA CONTA\n\n${lista || '(sem descontos configurados)'}\n\n` +
        'Escreva o Nº do desconto, ou uma percentagem (ex.: 10):');
      if (!escolha) return;
      const n = Number(escolha.trim());
      // um número pequeno dentro da lista = escolher o CÓDIGO; senão é percentagem manual
      const body: any = (Number.isInteger(n) && n >= 1 && n <= codigos.length && !escolha.includes('%'))
        ? { discount: codigos[n - 1].id }
        : { percent: escolha.replace('%', '').trim() };
      try {
        await apiClient.post(`pos/tickets/${tid}/set_discount/`, body);
      } catch (e: any) {
        if (e?.response?.data?.requires_supervisor) {
          const sup = window.prompt(e.response.data.detail + '\n\nNome do supervisor que autoriza:');
          if (!sup) return;
          await apiClient.post(`pos/tickets/${tid}/set_discount/`, { ...body, authorized_by: sup });
        } else { throw e; }
      }
      inval();
    } catch (e: any) {
      alert(e?.response?.data?.detail || 'Não foi possível aplicar o desconto.');
    }
  };

  // ─── as funções da aba "Conta" do painel da engrenagem ────────────────────
  // Todas mexem na LINHA ESCOLHIDA e todas passam pelo SERVIDOR: o total é dele, não
  // deste ecrã. Um terminal que soma sozinho é um terminal que discorda da fatura.
  const linhaSel = () => (conta?.lines || []).find((l: any) => l.id === sel);

  const patchLinha = async (campos: any, erro: string) => {
    const l = linhaSel();
    if (!l) return;
    try {
      await apiClient.patch(`pos/ticket-lines/${l.id}/`, campos);
      inval();
    } catch (e: any) { alert(e?.response?.data?.detail || erro); }
  };

  // PREÇO manual: o servidor recusa se o artigo não permitir (caixa da ficha) ou se o
  // valor descer abaixo do que o operador pode dar — não é aqui que isso se decide.
  const alterarPreco = async () => {
    const l = linhaSel();
    if (!l) return;
    const v = window.prompt(`PREÇO — ${l.description}\n\nPreço atual: ${money(l.unit_price)}\n\nNovo preço:`,
      String(Number(l.unit_price)));
    if (v === null || !v.trim()) return;
    await patchLinha({ unit_price: v.replace(',', '.').trim() },
      'Não foi possível alterar o preço (o artigo pode não permitir preço manual).');
  };

  const alterarQtd = async () => {
    const l = linhaSel();
    if (!l) return;
    const v = window.prompt(`QUANTIDADE — ${l.description}\n\nQuantidade atual: ${Number(l.quantity)}\n\nNova quantidade:`,
      String(Number(l.quantity)));
    if (v === null || !v.trim()) return;
    const n = Number(v.replace(',', '.').trim());
    if (!(n > 0)) return alert('A quantidade tem de ser maior que zero. Para tirar o artigo, anule a linha.');
    await patchLinha({ quantity: n }, 'Não foi possível alterar a quantidade.');
  };

  const descontoLinha = async () => {
    const l = linhaSel();
    if (!l) return;
    const v = window.prompt(`DESCONTO DO ARTIGO — ${l.description}\n\nPercentagem (0 tira o desconto):`,
      String(Number(l.discount_percent || 0)));
    if (v === null) return;
    await patchLinha({ discount_percent: v.replace('%', '').replace(',', '.').trim() || 0 },
      'Não foi possível aplicar o desconto ao artigo.');
  };

  // NÚMERO DE CLIENTES — o divisor do gasto por pessoa. Corrige-se quando chega mais
  // gente à mesa; sem isto o indicador do restaurante fica errado o serviço todo.
  const numeroClientes = async () => {
    const v = window.prompt(`NÚMERO DE CLIENTES\n\nQuantos estão à mesa?`, String(conta?.guests || 1));
    if (v === null) return;
    const n = Number(v.trim());
    if (!(n > 0)) return alert('O número de clientes tem de ser maior que zero.');
    try {
      await apiClient.patch(`pos/tickets/${tid}/`, { guests: n });
      inval();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível gravar.'); }
  };

  // ANULAR TUDO — a conta inteira. Obriga a motivo (fica na auditoria) e liberta a mesa.
  const anularConta = async () => {
    const motivo = window.prompt(
      `ANULAR a conta ${conta?.ticket_number || ''}?\n\nA mesa fica livre e a anulação fica na auditoria.\n\nMotivo:`);
    if (!motivo) return;
    try {
      await apiClient.post(`pos/tickets/${tid}/void/`, { reason: motivo });
      inval();
      onClose();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível anular.'); }
  };

  // SUSPENDER a conta (o grupo que sai e volta) — retoma-se tocando na mesa.
  const suspender = async () => {
    try {
      await apiClient.post(`pos/tickets/${tid}/suspend/`, {});
      inval();
      onClose();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível suspender.'); }
  };

  const enviarCozinha = async () => {
    try {
      const r = await apiClient.post(`pos/tickets/${tid}/fire_kitchen/`, {});
      if (r.data?.print_warnings?.length) alert(r.data.print_warnings.join('\n'));
      inval();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao enviar para a cozinha.'); }
  };

  const linhas: any[] = conta?.lines || [];
  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

  // A VENDA ENTREGA AS SUAS FUNÇÕES ao painel da engrenagem. O painel é chrome; quem
  // sabe mexer na conta é este ecrã — e é aqui que as funções ficam.
  const temSel = sel != null && linhas.some((l) => l.id === sel);
  const semLinha = 'Escolha primeiro uma linha da comanda (um toque).';
  useEffect(() => {
    publicarAcoes?.([
      { label: 'Preço', icon: '💲', act: alterarPreco, on: temSel, why: semLinha },
      { label: 'Quantidade', icon: '±', act: alterarQtd, on: temSel, why: semLinha },
      { label: 'Desconto Artigo', icon: '%', act: descontoLinha, on: temSel, why: semLinha },
      { label: 'Desconto', icon: '%', act: aplicarDesconto, on: true },
      { label: 'Número de Clientes', icon: '👥', act: numeroClientes, on: true },
      { label: 'Mensagens', icon: '✎', act: () => temSel && notaLinha(linhaSel()), on: temSel, why: semLinha },
      { label: 'Anular tudo', icon: '🗑', act: anularConta, on: !!linhas.length, perigo: true,
        why: 'A conta está vazia — não há nada para anular.' },
      { label: 'Funções Parciais', icon: '⑂', act: () => setMover('SPLIT'), on: !!linhas.length,
        why: 'A conta está vazia — não há linhas para separar.' },
      ...(cfg?.transfers !== 'Não permitir'
        ? [{ label: 'Transferência de Mesa', icon: '⇄', act: () => setMover('TRANSFER'), on: !!conta?.table,
            why: 'A venda de balcão não tem mesa para transferir.' } as AcaoPainel]
        : []),
      { label: 'Visualizar Preços', icon: '👁', act: () => setVerPrecos((v) => !v), on: true, ativo: verPrecos },
      { label: 'Ver artigos agrupados', icon: '▤', act: () => setAgrupar((v) => !v), on: true, ativo: agrupar },
      // Vieram da barra do topo, que tinha onze botões minúsculos. Continuam todos cá.
      { label: 'Enviar p/ Cozinha', icon: '🔔', act: enviarCozinha, on: !!linhas.length,
        why: 'A conta está vazia — não há nada para enviar.' },
      { label: 'Suspender Conta', icon: '⏸', act: suspender, on: !!linhas.length,
        why: 'A conta está vazia — não há nada para suspender.' },
      { label: 'Combos / Menus', icon: '🧺', act: () => setVerCombos(true), on: true },
      { label: 'Destino da Conta', icon: '🛎', act: () => setVerDestinos(true), on: true },
      { label: 'Histórico da Conta', icon: '≡', act: () => setVerHistorico(true), on: true },
      { label: 'Info. Hóspedes', icon: '👤', act: () => setPainel('GUESTS'), on: true },
      { label: 'Documentos', icon: '🗎', act: () => setPainel('DOCS'), on: true },
    ]);
  }, [conta, sel, temSel, verPrecos, agrupar, linhas.length]);

  // OS ÍCONES DO TOPO (lupa, +/−, mensagens, cliente) vivem na barra preta do terminal,
  // como no original, mas quem sabe executá-los é este ecrã. Publica-os para lá.
  useEffect(() => {
    publicarTopo?.({
      procurar: () => setProcurar(true),
      quantidade: () => temSel && setEditarQtd(true),
      mensagens: () => temSel && setVerMensagens(true),
      cliente: () => setEscolherCliente(true),
      temSel,
      cliente_atual: conta?.customer_name || null,
    });
  }, [conta, temSel]);

  // (8311) PEDIR O CLIENTE AO ABRIR — uma vez por conta, nunca em ciclo. Perguntar só na
  // hora de cobrar é tarde: o "afinal queria com contribuinte" chega depois de a fatura
  // já ter saído como Consumidor Final, e essa não se corrige — anula-se.
  useEffect(() => {
    if (!cfg?.ask_entity_on_open || !conta || conta.customer_name) return;
    if (perguntouCliente.current === tid) return;
    perguntouCliente.current = tid;
    setEscolherCliente(true);
  }, [conta, tid, cfg?.ask_entity_on_open]);

  // VER ARTIGOS AGRUPADOS: três cafés lançados um a um passam a "3 Café". Junta-se só o
  // que é MESMO igual — mesmo artigo, mesmo preço e mesma nota. Agrupar um café com nota
  // "sem açúcar" com outro sem nota era mandar para a cozinha um pedido que ninguém fez.
  const linhasVista = !agrupar ? linhas : Object.values(
    linhas.reduce((acc: Record<string, any>, l: any) => {
      const chave = `${l.item}|${l.unit_price}|${l.note || ''}`;
      if (!acc[chave]) acc[chave] = { ...l, quantity: 0, line_total: 0, _juntas: 0 };
      acc[chave].quantity = Number(acc[chave].quantity) + Number(l.quantity);
      acc[chave].line_total = Number(acc[chave].line_total) + Number(l.line_total);
      acc[chave]._juntas += 1;
      return acc;
    }, {}));

  return (
    <div className="absolute inset-0 flex">
      {/* ───────── teclado ───────── */}
      <div className="flex-1 flex flex-col overflow-hidden p-2">
        {/* ONDE ESTOU: a mesa (ou balcão) que está a ser atendida — sempre à vista. */}
        <div className="h-[40px] mb-2 bg-black rounded flex items-center px-3 gap-3 text-white flex-shrink-0">
          <span className="text-[18px] font-bold text-[#f0c000]">
            {conta?.table_label ? `Mesa ${conta.table_label}` : (conta?.dest_label || 'Balcão · Venda Direta')}
          </span>
          <span className="text-white/50 text-[13px]">{conta?.ticket_number}</span>
          <span className="ml-auto text-[13px] text-white/60">
            {{ PASSANTE: 'Passante', HOTEL: 'Hóspede', INTERNO: 'Consumo Interno' }[conta?.guest_type as string] || ''}
            {conta?.customer_name ? ` · ${conta.customer_name}` : ''}
          </span>
          {/* Os botões que aqui estavam (desconto, suspender, combos, destino, histórico,
              artigos, hóspedes, documentos) NÃO desapareceram: passaram para a
              ENGRENAGEM e para os ícones do topo, que é onde o original os tem. Onze
              botões de 13px numa barra de 40px eram alvos impossíveis num ecrã tátil. */}
          {Number(conta?.discount_percent) > 0 && (
            <span className="ml-2 px-2 h-[26px] flex items-center rounded bg-[#8a6100]
              text-[13px] font-bold">−{Number(conta.discount_percent)}%</span>
          )}
          {conta?.status === 'SUSPENDED' && (
            <span className="px-2 h-[26px] flex items-center rounded bg-[#8a6100] text-[13px]">⏸ suspensa</span>
          )}
        </div>
        <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <button onClick={() => (caminho.length ? setCaminho(caminho.slice(0, -1)) : onClose())}
            className="h-[76px] bg-[#3a3a3a] text-[#f0c000] text-[34px] font-bold rounded active:scale-95">
            ⬅
          </button>
          {(teclado?.pages || []).map((p: any) => (
            <button key={p.id} onClick={() => setCaminho([p])}
              style={{ background: p.color, color: p.text_color }}
              className={`h-[76px] rounded font-bold text-[17px] active:scale-95
                ${caminho[0]?.id === p.id ? 'ring-4 ring-white/70' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-auto">
          <div className="grid gap-2"
            style={{ gridTemplateColumns: `repeat(${kb?.cols || 4}, minmax(0,1fr))` }}>
            {caminho.length > 0 && nivel.map((k: any) => (
              <button key={k.id} onClick={() => tocar(k)} disabled={k.available === false}
                style={{
                  background: k.available === false ? '#4a4a4a' : k.color,
                  color: k.available === false ? '#8a8a8a' : k.text_color,
                  gridColumn: k.span > 1 ? `span ${k.span}` : undefined,
                }}
                className="h-[92px] rounded font-bold text-[16px] flex flex-col items-center justify-center
                  text-center px-2 leading-tight active:scale-95 disabled:cursor-not-allowed">
                <span>{k.label}</span>
                {/* Só saem se as caixas "Visualizar Códigos/Preços" estiverem ligadas. */}
                {k.code && <span className="text-[11px] font-normal opacity-80">{k.code}</span>}
                {verPrecos && k.price && <span className="text-[14px] opacity-95">{money(k.price)}</span>}
                {k.available === false && <span className="text-[10px]">indisponível</span>}
              </button>
            ))}
            {caminho.length === 0 && (
              <div className="col-span-full text-white/40 text-center py-16 text-[15px]">
                Escolha uma página em cima.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ───────── comanda ───────── */}
      <div className="w-[520px] bg-[#3a3a3a] flex flex-col border-l-4 border-black">
        {/* QUEM É O CLIENTE — o botão abre o formulário do TIPO certo: hóspede vai à
            lista do PMS, interno à lista de colaboradores, passante ao nome/NIF. */}
        <button onClick={() => (conta?.guest_type === 'HOTEL' ? setPedirHospede(true) : setFormCliente(true))}
          className="h-[54px] bg-[#2b2b2b] text-white flex items-center justify-between px-4 border-b border-black">
          <span className="text-[15px] text-white/60">
            {{ HOTEL: 'Hóspede', INTERNO: 'Colaborador' }[conta?.guest_type as string] || 'Cliente'}
          </span>
          <span className="font-bold">
            {conta?.customer_name || entidade?.name || 'Consumidor Final'} 👤+
          </span>
        </button>

        <div className="grid grid-cols-[64px_1fr_120px] bg-[#2b2b2b] text-white text-[16px] font-bold px-2 py-2">
          <span>Qtd</span><span>Descrição</span><span className="text-right">Total</span>
        </div>

        <div className="flex-1 overflow-auto bg-[#8a8a8a]/20">
          {linhasVista.map((l: any) => (
            // 1 toque ESCOLHE a linha (é sobre ela que a engrenagem trabalha); 2 toques
            // anulam. Antes, um toque abria logo a caixa da nota — não havia como
            // escolher uma linha para lhe mudar o preço.
            <div key={l.id} onClick={() => setSel(l.id)} onDoubleClick={() => apagarLinha(l)}
              title="1 toque: escolher a linha · 2 toques: anular a linha"
              className={`grid grid-cols-[64px_1fr_120px] px-2 py-2 text-white border-b border-black/20
                text-[15px] cursor-pointer ${sel === l.id ? 'bg-[#b39100]' : ''}`}>
              <span>{Number(l.quantity)}</span>
              <span className="truncate">
                {l.description}
                {l.note && <span className="block text-[11px] text-[#7fd4ff]">✎ {l.note}</span>}
                {l._juntas > 1 && (
                  <span className="block text-[11px] text-white/50">{l._juntas} lançamentos juntos</span>
                )}
                {/* ALERGÉNIOS da ficha do artigo (backoffice) — o empregado avisa o
                    cliente ANTES de o prato sair, não depois. */}
                {l.allergens?.length > 0 && (
                  <span className="block text-[11px] text-[#ff8a80]">⚠ {l.allergens.join(', ')}</span>
                )}
                {['FIRED', 'PREPARING', 'READY'].includes(l.kds_status) && (
                  <span className="ml-1 text-[11px] text-[#f0c000]">• na cozinha</span>
                )}
              </span>
              <span className="text-right">{money(l.line_total)}</span>
            </div>
          ))}
          {linhas.length === 0 && (
            <div className="text-white/50 text-center py-10 text-[14px]">
              A conta está vazia. Toque numa tecla para lançar.
            </div>
          )}
        </div>

        {/* NUMA MESA, os números de baixo são AS PESSOAS (subcontas): tocar troca,
            o seguinte acrescenta, as setas giram o carrossel. No balcão (sem mesa)
            são a QUANTIDADE para a próxima tecla. */}
        {conta?.table ? (
          <SubcontaBar conta={conta} onSwitch={(id) => { setTid(id); setQtd(1); }} />
        ) : (
          <div className="grid grid-cols-4 gap-px bg-black">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} onClick={() => setQtd(n)}
                className={`h-[62px] text-[22px] font-bold ${qtd === n
                  ? 'bg-[#1a1a1a] text-white ring-2 ring-[#f0c000]' : 'bg-[#2b2b2b] text-white/80'}`}>
                {n}
              </button>
            ))}
          </div>
        )}

        <div className="h-[74px] bg-[#8a8a8a] flex items-center justify-end px-4">
          <span className="text-[40px] font-bold text-white">{money(conta?.grand_total)}</span>
        </div>

        {/* ───── OS QUATRO BOTÕES DA COMANDA ─────
            Quatro e só quatro, como no original. Seis botões cinzentos quase iguais
            faziam-se confundir: o "anular a conta" ficava ao lado do "apagar a última
            linha", ambos vermelhos — e anulava-se a venda toda a querer tirar um café.
            Enviar para a cozinha passou para a aba Conta da engrenagem; apagar a linha
            faz-se na própria linha (dois toques). */}
        <div className="grid grid-cols-4 gap-px bg-black">
          {/* 1. ANULAR A VENDA — pede o MOTIVO (lista do backoffice) antes de apagar. */}
          <button onClick={() => setAnular(true)} disabled={!linhas.length}
            title="Anular a venda (pede o motivo)"
            className="h-[76px] bg-[#2b2b2b] text-[#e02020] text-[30px] disabled:opacity-30">🗑</button>
          {/* 2. CONSULTA — o talão de conferência (documento CM da AGT). O cliente
                 pergunta "quanto vai?" e mostra-se, sem fechar a conta. */}
          <button onClick={() => setVerTalao(true)} disabled={!linhas.length}
            title="Consulta de Mesa (talão de conferência)"
            className="h-[76px] bg-[#2b2b2b] text-white text-[30px] disabled:opacity-30">🖨</button>
          {/* 3. VENDA — abre os Pagamentos. */}
          <button onClick={() => setPagar(true)} disabled={!linhas.length}
            title="Pagamentos"
            className="h-[76px] bg-[#2b2b2b] text-[#f0c000] text-[30px] disabled:opacity-30">💰</button>
          {/* 4. CONFIRMAR — fecha a conta e volta à sala (a conta fica aberta na mesa). */}
          <button onClick={onClose} title="Confirmar e voltar"
            className="h-[76px] bg-[#2b2b2b] text-[#2ecc40] text-[34px]">✔</button>
        </div>
      </div>

      {/* ANULAR A VENDA — o motivo vem da lista do backoffice (ou texto livre). */}
      {anular && (
        <VoidReasonDialog onClose={() => setAnular(false)}
          onPick={async (motivo) => {
            setAnular(false);
            try {
              await apiClient.post(`pos/tickets/${tid}/void/`, { reason: motivo });
              inval();
              onClose();
            } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível anular.'); }
          }} />
      )}

      {/* (+/−) do topo: o teclado numérico sobre a linha escolhida. */}
      {editarQtd && linhaSel() && (
        <NumPad titulo={linhaSel().description} subtitulo="Editar quantidade"
          inicial={String(Number(linhaSel().quantity))}
          onClose={() => setEditarQtd(false)}
          onOk={async (valor) => {
            const n = Number(valor.replace(',', '.'));
            setEditarQtd(false);
            if (!(n > 0)) return alert('A quantidade tem de ser maior que zero. Para tirar o artigo, anule a linha.');
            await patchLinha({ quantity: n }, 'Não foi possível alterar a quantidade.');
          }} />
      )}

      {/* ✎ do topo: as mensagens de produção do backoffice, coladas à linha escolhida. */}
      {verMensagens && linhaSel() && (
        <MessagesPanel linha={linhaSel()} onClose={() => setVerMensagens(false)}
          onPick={async (texto) => {
            setVerMensagens(false);
            await patchLinha({ note: texto || null }, 'Não foi possível gravar a mensagem.');
          }} />
      )}

      {/* 👤+ do topo (e a abertura automática pelo 8311): quem leva a fatura. */}
      {escolherCliente && (
        <ClientPicker onClose={() => setEscolherCliente(false)}
          onPick={async (esc) => {
            setEscolherCliente(false);
            if (!esc.customer_name && !esc.entity) return;   // Consumidor Final: nada a gravar
            try {
              await apiClient.post(`pos/tickets/${tid}/set_customer/`, esc);
              inval();
            } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível guardar o cliente.'); }
          }} />
      )}

      {/* Parciais e transferências DESTA conta, chamadas da engrenagem (aba Conta) */}
      {mover && conta && (
        <MoveLines modo={mover} ticket={conta} setor={setor} modoTransfer={cfg?.transfers}
          onClose={() => { setMover(''); inval(); }} />
      )}

      {/* hóspedes e documentos — os painéis do backoffice, dentro da venda */}
      {painel === 'GUESTS' && <GuestsPanel aba="GUESTS" onClose={() => setPainel('')} />}
      {painel === 'DOCS' && <DocsPanel onClose={() => setPainel('')} />}

      {/* Consulta de Mesa desta conta: emite o CM e mostra o talão térmico */}
      {verTalao && conta && (
        <TicketPreview ticket={conta} onClose={() => setVerTalao(false)} />
      )}

      {/* HÓSPEDE: a lista de check-ins do PMS — a conta fica com o nome e o quarto */}
      {pedirHospede && conta && (
        <GuestPick titulo="Que hóspede é este?"
          onPick={async (g) => {
            try {
              await apiClient.post(`pos/tickets/${conta.id}/set_customer/`, {
                customer_name: g.guest, company_name: g.room ? `Quarto ${g.room}` : null,
              });
            } catch { /* sem PMS, a conta segue */ }
            setPedirHospede(false); inval();
          }}
          onClose={() => setPedirHospede(false)} />
      )}

      {/* PASSANTE (nome/NIF p/ fatura, opcional) e CONSUMO INTERNO (colaborador do RH) */}
      {formCliente && conta && (
        <CustomerForm conta={conta}
          onSaved={() => { setFormCliente(false); inval(); }}
          onClose={() => setFormCliente(false)} />
      )}

      {/* COMBOS do Commercial: lançar o menu inteiro com um toque */}
      {verCombos && <ComboWindow tid={tid} onDone={() => { setVerCombos(false); inval(); }}
        onClose={() => setVerCombos(false)} />}

      {/* DESTINO: manda a conta para a fila de Entregas (Quarto/Piscina/…) */}
      {verDestinos && <DestWindow tid={tid} onDone={() => { setVerDestinos(false); inval(); }}
        onClose={() => setVerDestinos(false)} />}

      {/* HISTÓRICO (auditoria) desta conta */}
      {verHistorico && <AuditWindow tid={tid} onClose={() => setVerHistorico(false)} />}

      {/* consulta de artigo: procura no catálogo INTEIRO e lança com um toque */}
      {procurar && (
        <ArticleSearch
          onPick={async (a) => { setProcurar(false); await lancar({ item: a.id, available: true }); }}
          onClose={() => setProcurar(false)} />
      )}

      {escolherEntidade && (
        <EntityPicker
          onPick={(e) => { setEntidade(e); setEscolherEntidade(false); }}
          onCancel={() => setEscolherEntidade(false)} />
      )}

      {pagar && conta && (
        <PayPanel ticket={conta} entidade={entidade}
          exigirEntidade={!!cfg?.ask_entity_before_pay}
          onClose={() => setPagar(false)}
          onPaid={() => { setPagar(false); onClose(); }} />
      )}
    </div>
  );
}

// ─── COMBOS (Commercial): o menu lança os componentes e acerta o preço ───────
function ComboWindow({ tid, onDone, onClose }: { tid: number; onDone: () => void; onClose: () => void }) {
  const { data: combos = [] } = useQuery({
    queryKey: ['pos-combos'],
    queryFn: async () => {
      const r = await apiClient.get('commercial/combos/');
      return ((r.data?.results || r.data || []) as any[]).filter((c) => c.is_active !== false);
    },
  });
  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const lancarCombo = async (c: any) => {
    try {
      await apiClient.post(`pos/tickets/${tid}/add_combo/`, { combo: c.id });
      onDone();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível lançar o combo.'); }
  };
  return (
    <Window title="Combos / Menus" width={560} onClose={onClose} tone="#8a6100">
      <div className="p-3 bg-[#1a1a1a] grid grid-cols-2 gap-2 max-h-[56vh] overflow-auto">
        {combos.map((c: any) => (
          <button key={c.id} onClick={() => lancarCombo(c)}
            className="h-[86px] bg-[#8a6100] text-white rounded-md font-bold text-[16px] px-2
              leading-tight active:scale-95">
            {c.name}
            <span className="block text-[14px] font-normal opacity-90">{money(c.combo_price ?? c.price)} Kz</span>
          </button>
        ))}
        {combos.length === 0 && (
          <div className="col-span-2 text-white/50 text-center py-8 text-[14px]">
            Sem combos ativos — criam-se no Commercial (Promoções/Combos).
          </div>
        )}
      </div>
    </Window>
  );
}

// ─── DESTINO: Quarto/Piscina/Praia… — a conta entra na fila de Entregas ──────
function DestWindow({ tid, onDone, onClose }: { tid: number; onDone: () => void; onClose: () => void }) {
  const { data: destinos = [] } = useQuery({
    queryKey: ['pos-dests'],
    queryFn: async () => {
      const r = await apiClient.get('pos/service-destinations/');
      return ((r.data?.results || r.data || []) as any[]).filter((d) => d.is_active !== false);
    },
  });
  const escolher = async (d: any) => {
    const nota = window.prompt(`Destino: ${d.name}\n\nObservações para a entrega (opcional):`) || '';
    try {
      await apiClient.post(`pos/tickets/${tid}/set_destination/`, {
        dest_kind: 'DESTINATION', dest_ref: d.id, dest_note: nota || null,
      });
      onDone();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível definir o destino.'); }
  };
  return (
    <Window title="Destino do pedido (entra nas Entregas)" width={520} onClose={onClose} tone="#1a4f8a">
      <div className="p-3 bg-[#1a1a1a] grid grid-cols-3 gap-2 max-h-[52vh] overflow-auto">
        {destinos.map((d: any) => (
          <button key={d.id} onClick={() => escolher(d)}
            className="h-[76px] bg-[#1a4f8a] text-white rounded-md font-bold text-[15px] px-2
              leading-tight active:scale-95">
            {d.name}
          </button>
        ))}
        {destinos.length === 0 && (
          <div className="col-span-3 text-white/50 text-center py-8 text-[14px]">
            Sem destinos configurados — criam-se em Configuração POS › Destinos de Serviço.
          </div>
        )}
      </div>
    </Window>
  );
}

// ─── HISTÓRICO da conta: quem fez o quê, quando, de que IP (auditoria) ───────
function AuditWindow({ tid, onClose }: { tid: number; onClose: () => void }) {
  const { data: eventos = [] } = useQuery({
    queryKey: ['pos-audit', tid],
    queryFn: async () => (await apiClient.get(`pos/tickets/${tid}/audit/`)).data as any[],
  });
  return (
    <Window title="Histórico da conta (auditoria)" width={720} onClose={onClose} tone="#3a3a3a">
      <div className="bg-[#1a1a1a] overflow-auto" style={{ maxHeight: '60vh' }}>
        {eventos.map((e: any, i: number) => (
          <div key={i} className="px-4 py-2 border-b border-black/30 text-[13px]">
            <span className="text-white/40">{new Date(e.at).toLocaleString('pt-PT',
              { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            <span className="text-[#f0c000] font-bold mx-2">{e.event_display}</span>
            <span className="text-white">{e.description}</span>
            <span className="text-white/40"> — {e.operator || e.user || ''}{e.ip ? ` · ${e.ip}` : ''}</span>
          </div>
        ))}
        {eventos.length === 0 && (
          <div className="text-white/50 text-center py-8 text-[14px]">Sem eventos registados.</div>
        )}
      </div>
    </Window>
  );
}
