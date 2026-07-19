import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { IcoLapis, IcoVoltar, IcoLimpar } from './Icons';
import TouchKeyboard from './TouchKeyboard';

/**
 * MENSAGENS PARA A PRODUÇÃO — "sem gelo", "bem passado", "com adoçante".
 *
 * Há DUAS maneiras de as pôr, e não é redundância:
 *   · o artigo PERGUNTA sozinho ao ser lançado (as marcadas no backoffice) — ver AskMessage
 *   · e este painel, pelo lápis, para acrescentar ou corrigir a qualquer momento
 * A primeira serve o ritmo do balcão; a segunda serve o cliente que muda de ideias.
 *
 * São TECLAS, não texto escrito à mão. A cozinha lê dezenas de comandas por serviço: se
 * cada empregado escrever à sua maneira ("s/ gelo", "sem gello", "SEM-GELO"), a cozinha
 * hesita — e a hesitação sai cara em pratos devolvidos.
 *
 * Uma linha leva VÁRIAS mensagens (SEM GELO + PITAYA): as escolhidas ficam acesas e
 * empilham-se por baixo do artigo na comanda.
 */
export default function MessagesPanel({ linha, onGravar, onClose }: {
  /** a linha da comanda a que as mensagens se colam */
  linha: any;
  /** a lista COMPLETA de mensagens da linha (substitui o que lá estava) */
  onGravar: (textos: string[]) => void;
  onClose: () => void;
}) {
  // O que a linha já tem — é daqui que se parte, para se poder tirar.
  const [escolhidas, setEscolhidas] = useState<string[]>(
    (linha?.modifiers || []).map((m: any) => m.name));
  const [grupo, setGrupo] = useState<any | null>(null);
  const [livre, setLivre] = useState<string | null>(null);

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['pos-kitchen-messages'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/kitchen-messages/');
      return ((r.data?.results || r.data || []) as any[]).filter((m) => m.is_active !== false);
    },
  });

  const alternar = (t: string) => setEscolhidas((v) =>
    v.includes(t) ? v.filter((x) => x !== t) : [...v, t]);

  const opcoes = (grupo?.options || []).filter((o: any) => o.is_active !== false);

  const Tecla = ({ texto, aceso, onClick, sub }: {
    texto: string; aceso?: boolean; onClick: () => void; sub?: string;
  }) => (
    <button onClick={onClick}
      className={`h-[130px] rounded-[3px] px-2 text-center leading-tight border-2 border-black
        flex flex-col items-center justify-center gap-1
        shadow-[inset_0_2px_0_rgba(255,255,255,0.16),inset_0_-2px_0_rgba(0,0,0,0.5)]
        active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]
        ${aceso ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white ring-[3px] ring-white/80 ring-inset'
          : 'bg-gradient-to-b from-[#4a4a4a] to-[#262626] text-white'}`}>
      <span className="text-[16px] font-semibold">{texto}</span>
      {sub && <span className="text-[11px] font-normal text-white/55">{sub}</span>}
    </button>
  );

  return (
    <div className="absolute inset-0 bg-[#2b2b2b] z-30 flex flex-col">
      <div className="h-[58px] flex items-center justify-center gap-2 border-b-2 border-black flex-shrink-0
        relative bg-gradient-to-b from-[#3a3a3a] to-[#2b2b2b]">
        <span className="text-[#7fd4ff]"><IcoLapis size={24} /></span>
        <span className="text-white text-[22px] font-bold">
          Mensagens{grupo ? ` — ${grupo.name || grupo.code}` : ''}
        </span>
        <span className="absolute right-4 text-white/50 text-[14px] truncate max-w-[36%]">
          {linha?.description}
        </span>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {isLoading && <div className="text-white/60 p-4">A ler as mensagens…</div>}

        {!isLoading && msgs.length === 0 && (
          <div className="text-white/60 p-4 text-[15px] leading-relaxed">
            Ainda não há mensagens configuradas.<br />
            Crie-as em <b className="text-white">Configuração POS › Mensagens de Produção</b> —
            aparecem aqui como teclas, para toda a equipa escrever o mesmo.
          </div>
        )}

        {livre !== null ? (
          <div>
            <div className="h-[58px] bg-black rounded-[3px] text-white text-[20px] px-4 flex items-center
              border-2 border-[#4a4a4a] mb-2">
              {livre || <span className="text-white/25">Escreva a mensagem…</span>}
            </div>
            <TouchKeyboard valor={livre} setValor={setLivre}
              onOk={() => { if (livre.trim()) { alternar(livre.trim()); setLivre(null); } }} />
          </div>
        ) : (
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))' }}>
            {!grupo && (
              <>
                {/* TEXTO LIVRE em primeiro, como no original: o caso que a lista não
                    previu tem de ter saída, senão escolhe-se a mensagem errada. */}
                <Tecla texto="Texto Livre" onClick={() => setLivre('')} />
                {msgs.map((m: any) => {
                  const temOpcoes = (m.options || []).length > 0;
                  const nome = m.name || m.code;
                  return (
                    <Tecla key={m.id} texto={nome}
                      sub={temOpcoes ? `${m.options.length} opções` : undefined}
                      aceso={!temOpcoes && escolhidas.includes(nome)}
                      onClick={() => (temOpcoes ? setGrupo(m) : alternar(nome))} />
                  );
                })}
              </>
            )}
            {grupo && opcoes.map((o: any) => (
              <Tecla key={o.id} texto={o.text} aceso={escolhidas.includes(o.text)}
                onClick={() => alternar(o.text)} />
            ))}
          </div>
        )}
      </div>

      {/* O QUE ESTÁ ESCOLHIDO, à vista — sem isto o empregado não sabe o que já pôs
          antes de gravar, e acaba a pôr a mesma mensagem duas vezes. */}
      {escolhidas.length > 0 && livre === null && (
        <div className="px-3 py-2 bg-[#1a1a1a] border-t-2 border-black flex flex-wrap gap-2 flex-shrink-0">
          {escolhidas.map((t) => (
            <button key={t} onClick={() => alternar(t)} title="Tocar para tirar"
              className="px-3 h-[34px] rounded-[3px] bg-[#8a6100] text-white text-[14px] font-bold
                border border-black">{t} ✕</button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2 p-2 bg-black flex-shrink-0">
        <button onClick={() => (livre !== null ? setLivre(null) : grupo ? setGrupo(null) : onClose())}
          className="h-[66px] rounded-[3px] border-2 border-black text-white text-[17px]
            bg-gradient-to-b from-[#4a4a4a] to-[#262626] flex items-center justify-center gap-2
            shadow-[inset_0_2px_0_rgba(255,255,255,0.16)]">
          <IcoVoltar size={22} /> {livre !== null || grupo ? 'Voltar' : 'Fechar'}
        </button>
        <button onClick={() => setEscolhidas([])}
          className="h-[66px] rounded-[3px] border-2 border-black text-white/80 text-[17px]
            bg-gradient-to-b from-[#4a4a4a] to-[#262626] flex items-center justify-center gap-2
            shadow-[inset_0_2px_0_rgba(255,255,255,0.16)]">
          <IcoLimpar size={22} /> Limpar
        </button>
        <button onClick={() => onGravar(escolhidas)}
          className="h-[66px] rounded-[3px] border-2 border-black text-white text-[19px] font-bold
            bg-gradient-to-b from-[#2b9c48] to-[#125c26]
            shadow-[inset_0_2px_0_rgba(255,255,255,0.2)]">Gravar</button>
      </div>
    </div>
  );
}
