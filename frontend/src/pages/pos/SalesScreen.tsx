import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { comPerguntas } from '../posPrompt';
import EntitySearchPos from './EntitySearchPos';
import PayPanel from './PayPanel';
import SubcontaBar from './SubcontaBar';
import ArticleSearch from './ArticleSearch';
import GuestsPanel from './GuestsPanel';
import DocsPanel from './DocsPanel';
import TicketPreview from './TicketPreview';

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
import AskMessage from './AskMessage';
import ZonaArrastavel from './ZonaArrastavel';
import {
  IcoLixo, IcoImpressora, IcoDinheiro, IcoVisto, IcoVoltar, IcoPreco, IcoMaisMenos,
  IcoPercento, IcoPessoas, IcoLapis, IcoParciais, IcoTransferir, IcoOlho, IcoAgrupar,
  IcoSino, IcoPausa, IcoCombo, IcoEntrega, IcoHistorico, IcoQuarto, IcoDocumento, IcoAviso,
} from './Icons';
import { aviso, pedir } from '../../ui/dialogo';

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
/**
 * Um dos quatro botões da comanda. Relevo pesado (alto em cima, sombra em baixo) e a
 * mesma altura de dedo: num ecrã tátil o botão tem de PARECER premível, senão o
 * empregado carrega duas vezes por não ter a certeza que a primeira contou.
 */
const BotaoComanda = ({ children, onClick, on, cor, titulo }: {
  children: any; onClick: () => void; on: boolean; cor: string; titulo: string;
}) => (
  <button onClick={() => on && onClick()} disabled={!on} title={titulo}
    style={{ color: cor }}
    className="h-[84px] flex items-center justify-center rounded-[3px] border-2 border-black
      bg-gradient-to-b from-[#4a4a4a] to-[#262626]
      shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)]
      active:from-[#242424] active:to-[#3a3a3a] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
      disabled:opacity-25 disabled:shadow-none disabled:cursor-not-allowed">
    {children}
  </button>
);

