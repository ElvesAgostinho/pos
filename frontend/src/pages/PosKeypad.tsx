import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

/**
 * O TECLADO DO TERMINAL — desenhado a partir do que foi configurado, não inventado aqui.
 *
 * Antes, o terminal mostrava os artigos por categoria e ignorava o teclado: quem passava
 * a tarde a montar as páginas, as pastas e as cores em Configuração POS › Teclados não
 * via NADA mudar no ecrã do empregado. Um teclado que ninguém vê é trabalho deitado fora.
 *
 * Tudo o que se liga ou desliga na configuração aparece (ou desaparece) aqui:
 *   · as PÁGINAS (a fila de cima) e as PASTAS (que abrem outro nível);
 *   · as CORES de fundo e de texto de cada tecla;
 *   · o número de COLUNAS da grelha;
 *   · "Visualizar Códigos" → o código sai escrito na tecla;
 *   · "Visualizar Preços"  → o preço sai escrito na tecla;
 *   · o NÍVEL DE PREÇO do teclado → o mesmo artigo custa outro preço neste posto;
 *   · um artigo INATIVO fica com a tecla apagada (não se tira do sítio: o empregado tem
 *     o mapa das teclas na cabeça e carregaria na errada).
 */
export default function PosKeypad({ terminalId, onPick }: {
  terminalId?: number;
  onPick: (key: { item: number; label: string }) => void;
}) {
  const [caminho, setCaminho] = useState<any[]>([]);   // navegação: página → pasta → …

  const { data } = useQuery({
    queryKey: ['pos-keypad', terminalId],
    queryFn: async () => (await apiClient.get('pos/terminal/keyboard/', {
      params: terminalId ? { terminal: terminalId } : undefined,
    })).data,
  });

  if (!data) return <div className="p-6 text-white/50">A carregar o teclado…</div>;
  if (!data.keyboard) {
    return (
      <div className="p-6 text-white/60 text-sm">
        Não há teclados configurados. Crie um em <b>Configuração POS › Parâmetros › Teclados</b>.
      </div>
    );
  }

  const kb = data.keyboard;
  const nivel: any[] = caminho.length
    ? (caminho[caminho.length - 1].children || [])
    : data.pages;

  const clique = (k: any) => {
    if (k.kind === 'ITEM' && k.item) {
      if (!k.available) return;
      onPick({ item: k.item, label: k.label });
      return;
    }
    setCaminho([...caminho, k]);      // página ou pasta: desce um nível
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Onde estou — e como voltar */}
      <div className="flex items-center gap-2 px-3 py-2 text-white/70 text-sm">
        <button onClick={() => setCaminho([])}
          className="px-2 py-1 rounded bg-[#1b2636] border border-[#2a4a66]">
          {kb.name}
        </button>
        {caminho.map((c, i) => (
          <span key={c.id} className="flex items-center gap-2">
            <span className="text-white/30">›</span>
            <button onClick={() => setCaminho(caminho.slice(0, i + 1))}
              className="px-2 py-1 rounded" style={{ background: c.color, color: c.text_color }}>
              {c.label}
            </button>
          </span>
        ))}
        {caminho.length > 0 && (
          <button onClick={() => setCaminho(caminho.slice(0, -1))}
            className="ml-auto px-3 py-1 rounded bg-[#1b2636] border border-[#2a4a66]">
            ◀ Recuar
          </button>
        )}
      </div>

      {/* A grelha, com as colunas que o teclado manda */}
      <div className="flex-1 overflow-auto p-3">
        <div className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${kb.cols || 4}, minmax(0, 1fr))` }}>
          {nivel.map((k: any) => (
            <button key={k.id} onClick={() => clique(k)} disabled={k.available === false}
              style={{
                background: k.available === false ? '#3a3a3a' : k.color,
                color: k.available === false ? '#8a8a8a' : k.text_color,
                gridColumn: k.span > 1 ? `span ${k.span}` : undefined,
              }}
              className="h-24 rounded-md font-bold text-[15px] flex flex-col items-center justify-center px-2 text-center leading-tight disabled:cursor-not-allowed">
              <span>{k.label}</span>
              {/* "Visualizar Códigos" e "Visualizar Preços": só saem se as caixas estiverem ligadas */}
              {k.code && <span className="text-[11px] font-normal opacity-80 mt-0.5">{k.code}</span>}
              {k.price && (
                <span className="text-[13px] font-semibold opacity-95 mt-0.5">
                  {Number(k.price).toLocaleString('pt-PT', { minimumFractionDigits: 2 })}
                </span>
              )}
              {k.available === false && (
                <span className="text-[10px] mt-0.5">indisponível</span>
              )}
            </button>
          ))}
          {nivel.length === 0 && (
            <div className="col-span-full text-center text-white/40 py-10">
              Esta página não tem teclas. Acrescente-as em Configuração POS › Teclados.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
