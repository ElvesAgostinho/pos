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
  icon: string;
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

export default function SettingsPanel({ abas, aba, onAba, onClose, direita = 0 }: {
  abas: AbaPainel[];
  aba: string;
  onAba: (nome: string) => void;
  onClose: () => void;
  /** espaço a deixar à direita para a comanda não ser tapada (px) */
  direita?: number;
}) {
  const atual = abas.find((a) => a.nome === aba) || abas[0];

  return (
    <div className="absolute inset-y-0 left-0 flex bg-[#2b2b2b] z-30 border-t border-black"
      style={{ right: direita }}>
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
          className="h-[76px] m-2 rounded bg-[#c0140f] text-white text-[34px] font-bold active:scale-95">
          ✕
        </button>
      </div>

      {/* ─── as funções da aba ─── */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-[56px] flex items-center justify-center text-white text-[22px] font-bold
          border-b border-black/60 flex-shrink-0">
          {atual?.titulo}
        </div>
        <div className="flex-1 overflow-auto p-3">
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {(atual?.acoes || []).map((a) => {
              const apagado = a.on === false;
              return (
                <button key={a.label} disabled={apagado}
                  title={apagado ? (a.why || 'Indisponível agora') : a.label}
                  onClick={a.act}
                  className={`h-[136px] rounded flex flex-col items-center justify-center gap-2 px-2
                    text-center leading-tight active:scale-95 transition
                    disabled:opacity-30 disabled:cursor-not-allowed
                    ${a.ativo ? 'bg-[#b39100] ring-2 ring-white/70' : 'bg-[#3a3a3a] hover:bg-[#454545]'}`}>
                  <span className={`text-[38px] ${a.perigo ? 'text-[#e02020]' : ''}`}>{a.icon}</span>
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
}
