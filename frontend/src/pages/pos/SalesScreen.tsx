import { useEffect, useState } from 'react';
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
export default function SalesScreen({ ticketId, setor, cfg, onClose }: {
  ticketId: number; setor: any; cfg?: any; onClose: () => void;
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

  const enviarCozinha = async () => {
    try {
      const r = await apiClient.post(`pos/tickets/${tid}/fire_kitchen/`, {});
      if (r.data?.print_warnings?.length) alert(r.data.print_warnings.join('\n'));
      inval();
    } catch (e: any) { alert(e?.response?.data?.detail || 'Erro ao enviar para a cozinha.'); }
  };

  const linhas: any[] = conta?.lines || [];
  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

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
          {/* consultas SEM sair da venda — artigos, hóspedes e documentos (a junção) */}
          <button onClick={() => setProcurar(true)}
            className="h-[30px] px-3 bg-[#2b2b2b] rounded text-[13px]">🔍 Artigos</button>
          <button onClick={() => setPainel('GUESTS')}
            className="h-[30px] px-3 bg-[#2b2b2b] rounded text-[13px]">👤 Hóspedes</button>
          <button onClick={() => setPainel('DOCS')}
            className="h-[30px] px-3 bg-[#2b2b2b] rounded text-[13px]">🗎 Docs</button>
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
                {k.price && <span className="text-[14px] opacity-95">{money(k.price)}</span>}
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
        {/* quem paga */}
        <button onClick={() => setEscolherEntidade(true)}
          className="h-[54px] bg-[#2b2b2b] text-white flex items-center justify-between px-4 border-b border-black">
          <span className="text-[15px] text-white/60">Entidade</span>
          <span className="font-bold">{entidade ? entidade.name : 'Venda Direta'} 👤+</span>
        </button>

        <div className="grid grid-cols-[64px_1fr_120px] bg-[#2b2b2b] text-white text-[16px] font-bold px-2 py-2">
          <span>Qtd</span><span>Descrição</span><span className="text-right">Total</span>
        </div>

        <div className="flex-1 overflow-auto bg-[#8a8a8a]/20">
          {linhas.map((l) => (
            <div key={l.id} onDoubleClick={() => apagarLinha(l)}
              className="grid grid-cols-[64px_1fr_120px] px-2 py-2 text-white border-b border-black/20 text-[15px]">
              <span>{Number(l.quantity)}</span>
              <span className="truncate">
                {l.description}
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

        <div className="grid grid-cols-6 gap-px bg-black">
          {/* CONSULTA DE MESA — o talão de conferência DESTA conta (documento CM da
              AGT), sem sair da venda. O cliente pergunta "quanto vai?" e mostra-se. */}
          <button onClick={() => setVerTalao(true)} disabled={!linhas.length}
            title="Consulta de Mesa (talão de conferência)"
            className="h-[76px] bg-[#2b2b2b] text-white text-[30px] disabled:opacity-30">🖨</button>
          {/* ANULAR A CONTA INTEIRA — a mesa aberta por engano, o cliente que se foi
              embora. Obriga a motivo (fica na auditoria) e liberta a mesa. É o mesmo
              `void` do motor que o backoffice e o Fecho do Dia usam. */}
          <button onClick={async () => {
            const motivo = window.prompt(
              `ANULAR a conta ${conta?.ticket_number || ''}?\n\nA mesa fica livre e a anulação fica na auditoria.\n\nMotivo:`);
            if (!motivo) return;
            try {
              await apiClient.post(`pos/tickets/${tid}/void/`, { reason: motivo });
              inval();
              onClose();
            } catch (e: any) { alert(e?.response?.data?.detail || 'Não foi possível anular.'); }
          }}
            title="Anular a conta (mesa aberta por engano)"
            className="h-[76px] bg-[#2b2b2b] text-[#e02020] text-[26px] font-bold">✕</button>
          <button onClick={() => linhas.length && apagarLinha(linhas[linhas.length - 1])}
            title="Apagar a última linha"
            className="h-[76px] bg-[#2b2b2b] text-[#e02020] text-[30px]">🗑</button>
          <button onClick={enviarCozinha}
            title="Enviar para a cozinha"
            className="h-[76px] bg-[#2b2b2b] text-white text-[30px]">🖨</button>
          <button onClick={() => setPagar(true)} disabled={!linhas.length}
            className="h-[76px] bg-[#2b2b2b] text-[#f0c000] text-[30px] disabled:opacity-30">💰</button>
          <button onClick={onClose}
            className="h-[76px] bg-[#2b2b2b] text-[#2ecc40] text-[34px]">✔</button>
        </div>
      </div>

      {/* hóspedes e documentos — os painéis do backoffice, dentro da venda */}
      {painel === 'GUESTS' && <GuestsPanel aba="GUESTS" onClose={() => setPainel('')} />}
      {painel === 'DOCS' && <DocsPanel onClose={() => setPainel('')} />}

      {/* Consulta de Mesa desta conta: emite o CM e mostra o talão térmico */}
      {verTalao && conta && (
        <TicketPreview ticket={conta} onClose={() => setVerTalao(false)} />
      )}

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
