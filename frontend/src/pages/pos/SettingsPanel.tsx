import { IcoCruz } from './Icons';

/**
 * O PAINEL DA ENGRENAGEM — as funções do terminal, dentro do balcão de venda.
 *
 * A engrenagem saltava para o SELETOR DE SETOR: o empregado que queria abrir a gaveta,
 * reimprimir um documento ou fechar a caixa era atirado para fora da venda e perdia a
 * conta de vista. Trocar de setor é uma coisa que se faz uma vez ao início do turno —
 * não é o que está por trás do botão que se carrega dez vezes por serviço.
 *
 * Agora abre AQUI, por cima do teclado, com a COMANDA sempre à direita: as abas mudam
 * as funções, a conta continua à vista, e fecha-se de volta para onde se estava.
 *
 * As abas são as três perguntas do turno:
 *   CONTA  — o que mexe nesta conta (preço, quantidade, descontos, mensagens)
 *   GERAL  — o que é do terminal (gaveta, documentos, impressoras, password)
 *   CAIXA  — o que é do dinheiro (sangria, fecho, resumo de vendas)
 *
 * Um botão sem motor NÃO se esconde: fica apagado e diz porquê ao passar o dedo. Esconder
 * era deixar o empregado à procura de uma tecla que ele sabe que existe.
 */

export type AcaoPainel = {
  label: string;
  /** ícone DESENHADO (ver Icons.tsx) — nunca emoji: o emoji é do sistema, não nosso */
  icon: any;
  act: () => void;
  /** false = apagado (sem conta aberta, sem caixa, sem permissão) */
  on?: boolean;
  /** o que dizer a quem carrega num botão apagado */
  why?: string;
  /** botão de estado (ligado/desligado), como "Visualizar Preços" */
  ativo?: boolean;
  /** vermelho: destrói (anular tudo) */
  perigo?: boolean;
};

export type AbaPainel = { nome: string; titulo: string; acoes: AcaoPainel[] };

export default function SettingsPanel({ abas, aba, onAba, onClose, direita = 0, flutuante = false }: {
  abas: AbaPainel[];
  aba: string;
  onAba: (nome: string) => void;
  onClose: () => void;
  /** espaço a deixar à direita para a comanda não ser tapada (px) */
  direita?: number;
  /**
   * FORA DA VENDA é um POPUP: flutua por cima do mapa, que continua a ver-se à volta.
   * Colado ao ecrã inteiro tapava a sala toda para abrir uma gaveta — e o empregado
   * perdia de vista as mesas enquanto o fazia. Dentro da venda é que encosta, para a
   * comanda ficar ao lado.
   */
  flutuante?: boolean;
}) {
  const atual = abas.find((a) => a.nome === aba) || abas[0];

  const corpo = (
    <div className={flutuante
      ? 'flex w-[940px] h-[700px] max-w-[94vw] max-h-[86vh] bg-[#2b2b2b] shadow-2xl border-2 border-black'
      : 'absolute inset-y-0 left-0 flex bg-[#2b2b2b] z-30 border-t border-black'}
      style={flutuante ? undefined : { right: direita }}
      onClick={(e) => e.stopPropagation()}>
      {/* ─── as abas, à esquerda ─── */}
      <div className="w-[278px] bg-[#1a1a1a] flex flex-col flex-shrink-0 border-r border-black">
        {abas.map((a) => (
          <button key={a.nome} onClick={() => onAba(a.nome)}
            className={`h-[64px] px-6 text-left text-[19px] border-b border-black/60 transition
              ${a.nome === atual?.nome
                ? 'bg-[#b39100] text-white font-bold' : 'text-white/80 hover:bg-[#2a2a2a]'}`}>
            {a.nome}
          </button>
        ))}
        <div className="flex-1" />
        {/* FECHAR devolve ao sítio de onde se veio — a venda continua onde estava. */}
        <button onClick={onClose}
          className="h-[80px] m-2 rounded-[3px] text-white flex items-center justify-center
            border-2 border-black bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]
            shadow-[inset_0_2px_0_rgba(255,255,255,0.2),inset_0_-2px_0_rgba(0,0,0,0.5)]
            active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
          <IcoCruz size={38} />
        </button>
      </div>

      {/* ─── as funções da aba ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-[56px] flex items-center justify-center text-white text-[22px] font-bold
          border-b border-black/60 flex-shrink-0">
          {atual?.titulo}
        </div>
        <div className="flex-1 overflow-auto pos-arrasta p-3">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {(atual?.acoes || []).map((a) => {
              const apagado = a.on === false;
              return (
                <button key={a.label} disabled={apagado}
                  title={apagado ? (a.why || 'Indisponível agora') : a.label}
                  onClick={a.act}
                  className={`h-[140px] rounded-[3px] flex flex-col items-center justify-center gap-2.5
                    px-2 text-center leading-tight border-2 border-black
                    shadow-[inset_0_2px_0_rgba(255,255,255,0.16),inset_0_-2px_0_rgba(0,0,0,0.5)]
                    active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
                    disabled:opacity-30 disabled:shadow-none disabled:cursor-not-allowed
                    ${a.ativo
                      ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] ring-[3px] ring-white/80 ring-inset'
                      : 'bg-gradient-to-b from-[#4a4a4a] to-[#262626]'}`}>
                  <span className={a.perigo ? 'text-[#e02020]' : 'text-white'}>{a.icon}</span>
                  <span className={`text-[15px] font-semibold ${a.perigo ? 'text-[#e02020]' : 'text-white'}`}>
                    {a.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );

  // Encostado (dentro da venda) devolve-se tal e qual; POPUP leva o fundo escurecido,
  // e tocar fora fecha — como qualquer janela do terminal.
  if (!flutuante) return corpo;
  return (
    <div className="absolute inset-0 z-30 bg-black/50 flex items-center justify-center"
      onClick={onClose}>
      {corpo}
    </div>
  );
}