export type TopoApi = {
  procurar: () => void;
  quantidade: () => void;
  mensagens: () => void;
  cliente: () => void;
  temSel: boolean;
  cliente_atual: string | null;
  /** "Mesa: LB3 (2)" ou "Balcão · Venda Direta" */
  onde: string;
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
  // Cinto e suspensórios: quem monta este ecrã dá-lhe uma `key` por conta, mas se
  // alguém a esquecer, o número da conta segue o que vem de fora na mesma. Um ecrã de
  // venda agarrado à conta errada lança os artigos na mesa do vizinho — não é um erro
  // que se possa deixar depender de uma linha noutro ficheiro.
  useEffect(() => { setTid(ticketId); }, [ticketId]);
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
  const [verCombos, setVerCombos] = useState(false);     // combos do Commercial
  const [verHistorico, setVerHistorico] = useState(false); // auditoria da conta
  const [verDestinos, setVerDestinos] = useState(false);  // Quarto/Piscina/Praia…
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
  const [anular, setAnular] = useState(false);          // motivo de anulação da CONTA
  const [anularLinha, setAnularLinha] = useState<any | null>(null);  // motivo de UMA linha
  const [editarQtd, setEditarQtd] = useState(false);    // teclado numérico (+/−)
  const [verMensagens, setVerMensagens] = useState(false);
  const [escolherCliente, setEscolherCliente] = useState(false);
  // A FILA DE PERGUNTAS do artigo acabado de lançar ("GELO?" → "AÇÚCAR?" → …).
  // É uma fila, não uma pergunta: um sumo pode ter duas coisas a perguntar, e as duas
  // têm de ser feitas antes de o pedido seguir para o bar.
  const [perguntar, setPerguntar] = useState<{ linha: any; fila: any[]; escolhas: string[] } | null>(null);
  // Só se pergunta UMA vez por conta quem é o cliente — senão o ecrã reabria a cada
  // refrescamento e o empregado não conseguia lançar nada.
  const perguntouCliente = useRef<number | null>(null);
  // GUARDA CONTRA O DUPLO TOQUE ao anular uma linha: o duplo-clique na linha e o
  // caixote com a linha escolhida chamam a MESMA função — sem isto, um toque a mais
  // tentava apagar uma linha que o primeiro pedido já tinha apagado, e o operador via
  // o erro cru do servidor ("No POSTicketLine matches the given query.").
  const anulandoLinha = useRef<Set<number>>(new Set());

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

  // A pergunta de QUEM É O CLIENTE é UMA só: o seletor das três abas (Entidade ·
  // Quarto · Eventos), que abre sozinho pelo 9311. Havia aqui um segundo caminho que
  // abria uma janela só de quartos, com o mesmo fim — duas perguntas para a mesma
  // coisa, e a segunda ainda antes de o empregado ver a conta que acabou de abrir.

  const lancar = async (k: any) => {
    if (k.available === false) return;
    try {
      const r = await comPerguntas(`pos/tickets/${tid}/add_line/`,
        // o OPERADOR segue no pedido: as caixas da ficha dele (preço de custo,
        // consumo interno) decidem o preço e a autorização — no servidor.
        { item: k.item, quantity: qtd, operator: operId },
        async (label, detalhe) => await pedir(`${detalhe}\n\n${label}:`));
      setQtd(1);

      // PERGUNTAR AO LANÇAR: o backoffice marca "com/sem gelo" como pergunta neste
      // artigo, e o terminal pergunta AGORA — com o cliente à frente. Perguntar depois
      // é voltar à mesa; não perguntar é mandar para o bar um pedido incompleto.
      try {
        const conf = await apiClient.get('pos/config/kitchen-messages/',
          { params: { item: k.item, ask: 1 } });
        const perguntas = ((conf.data?.results || conf.data || []) as any[])
          .filter((m) => (m.options || []).length);
        if (perguntas.length) {
          // a linha nova é a última da conta que o servidor acabou de devolver
          // (comPerguntas devolve já o `.data`, que é a conta inteira)
          const nova = (r?.lines || []).slice(-1)[0];
          if (nova) {
            // REFRESCAR ANTES de abrir a pergunta. Saía daqui sem o fazer, e como a
            // comanda só se relê de 5 em 5 segundos, o artigo parecia NÃO TER SIDO
            // LANÇADO — o empregado tocava outra vez e lançava dois.
            inval();
            setPerguntar({ linha: nova, fila: perguntas, escolhas: [] });
            return;
          }
        }
      } catch { /* sem mensagens configuradas: lança e segue */ }
      // (Parâmetro 8308) "Enviar para a cozinha automaticamente": cada artigo lançado
      // segue LOGO para a produção — não fica à espera do botão. É o modo dos bares
      // rápidos, onde o pedido não se acumula.
      if (cfg?.auto_fire_kitchen) {
        try { await apiClient.post(`pos/tickets/${tid}/fire_kitchen/`, {}); } catch { /* sem produção configurada */ }
      }
      inval();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível lançar o artigo.');
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
      const escolha = await pedir(
        `NOTA PARA A COZINHA — ${l.description}\n\n${lista || '(sem mensagens configuradas)'}\n\n` +
        'Escreva o Nº da mensagem, ou texto livre:', l.note || '');
      if (escolha === null) return;
      const n = Number(escolha.trim());
      const nota = (Number.isInteger(n) && n >= 1 && n <= msgs.length) ? msgs[n - 1].name : escolha.trim();
      await apiClient.patch(`pos/ticket-lines/${l.id}/`, { note: nota || null });
      inval();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível gravar a nota.'); }
  };

  // Passa à pergunta seguinte da fila; esgotada, grava TODAS as respostas na linha de
  // uma vez (o motor substitui a lista inteira — é assim que tirar uma também funciona).
  const avancarPergunta = async (escolhas: string[]) => {
    if (!perguntar) return;
    const resto = perguntar.fila.slice(1);
    if (resto.length) return setPerguntar({ ...perguntar, fila: resto, escolhas });
    setPerguntar(null);
    if (!escolhas.length) return inval();   // sem resposta, mas a linha existe: mostra-a
    try {
      await apiClient.post(`pos/ticket-lines/${perguntar.linha.id}/messages/`, { texts: escolhas });
      inval();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível gravar as mensagens.'); }
  };

  /**
   * TIRAR UM ARTIGO DA CONTA.
   *
   * ANTES DE CONFIRMAR o pedido, sai sem perguntas: o empregado ainda está a compor a
   * comanda com o cliente à frente, engana-se e corrige — obrigar a um motivo a cada
   * correção era pôr burocracia no meio de uma conversa.
   *
   * DEPOIS DE CONFIRMADO (já foi para a produção), exige MOTIVO: nessa altura há comida
   * a ser feita ou bebida servida. O motivo diz à cozinha porque para, e fica no registo
   * — é o que separa "o cliente mudou de ideias" de "desapareceu um whisky".
   *
   * Em nenhum dos casos se sai da venda: tirar um artigo é uma correção, não um fim de
   * serviço.
   */
  const apagarLinha = async (l: any) => {
    const confirmado = ['FIRED', 'PREPARING', 'READY', 'SERVED'].includes(l.kds_status);
    if (confirmado) { setAnularLinha(l); return; }   // pede o motivo (lista do backoffice)
    if (anulandoLinha.current.has(l.id)) return;      // já em curso — o duplo-toque ignora-se
    anulandoLinha.current.add(l.id);
    try {
      await apiClient.delete(`pos/ticket-lines/${l.id}/`);
      setSel(null);
      inval();
    } catch (e: any) {
      // 404 = a linha já não existe (outro toque já a tinha apagado): o resultado que se
      // queria já está feito, não é um erro para mostrar ao operador.
      if (e?.response?.status === 404) { setSel(null); inval(); }
      else aviso(e?.response?.data?.detail || 'Erro ao anular.');
    } finally { anulandoLinha.current.delete(l.id); }
  };

  /** A mesma remoção, já com o motivo escolhido. Também não sai da venda. */
  const apagarLinhaComMotivo = async (l: any, motivo: string) => {
    setAnularLinha(null);
    if (anulandoLinha.current.has(l.id)) return;
    anulandoLinha.current.add(l.id);
    try {
      await apiClient.delete(`pos/ticket-lines/${l.id}/`, { params: { reason: motivo } });
      setSel(null);
      inval();
    } catch (e: any) {
      if (e?.response?.status === 404) { setSel(null); inval(); }
      else aviso(e?.response?.data?.detail || 'Erro ao anular.');
    } finally { anulandoLinha.current.delete(l.id); }
  };

  // DESCONTO — os códigos do backoffice primeiro (validade + grupos autorizados no
  // servidor); sem código, manual em % (acima do 8620, o servidor exige supervisor).
  const aplicarDesconto = async () => {
    try {
      const r = await apiClient.get('pos/config/discounts/');
      // (8582 da FICHA DO SETOR) que descontos esta sala pode dar. A lista vinha
      // inteira: escolhia-se na ficha "só o desconto de sócio" e o terminal continuava
      // a oferecer todos — a ficha era decorativa. 'TODOS' (ou vazio) mantém a lista.
      const permitido = setor?.discounts;
      const codigos = ((r.data?.results || r.data || []) as any[])
        .filter((d) => d.is_active !== false && d.for_pos !== false)
        .filter((d) => !permitido || permitido === 'TODOS' || String(d.id) === String(permitido));
      const lista = codigos.map((d, i) => `${i + 1}. ${d.code} — ${d.name} (${Number(d.value)}${d.base === 'PERCENT' ? '%' : ' Kz'})`).join('\n');
      const escolha = await pedir(
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
          const sup = await pedir(e.response.data.detail + '\n\nNome do supervisor que autoriza:');
          if (!sup) return;
          await apiClient.post(`pos/tickets/${tid}/set_discount/`, { ...body, authorized_by: sup });
        } else { throw e; }
      }
      inval();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível aplicar o desconto.');
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
    } catch (e: any) { aviso(e?.response?.data?.detail || erro); }
  };

  // PREÇO manual: o servidor recusa se o artigo não permitir (caixa da ficha) ou se o
  // valor descer abaixo do que o operador pode dar — não é aqui que isso se decide.
  const alterarPreco = async () => {
    const l = linhaSel();
    if (!l) return;
    const v = await pedir(`PREÇO — ${l.description}\n\nPreço atual: ${money(l.unit_price)}\n\nNovo preço:`,
      String(Number(l.unit_price)));
    if (v === null || !v.trim()) return;
    await patchLinha({ unit_price: v.replace(',', '.').trim() },
      'Não foi possível alterar o preço (o artigo pode não permitir preço manual).');
  };

  const alterarQtd = async () => {
    const l = linhaSel();
    if (!l) return;
    const v = await pedir(`QUANTIDADE — ${l.description}\n\nQuantidade atual: ${Number(l.quantity)}\n\nNova quantidade:`,
      String(Number(l.quantity)));
    if (v === null || !v.trim()) return;
    const n = Number(v.replace(',', '.').trim());
    if (!(n > 0)) return aviso('A quantidade tem de ser maior que zero. Para tirar o artigo, anule a linha.');
    await patchLinha({ quantity: n }, 'Não foi possível alterar a quantidade.');
  };

  const descontoLinha = async () => {
    const l = linhaSel();
    if (!l) return;
    const v = await pedir(`DESCONTO DO ARTIGO — ${l.description}\n\nPercentagem (0 tira o desconto):`,
      String(Number(l.discount_percent || 0)));
    if (v === null) return;
    await patchLinha({ discount_percent: v.replace('%', '').replace(',', '.').trim() || 0 },
      'Não foi possível aplicar o desconto ao artigo.');
  };

  // NÚMERO DE CLIENTES — o divisor do gasto por pessoa. Corrige-se quando chega mais
  // gente à mesa; sem isto o indicador do restaurante fica errado o serviço todo.
  const numeroClientes = async () => {
    const v = await pedir(`NÚMERO DE CLIENTES\n\nQuantos estão à mesa?`, String(conta?.guests || 1));
    if (v === null) return;
    const n = Number(v.trim());
    if (!(n > 0)) return aviso('O número de clientes tem de ser maior que zero.');
    try {
      await apiClient.patch(`pos/tickets/${tid}/`, { guests: n });
      inval();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível gravar.'); }
  };

  // ANULAR TUDO — a conta inteira. O motivo já vem escolhido do VoidReasonDialog (lista
  // do backoffice ou texto livre) — pedir de novo aqui era mostrar um segundo prompt
  // depois de o empregado já ter escolhido, a perguntar a mesma coisa outra vez.
  const anularConta = async (motivo: string) => {
    if (!motivo) return;
    try {
      await apiClient.post(`pos/tickets/${tid}/void/`, { reason: motivo });
      inval();
      onClose();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível anular.'); }
  };

  // SUSPENDER a conta (o grupo que sai e volta) — retoma-se tocando na mesa.
  const suspender = async () => {
    try {
      await apiClient.post(`pos/tickets/${tid}/suspend/`, {});
      inval();
      onClose();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível suspender.'); }
  };

  const enviarCozinha = async () => {
    try {
      const r = await apiClient.post(`pos/tickets/${tid}/fire_kitchen/`, {});
      if (r.data?.print_warnings?.length) aviso(r.data.print_warnings.join('\n'));
      inval();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Erro ao enviar para a cozinha.'); }
  };

  /**
   * CONFIRMAR O PEDIDO — o toque no ✔ verde.
   *
   * Faz as duas coisas que o nome promete: manda para a PRODUÇÃO o que ainda não foi
   * (a cozinha e o bar passam a saber o que fazer) e volta à sala. A partir daqui o
   * pedido está confirmado — tirar um artigo passa a exigir motivo.
   *
   * Se a conta estiver vazia, não há nada a confirmar: sai e a mesa fica livre (é a
   * regra da mesa sem consumo, em fecharVenda).
   */
  const confirmarPedido = async () => {
    const porEnviar = (conta?.lines || []).some(
      (l: any) => !l.is_void && l.kds_status === 'NEW');
    if (porEnviar) {
      try {
        const r = await apiClient.post(`pos/tickets/${tid}/fire_kitchen/`, {});
        if (r.data?.print_warnings?.length) aviso(r.data.print_warnings.join('\n'));
      } catch (e: any) {
        // sem produção configurada não é motivo para prender o empregado no ecrã
        const d = e?.response?.data?.detail;
        if (d && !/produ|impress|estac/i.test(String(d))) aviso(d);
      }
    }
    onClose();
  };

  const linhas: any[] = conta?.lines || [];
  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

  // A VENDA ENTREGA AS SUAS FUNÇÕES ao painel da engrenagem. O painel é chrome; quem
  // sabe mexer na conta é este ecrã — e é aqui que as funções ficam.
  const temSel = sel != null && linhas.some((l) => l.id === sel);
  const semLinha = 'Escolha primeiro uma linha da comanda (um toque).';
  useEffect(() => {
    publicarAcoes?.([
      { label: 'Preço', icon: <IcoPreco size={40} />, act: alterarPreco, on: temSel, why: semLinha },
      { label: 'Quantidade', icon: <IcoMaisMenos size={40} />, act: alterarQtd, on: temSel, why: semLinha },
      { label: 'Desconto Artigo', icon: <IcoPercento size={40} />, act: descontoLinha, on: temSel, why: semLinha },
      { label: 'Desconto', icon: <IcoPercento size={40} />, act: aplicarDesconto, on: true },
      { label: 'Número de Clientes', icon: <IcoPessoas size={40} />, act: numeroClientes, on: true },
      { label: 'Mensagens', icon: <IcoLapis size={40} />, act: () => temSel && notaLinha(linhaSel()), on: temSel, why: semLinha },
      { label: 'Anular tudo', icon: <IcoLixo size={40} />, act: () => setAnular(true), on: !!linhas.length, perigo: true,
        why: 'A conta está vazia — não há nada para anular.' },
      { label: 'Funções Parciais', icon: <IcoParciais size={40} />, act: () => setMover('SPLIT'), on: !!linhas.length,
        why: 'A conta está vazia — não há linhas para separar.' },
      ...(cfg?.transfers !== 'Não permitir'
        ? [{ label: 'Transferência de Mesa', icon: <IcoTransferir size={40} />, act: () => setMover('TRANSFER'), on: !!conta?.table,
            why: 'A venda de balcão não tem mesa para transferir.' } as AcaoPainel]
        : []),
      { label: 'Visualizar Preços', icon: <IcoOlho size={40} />, act: () => setVerPrecos((v) => !v), on: true, ativo: verPrecos },
      { label: 'Ver artigos agrupados', icon: <IcoAgrupar size={40} />, act: () => setAgrupar((v) => !v), on: true, ativo: agrupar },
      // Vieram da barra do topo, que tinha onze botões minúsculos. Continuam todos cá.
      { label: 'Enviar p/ Cozinha', icon: <IcoSino size={40} />, act: enviarCozinha, on: !!linhas.length,
        why: 'A conta está vazia — não há nada para enviar.' },
      { label: 'Suspender Conta', icon: <IcoPausa size={40} />, act: suspender, on: !!linhas.length,
        why: 'A conta está vazia — não há nada para suspender.' },
      { label: 'Combos / Menus', icon: <IcoCombo size={40} />, act: () => setVerCombos(true), on: true },
      { label: 'Destino da Conta', icon: <IcoEntrega size={40} />, act: () => setVerDestinos(true), on: true },
      { label: 'Histórico da Conta', icon: <IcoHistorico size={40} />, act: () => setVerHistorico(true), on: true },
      { label: 'Info. Hóspedes', icon: <IcoQuarto size={40} />, act: () => setPainel('GUESTS'), on: true },
      { label: 'Documentos', icon: <IcoDocumento size={40} />, act: () => setPainel('DOCS'), on: true },
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
      // A mesa (ou o balcão) — vinha da faixa que foi retirada de dentro da venda.
      onde: conta?.table_label
        ? `Mesa: ${conta.table_label}${conta.guests ? ` (${conta.guests})` : ''}`
        : (conta?.dest_label || 'Balcão · Venda Direta'),
    });
  }, [conta, temSel]);

  /**
   * CONTA FECHADA -> FORA DA VENDA.
   *
   * O ecrã da venda é para contas ABERTAS. Ficava aberto com a conta já paga: o
   * empregado via os artigos, o total e as teclas de uma venda que já não existe — e
   * podia tentar lançar mais, ou anular o que já foi faturado. Bastava um caminho de
   * saída falhar (fechar o recibo pelo X, um erro no meio) para o ecrã ficar preso.
   *
   * Agora não depende de nenhum caminho: mudou de estado, sai.
   */
  useEffect(() => {
    if (conta && conta.status && conta.status !== 'OPEN' && conta.status !== 'SUSPENDED') {
      onClose();
    }
  }, [conta?.status]);

  // (9312) O TECLADO ABRE-SE SOZINHO. Entrar no balcão e ver "Escolha uma página em
  // cima" é perder um toque em todas as vendas do dia: a primeira página é sempre a que
  // o dono pôs primeiro, e é onde está o que mais se vende. Quem tem várias páginas
  // troca com um toque; quem só tem uma nunca mais pensa nisso.
  // Desliga-se no backoffice para as casas que querem o empregado a escolher a página
  // de propósito (cozinhas com cartas muito diferentes por turno).
  useEffect(() => {
    if (cfg?.open_keyboard_on_sale === false) return;
    if (caminho.length) return;
    const p1 = (teclado?.pages || [])[0];
    if (p1) setCaminho([p1]);
  }, [teclado, cfg?.open_keyboard_on_sale]);

  // (9311) PEDIR O CLIENTE AO ABRIR — uma vez por conta, nunca em ciclo. Perguntar só na
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
        {/* A FAIXA DE CONTEXTO SAIU DAQUI. "Balcão · Venda Direta · TCK-6B15E5C0 · Passante"
            ocupava uma linha inteira para dizer o que o topo já diz — e o número do
            talão não serve para nada a quem está a servir. O que interessa (a mesa e o
            cliente) está na barra preta, ao pé do botão do cliente. */}
        <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
          <button onClick={() => (caminho.length ? setCaminho(caminho.slice(0, -1)) : onClose())}
            title="Voltar"
            className="h-[84px] flex items-center justify-center text-[#f0c000]
              bg-gradient-to-b from-[#4e4e4e] to-[#2c2c2c] border-2 border-black rounded-[3px]
              shadow-[inset_0_2px_0_rgba(255,255,255,0.18),inset_0_-2px_0_rgba(0,0,0,0.5)]
              active:from-[#2c2c2c] active:to-[#3e3e3e]">
            <IcoVoltar size={38} />
          </button>
          {(teclado?.pages || []).map((p: any) => (
            // As PÁGINAS do teclado: cor do backoffice, relevo pesado por cima. O relevo
            // é o que faz a tecla parecer premível num ecrã sem tacto nenhum.
            <button key={p.id} onClick={() => setCaminho([p])}
              style={{ background: p.color, color: p.text_color }}
              className={`h-[84px] rounded-[3px] font-bold text-[19px] uppercase tracking-wide
                border-2 border-black
                shadow-[inset_0_2px_0_rgba(255,255,255,0.28),inset_0_-3px_0_rgba(0,0,0,0.4)]
                active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.55)]
                ${caminho[0]?.id === p.id ? 'ring-[3px] ring-white/85 ring-inset' : ''}`}>
              {p.label}
            </button>
          ))}
        </div>

        <ZonaArrastavel className="flex-1">
          <div className="grid gap-2"
            style={{
              // (ficha da página) a grelha DA PÁGINA aberta ganha à do teclado: a das
              // bebidas pode ter 5 colunas de garrafas e a dos pratos 3 largas.
              gridTemplateColumns: `repeat(${caminho[0]?.cols || kb?.cols || 4}, minmax(0,1fr))`,
            }}>
            {caminho.length > 0 && nivel.map((k: any) => (
              <button key={k.id} onClick={() => tocar(k)} disabled={k.available === false}
                style={{
                  background: k.available === false ? '#4a4a4a' : k.color,
                  color: k.available === false ? '#8a8a8a' : k.text_color,
                  gridColumn: k.span > 1 ? `span ${k.span}` : undefined,
                }}
                className="h-[104px] rounded-[3px] font-bold text-[18px] flex flex-col items-center
                  justify-center text-center px-3 leading-tight border-2 border-black
                  shadow-[inset_0_2px_0_rgba(255,255,255,0.25),inset_0_-3px_0_rgba(0,0,0,0.38)]
                  active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.55)]
                  disabled:shadow-none disabled:cursor-not-allowed">
                <span>{k.label}</span>
                {/* Só saem se as caixas "Visualizar Códigos/Preços" estiverem ligadas. */}
                {k.code && <span className="text-[12px] font-normal opacity-80">{k.code}</span>}
                {verPrecos && k.price && <span className="text-[15px] opacity-95">{money(k.price)}</span>}
                {k.available === false && <span className="text-[11px]">indisponível</span>}
              </button>
            ))}
            {caminho.length === 0 && (
              <div className="col-span-full text-white/40 text-center py-16 text-[16px]">
                Escolha uma página em cima.
              </div>
            )}
          </div>
        </ZonaArrastavel>
      </div>

      {/* ───────── comanda ───────── */}
      <div className="w-[520px] bg-[#3a3a3a] flex flex-col border-l-4 border-black">
        {/* QUEM É O CLIENTE — o botão abre o formulário do TIPO certo: hóspede vai à
            lista do PMS, interno à lista de colaboradores, passante ao nome/NIF. */}
        <button onClick={() => setEscolherCliente(true)}
          className="h-[54px] bg-[#2b2b2b] text-white flex items-center justify-between px-4 border-b border-black">
          <span className="text-[15px] text-white/60">
            {{ HOTEL: 'Hóspede', INTERNO: 'Colaborador' }[conta?.guest_type as string] || 'Cliente'}
          </span>
          <span className="font-bold">
            {conta?.customer_name || entidade?.name || 'Consumidor Final'}
          </span>
        </button>

        <div className="grid grid-cols-[64px_1fr_120px] bg-[#2b2b2b] text-white text-[16px] font-bold px-2 py-2">
          <span>Qtd</span><span>Descrição</span><span className="text-right">Total</span>
        </div>

        {/* A COMANDA É PAPEL: fundo BRANCO, tinta preta, como o talão que vai sair da
            impressora. O cinzento fazia a conta parecer mais um painel do programa; em
            branco, o empregado vira o ecrã ao cliente e o cliente reconhece a fatura.
            É também o que se lê melhor sob a luz de uma sala escura. */}
        <ZonaArrastavel className="flex-1 bg-white">
          {linhasVista.map((l: any) => (
            // 1 toque ESCOLHE a linha (é sobre ela que a engrenagem trabalha); 2 toques
            // anulam. Antes, um toque abria logo a caixa da nota — não havia como
            // escolher uma linha para lhe mudar o preço.
            <div key={l.id} onClick={() => setSel(l.id)} onDoubleClick={() => apagarLinha(l)}
              title="1 toque: escolher a linha · 2 toques: anular a linha"
              className={`grid grid-cols-[58px_1fr_118px] px-2 py-2 border-b border-black/15
                text-[16px] cursor-pointer ${sel === l.id ? 'bg-[#f0c000]' : 'hover:bg-black/5'}`}>
              <span className="text-black font-semibold">{Number(l.quantity)}</span>
              <span className="min-w-0">
                <span className="block text-black font-semibold truncate">{l.description}</span>

                {/* AS MENSAGENS, uma por linha e recuadas — é assim que a cozinha as
                    lê e é assim que o cliente as confere. Amarelas sobre o papel: veem-se
                    de relance sem competir com o nome do artigo. */}
                {(l.modifiers || []).map((m: any) => (
                  <span key={m.id}
                    className="block pl-3 text-[14px] font-bold italic text-[#8a6100] truncate">
                    {m.name}
                    {Number(m.price_delta) !== 0 && ` (${money(m.price_delta)})`}
                  </span>
                ))}
                {l.note && (
                  <span className="block pl-3 text-[14px] font-bold italic text-[#8a6100] truncate">{l.note}</span>
                )}

                {l._juntas > 1 && (
                  <span className="block text-[12px] text-black/45">{l._juntas} lançamentos juntos</span>
                )}
                {/* ALERGÉNIOS da ficha do artigo (backoffice) — o empregado avisa o
                    cliente ANTES de o prato sair, não depois. */}
                {l.allergens?.length > 0 && (
                  <span className="flex items-center gap-1 text-[12px] font-semibold text-[#b3140f]">
                    <IcoAviso size={13} /> {l.allergens.join(', ')}</span>
                )}
                {['FIRED', 'PREPARING', 'READY'].includes(l.kds_status) && (
                  <span className="block text-[12px] text-[#1f7a34] font-semibold">• na cozinha</span>
                )}
              </span>
              <span className="text-right text-black font-semibold">{money(l.line_total)}</span>
            </div>
          ))}
          {linhas.length === 0 && (
            <div className="text-black/40 text-center py-10 text-[15px]">
              A conta está vazia. Toque numa tecla para lançar.
            </div>
          )}
        </ZonaArrastavel>

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
        <div className="grid grid-cols-4 gap-[3px] bg-black p-[3px]">
          {/* 1. O CAIXOTE tem dois trabalhos, conforme o que está escolhido:
                 · com uma LINHA escolhida -> tira esse artigo (sem perguntas se ainda
                   não foi confirmado; com motivo se já foi para a produção)
                 · sem nada escolhido -> anula a CONTA inteira, sempre com motivo
                 Em nenhum dos casos se sai da venda: tirar um artigo é uma correcção,
                 não um fim de serviço. */}
          <BotaoComanda
            onClick={() => (temSel ? apagarLinha(linhaSel()) : setAnular(true))}
            on={!!linhas.length} cor="#e02020"
            titulo={temSel
              ? `Tirar "${linhaSel()?.description}" da conta`
              : 'Anular a conta inteira (pede o motivo)'}><IcoLixo size={36} /></BotaoComanda>
          {/* 2. CONSULTA — o talão de conferência (documento CM da AGT). O cliente
                 pergunta "quanto vai?" e mostra-se, sem fechar a conta. */}
          <BotaoComanda onClick={() => setVerTalao(true)} on={!!linhas.length} cor="#ffffff"
            titulo="Consulta de Mesa (talão de conferência)"><IcoImpressora size={36} /></BotaoComanda>
          {/* 3. VENDA — abre os Pagamentos. */}
          <BotaoComanda onClick={() => setPagar(true)} on={!!linhas.length} cor="#f0c000"
            titulo="Pagamentos"><IcoDinheiro size={36} /></BotaoComanda>
          {/* 4. CONFIRMAR — o pedido segue para a produção e volta-se à sala.
                 É AQUI que o pedido passa a estar confirmado: a partir deste toque,
                 tirar um artigo já exige motivo. Antes disto, a comanda ainda está a
                 ser composta e corrige-se à vontade. */}
          <BotaoComanda onClick={confirmarPedido} on cor="#2ecc40"
            titulo="Confirmar o pedido e voltar à sala"><IcoVisto size={38} /></BotaoComanda>
        </div>
      </div>

      {/* A FILA DE PERGUNTAS do artigo acabado de lançar. Responde-se a uma, passa à
          seguinte; no fim, todas as respostas ficam agarradas à linha. */}
      {perguntar && perguntar.fila.length > 0 && (
        <AskMessage
          titulo={perguntar.fila[0].name || perguntar.fila[0].code}
          opcoes={(perguntar.fila[0].options || []).filter((o: any) => o.is_active !== false)}
          onPick={(texto) => avancarPergunta([...perguntar.escolhas, texto])}
          onSkip={() => avancarPergunta(perguntar.escolhas)} />
      )}

      {/* TIRAR UM ARTIGO JÁ CONFIRMADO — motivo obrigatório, e fica-se na venda. */}
      {anularLinha && (
        <VoidReasonDialog titulo={`Anular "${anularLinha.description}"`}
          onClose={() => setAnularLinha(null)}
          onPick={(motivo) => apagarLinhaComMotivo(anularLinha, motivo)} />
      )}

      {/* ANULAR A VENDA — o motivo vem da lista do backoffice (ou texto livre). */}
      {anular && (
        <VoidReasonDialog titulo={`Anular a conta ${conta?.ticket_number || ''}`}
          onClose={() => setAnular(false)} onPick={anularConta} />
      )}

      {/* (+/−) do topo: o teclado numérico sobre a linha escolhida. */}
      {editarQtd && linhaSel() && (
        <NumPad titulo={linhaSel().description} subtitulo="Editar quantidade"
          inicial={String(Number(linhaSel().quantity))}
          onClose={() => setEditarQtd(false)}
          onOk={async (valor) => {
            const n = Number(valor.replace(',', '.'));
            setEditarQtd(false);
            if (!(n > 0)) return aviso('A quantidade tem de ser maior que zero. Para tirar o artigo, anule a linha.');
            await patchLinha({ quantity: n }, 'Não foi possível alterar a quantidade.');
          }} />
      )}

      {/* ✎ do topo: as mensagens de produção do backoffice, coladas à linha escolhida. */}
      {verMensagens && linhaSel() && (
        <MessagesPanel linha={linhaSel()} onClose={() => setVerMensagens(false)}
          onGravar={async (textos) => {
            setVerMensagens(false);
            try {
              await apiClient.post(`pos/ticket-lines/${linhaSel().id}/messages/`, { texts: textos });
              inval();
            } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível gravar as mensagens.'); }
          }} />
      )}

      {/* 👤+ do topo (e a abertura automática pelo 9311): quem leva a fatura. */}
      {escolherCliente && (
        <ClientPicker onClose={() => setEscolherCliente(false)}
          onPick={async (esc) => {
            setEscolherCliente(false);
            if (!esc.customer_name && !esc.entity) return;   // Consumidor Final: nada a gravar
            try {
              await apiClient.post(`pos/tickets/${tid}/set_customer/`, esc);
              inval();
            } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível guardar o cliente.'); }
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
        <EntitySearchPos
          onPick={(e) => { setEntidade(e); setEscolherEntidade(false); }}
          onClose={() => setEscolherEntidade(false)} />
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
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível lançar o combo.'); }
  };
  return (
    <Window title="Combos / Menus" width={560} onClose={onClose} tone="#8a6100">
      <div className="p-3 bg-[#1a1a1a] grid grid-cols-2 gap-2 max-h-[56vh] overflow-auto pos-arrasta">
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
    const nota = await pedir(`Destino: ${d.name}\n\nObservações para a entrega (opcional):`) || '';
    try {
      await apiClient.post(`pos/tickets/${tid}/set_destination/`, {
        dest_kind: 'DESTINATION', dest_ref: d.id, dest_note: nota || null,
      });
      onDone();
    } catch (e: any) { aviso(e?.response?.data?.detail || 'Não foi possível definir o destino.'); }
  };
  return (
    <Window title="Destino do pedido (entra nas Entregas)" width={520} onClose={onClose} tone="#1a4f8a">
      <div className="p-3 bg-[#1a1a1a] grid grid-cols-3 gap-2 max-h-[52vh] overflow-auto pos-arrasta">
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
      <div className="bg-[#1a1a1a] overflow-auto pos-arrasta" style={{ maxHeight: '60vh' }}>
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
