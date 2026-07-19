import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { useArrastar } from './useArrastar';
import { IcoLupa, IcoVisto, IcoCruz, IcoMaiusculas, IcoVoltar } from './Icons';

/**
 * ARTIGOS — procurar no catálogo INTEIRO, não no teclado.
 *
 * O teclado tem as teclas do dia-a-dia; o catálogo pode ter milhares de artigos e não
 * cabem todos em teclas. Quando o cliente pede o vinho que não está no teclado,
 * procura-se aqui — por nome, código, código de barras ou PLU — e lança-se com um toque.
 *
 * SEM SCROLL. Uma lista que rola lê-se com o dedo a tapar metade dela, e nunca se sabe
 * onde acaba. Aqui os artigos são TECLAS, do tamanho das do teclado, e mudam-se de
 * PÁGINA — o mesmo gesto do resto do terminal.
 *
 * O teclado FLUTUA e ARRASTA-SE: parado no meio, tapava justamente os artigos que a
 * pesquisa acabou de encontrar.
 *
 * A pesquisa é a do servidor (?q=): não se carrega o catálogo para o terminal, e o preço
 * é sempre o dele — o terminal nunca inventa preços.
 */

const RELEVO = 'border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),'
  + 'inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]';
const CINZA = 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]';
const LETRAS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '7', '8', '9'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç', '4', '5', '6'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '@', ',', '1', '2', '3'],
];
const POR_PAGINA = 20;   // 4 colunas x 5 linhas — teclas de dedo, sem rolar

