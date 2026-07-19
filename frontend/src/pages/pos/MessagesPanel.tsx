import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

/**
 * MENSAGENS PARA A PRODUÇÃO — "sem sal", "bem passado", "com adoçante".
 *
 * São TECLAS, não texto escrito à mão. A cozinha lê dezenas de comandas por serviço: se
 * cada empregado escrever à sua maneira ("s/ sal", "sem sall", "SEM-SAL"), a cozinha
 * hesita — e a hesitação sai cara em pratos devolvidos. A lista vem do backoffice
 * (Configuração POS › Mensagens de Produção) e é igual para toda a gente.
 *
 * As mensagens com OPÇÕES abrem-se num segundo nível: "Ponto" → mal passado / no ponto /
 * bem passado. É o que evita ter trinta teclas onde bastam sete.
 */
export default function MessagesPanel({ linha, onPick, onClose }: {
  /** a linha da comanda a que a mensagem se cola */
  linha: any;
  onPick: (texto: string) => void;
  onClose: () => void;
}) {
  const [aberta, setAberta] = useState<any | null>(null);

  const { data: msgs = [], isLoading } = useQuery({
    queryKey: ['pos-kitchen-messages'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/kitchen-messages/');
      return ((r.data?.results || r.data || []) as any[]).filter((m) => m.is_active !== false);
    },
  });

  const opcoes = (aberta?.options || []).filter((o: any) => o.is_active !== false);

  return (
    <div className="absolute inset-0 bg-[#2b2b2b] z-30 flex flex-col">
      <div className="h-[56px] flex items-center justify-center gap-2 border-b border-black/60 flex-shrink-0">
        <span className="text-[#7fd4ff] text-[22px]">✎</span>
        <span className="text-white text-[22px] font-bold">
          Mensagens{aberta ? ` — ${aberta.name}` : ''}
        </span>
        <span className="absolute right-4 text-white/50 text-[14px] truncate max-w-[40%]">
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

        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
          {!aberta && msgs.map((m: any) => (
            <button key={m.id}
              onClick={() => ((m.options || []).length ? setAberta(m) : onPick(m.name))}
              className="h-[124px] rounded bg-[#3a3a3a] hover:bg-[#454545] text-white
                text-[16px] font-semibold px-2 text-center leading-tight active:scale-95">
              {m.name}
              {(m.options || []).length > 0 && (
                <span className="block text-[11px] font-normal text-white/50 mt-1">
                  {(m.options || []).length} opções
                </span>
              )}
            </button>
          ))}
          {aberta && opcoes.map((o: any) => (
            <button key={o.id} onClick={() => onPick(`${aberta.name}: ${o.text}`)}
              className="h-[124px] rounded bg-[#3a3a3a] hover:bg-[#454545] text-white
                text-[16px] font-semibold px-2 text-center leading-tight active:scale-95">
              {o.text}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 p-2 bg-black flex-shrink-0">
        {/* VOLTAR sobe um nível (das opções para as mensagens) antes de fechar: quem
            entrou por engano em "Ponto" não quer perder o painel todo. */}
        <button onClick={() => (aberta ? setAberta(null) : onClose())}
          className="h-[64px] bg-[#3a3a3a] text-white text-[18px] rounded">
          {aberta ? '⬅ Voltar' : '✖ Fechar'}
        </button>
        {/* LIMPAR tira a mensagem da linha — o cliente mudou de ideias. */}
        <button onClick={() => onPick('')}
          className="h-[64px] bg-[#2b2b2b] text-white/80 text-[18px] rounded">🧽 Sem mensagem</button>
      </div>
    </div>
  );
}
