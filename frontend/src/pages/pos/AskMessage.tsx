/**
 * A PERGUNTA DO ARTIGO — "GELO: com gelo ou sem gelo?"
 *
 * Aparece no instante em que o artigo é lançado, com o cliente ainda à frente. É a
 * diferença entre perguntar agora e ter de voltar à mesa — ou, pior, mandar para o bar
 * um pedido incompleto e o bar decidir por conta própria.
 *
 * Quem manda é o BACKOFFICE: a mensagem tem de estar marcada como "perguntar ao lançar"
 * e ligada (ou não) a artigos. Uma pergunta que não faz sentido no prato — "com gelo?"
 * num bacalhau — ensina o empregado a carregar em qualquer coisa para se ver livre dela,
 * e a partir daí ele deixa de ler as perguntas todas.
 *
 * SALTAR é sempre possível: nem toda a gente quer responder a tudo, e uma pergunta
 * obrigatória à frente de uma fila é uma fila parada.
 */
export default function AskMessage({ titulo, opcoes, onPick, onSkip }: {
  titulo: string;
  opcoes: { id: any; text: string }[];
  onPick: (texto: string) => void;
  onSkip: () => void;
}) {
  return (
    <div className="absolute inset-0 bg-black/45 flex items-start justify-center pt-6 z-40">
      <div className="w-[880px] max-w-[92%] bg-[#2b2b2b] border-2 border-black shadow-2xl flex flex-col
        max-h-[86%]">
        {/* O cabeçalho diz O QUE se está a perguntar — verde-azulado, como no original,
            para não se confundir com o vermelho das anulações. */}
        <div className="h-[68px] bg-gradient-to-b from-[#158a8c] to-[#0c5f61] border-b-2 border-black
          flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[26px] font-bold tracking-wide">{titulo}</span>
        </div>

        <div className="flex-1 overflow-auto">
          {opcoes.map((o) => (
            <button key={o.id} onClick={() => onPick(o.text)}
              className="w-full h-[64px] px-6 text-left text-white text-[20px]
                bg-gradient-to-b from-[#454545] to-[#2e2e2e] border-b border-black
                hover:from-[#565656] hover:to-[#3a3a3a]
                active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]">
              {o.text}
            </button>
          ))}
        </div>

        <button onClick={onSkip}
          className="h-[62px] text-white/70 text-[17px] bg-[#1f1f1f] border-t-2 border-black
            flex-shrink-0 hover:text-white">
          Sem resposta — seguir
        </button>
      </div>
    </div>
  );
}