export default function ArticleSearch({ onPick, onClose }: {
  onPick: (item: any) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');
  const [maiusc, setMaiusc] = useState(false);
  const [teclado, setTeclado] = useState(true);
  const [pagina, setPagina] = useState(0);
  const { ref, pegar, pos } = useArrastar();

  const { data: artigos = [], isFetching } = useQuery({
    queryKey: ['pos-art-search', busca],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/', {
        params: { q: busca, state: 'ACTIVE', module: 'SALE' },
      });
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: busca.length >= 2,
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const paginas = Math.max(1, Math.ceil(artigos.length / POR_PAGINA));
  const p = Math.min(pagina, paginas - 1);
  const vista = artigos.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA);

  const procurar = () => { setBusca(texto.trim()); setPagina(0); setTeclado(false); };
  const tecla = (t: string) => {
    if (t === 'C') return setTexto('');
    if (t === '⌫') return setTexto(texto.slice(0, -1));
    setTexto(texto + (maiusc ? t.toUpperCase() : t));
    if (maiusc) setMaiusc(false);
  };

  return (
    <div className="fixed inset-0 bg-black/55 flex items-start justify-center pt-4 z-50">
      <div className="w-[1500px] max-w-[97vw] h-[92vh] bg-[#2b2b2b] border-[3px] border-black
        shadow-2xl flex flex-col">

        <div className="h-[62px] bg-gradient-to-b from-[#4a4a4a] to-[#2e2e2e] border-b-2 border-black
          flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[25px] font-bold">Artigos</span>
        </div>

        {/* a caixa de pesquisa + a lupa, como no original */}
        <div className="flex gap-1 p-1 flex-shrink-0">
          <button onClick={() => setTeclado(true)}
            className="flex-1 h-[62px] bg-[#8a8a8a] border-2 border-black text-left px-4
              text-white text-[19px] italic truncate">
            {texto || <span className="text-white/45">Selecione os critérios e prima Pesquisar</span>}
          </button>
          <button onClick={procurar}
            className={`w-[130px] h-[62px] rounded-[3px] flex items-center justify-center
              text-white ${RELEVO} ${CINZA}`}>
            <IcoLupa size={32} />
          </button>
        </div>

        {/* OS ARTIGOS — teclas, não linhas de lista. */}
        <div className="flex-1 p-1 min-h-0">
          {busca.length < 2 && (
            <div className="h-full flex items-center justify-center text-white/40 text-[17px]">
              Escreva pelo menos 2 letras — nome, código, código de barras ou PLU.
            </div>
          )}
          {busca.length >= 2 && isFetching && (
            <div className="h-full flex items-center justify-center text-white/50 text-[17px]">A procurar…</div>
          )}
          {busca.length >= 2 && !isFetching && artigos.length === 0 && (
            <div className="h-full flex items-center justify-center text-white/40 text-[17px]">
              Nenhum artigo encontrado.
            </div>
          )}
          {vista.length > 0 && (
            <div className="grid gap-1.5 h-full"
              style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gridAutoRows: '1fr' }}>
              {vista.map((a: any) => (
                <button key={a.id} onClick={() => onPick(a)}
                  className={`rounded-[3px] px-2 flex flex-col items-center justify-center gap-1
                    text-center leading-tight text-white ${RELEVO}
                    bg-gradient-to-b from-[#2e8b3f] to-[#14561f]`}>
                  <span className="text-[17px] font-bold">{a.name}</span>
                  <span className="text-[13px] text-white/70">{a.code}</span>
                  <span className="text-[16px] font-bold">{money(a.sale_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* PÁGINAS em vez de scroll */}
        {artigos.length > POR_PAGINA && (
          <div className="flex items-center justify-center gap-2 py-1 flex-shrink-0">
            <button onClick={() => setPagina(Math.max(0, p - 1))} disabled={p === 0}
              className={`w-[96px] h-[48px] rounded-[3px] flex items-center justify-center text-white
                ${RELEVO} ${CINZA} disabled:opacity-25`}>
              <IcoVoltar size={24} />
            </button>
            <span className="text-white text-[17px] font-bold px-3">
              {p + 1} / {paginas} · {artigos.length} artigos
            </span>
            <button onClick={() => setPagina(Math.min(paginas - 1, p + 1))} disabled={p >= paginas - 1}
              className={`w-[96px] h-[48px] rounded-[3px] flex items-center justify-center text-white
                ${RELEVO} ${CINZA} disabled:opacity-25 rotate-180`}>
              <IcoVoltar size={24} />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 p-1 bg-black flex-shrink-0">
          <button onClick={procurar}
            className={`h-[64px] rounded-[3px] flex items-center justify-center text-[#2ecc40] ${RELEVO} ${CINZA}`}>
            <IcoVisto size={30} />
          </button>
          <button onClick={onClose}
            className={`h-[64px] rounded-[3px] flex items-center justify-center text-[#e02020] ${RELEVO} ${CINZA}`}>
            <IcoCruz size={30} />
          </button>
        </div>
      </div>

      {/* O TECLADO — flutua e arrasta-se pela pega. */}
      {teclado && (
        <div ref={ref} className="fixed bg-[#1f1f1f] border-[3px] border-black shadow-2xl z-[60]"
          style={pos ? { left: pos.x, top: pos.y } : { left: '50%', top: 210, transform: 'translateX(-50%)' }}>
          <div onMouseDown={pegar} onTouchStart={pegar}
            className="h-[34px] flex items-center px-3 gap-1 bg-[#3a3a3a] border-b-2 border-black
              cursor-grab active:cursor-grabbing select-none">
            <span className="w-[42px] flex flex-col gap-[3px] opacity-50">
              <span className="h-[2px] bg-white rounded" />
              <span className="h-[2px] bg-white rounded" />
              <span className="h-[2px] bg-white rounded" />
            </span>
            <span className="flex-1 text-center text-white/70 text-[13px]">arraste para mover</span>
          </div>

          <div className="p-2 space-y-1">
            {LETRAS.map((linha, i) => (
              <div key={i} className="grid gap-1"
                style={{ gridTemplateColumns: `repeat(${linha.length}, minmax(0,1fr))` }}>
                {linha.map((t) => (
                  <button key={t} onClick={() => tecla(t)}
                    className={`h-[58px] w-[66px] rounded-[3px] text-white text-[20px] font-bold ${RELEVO} ${CINZA}`}>
                    {maiusc ? t.toUpperCase() : t}
                  </button>
                ))}
              </div>
            ))}
            <div className="grid gap-1" style={{ gridTemplateColumns: '1.4fr 5fr 1fr 1fr 1fr 1fr' }}>
              <button onClick={() => setMaiusc(!maiusc)}
                className={`h-[58px] rounded-[3px] flex items-center justify-center ${RELEVO}
                  ${maiusc ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white' : `${CINZA} text-white`}`}>
                <IcoMaiusculas size={22} />
              </button>
              <button onClick={() => setTexto(`${texto} `)} className={`h-[58px] rounded-[3px] ${RELEVO} ${CINZA}`} />
              <button onClick={() => tecla('0')}
                className={`h-[58px] rounded-[3px] text-white text-[20px] font-bold ${RELEVO} ${CINZA}`}>0</button>
              <button onClick={() => setTexto(`${texto}.`)}
                className={`h-[58px] rounded-[3px] text-white text-[20px] font-bold ${RELEVO} ${CINZA}`}>.</button>
              <button onClick={() => setTexto('')}
                className={`h-[58px] rounded-[3px] text-white text-[20px] font-bold ${RELEVO}
                  bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]`}>C</button>
              <button onClick={() => tecla('⌫')}
                className={`h-[58px] rounded-[3px] text-white text-[20px] font-bold ${RELEVO} ${CINZA}`}>⌫</button>
            </div>
            <div className="grid grid-cols-2 gap-1 pt-1">
              <button onClick={procurar}
                className={`h-[58px] rounded-[3px] flex items-center justify-center text-[#2ecc40] ${RELEVO} ${CINZA}`}>
                <IcoVisto size={28} />
              </button>
              <button onClick={() => setTeclado(false)}
                className={`h-[58px] rounded-[3px] flex items-center justify-center text-[#e02020] ${RELEVO} ${CINZA}`}>
                <IcoCruz size={28} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
