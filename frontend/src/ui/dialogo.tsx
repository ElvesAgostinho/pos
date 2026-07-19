import { useEffect, useState } from 'react';
import { useArrastar } from '../pages/pos/useArrastar';

/**
 * OS DIÁLOGOS DO SISTEMA — em vez dos do Windows.
 *
 * O `alert()` e o `prompt()` do browser são do SISTEMA OPERATIVO, não nossos: aparecem
 * colados ao topo do ecrã com o texto "localhost:5173 diz", numa caixa branca de letra
 * pequena que não se toca com o dedo. Num terminal de balcão isso é duas coisas más ao
 * mesmo tempo — parece que o programa rebentou, e o empregado tem de largar o tabuleiro
 * para ir buscar o rato.
 *
 * Estes são nossos: mesma paleta, mesmo relevo, alvos de dedo, e o teclado tátil por
 * dentro quando é para escrever.
 *
 * COMO SE USA (a partir de qualquer sítio, sem passar props):
 *     aviso('Não foi possível cobrar.')                    // em vez de alert()
 *     if (await confirmar('Anular a conta?')) { … }        // em vez de confirm()
 *     const v = await pedir({ titulo: 'Motivo' });         // em vez de prompt()
 *
 * `aviso` NÃO devolve promessa de propósito: trocar `alert(x)` por `aviso(x)` é uma
 * troca de palavra, sem ter de tornar assíncrona meia aplicação.
 */

type Pedido = {
  tipo: 'AVISO' | 'CONFIRMAR' | 'PEDIR';
  titulo?: string;
  mensagem?: string;
  valor?: string;
  /** 'texto' abre o teclado alfabético; 'numero' abre o numérico */
  entrada?: 'texto' | 'numero';
  tom?: 'normal' | 'perigo';
  resolver: (v: any) => void;
};

let empurrar: ((p: Pedido) => void) | null = null;
const fila: Pedido[] = [];

function enfileirar(p: Pedido) {
  if (empurrar) empurrar(p);
  else fila.push(p);           // ainda não montou: guarda-se para não perder o aviso
}

/** Substitui `alert()`. Não bloqueia — mostra e segue. */
export function aviso(mensagem: any, titulo = 'Aviso') {
  enfileirar({ tipo: 'AVISO', titulo, mensagem: String(mensagem ?? ''), resolver: () => {} });
}

/** Substitui `confirm()`. */
export function confirmar(mensagem: string, titulo = 'Confirmar', tom: 'normal' | 'perigo' = 'normal') {
  return new Promise<boolean>((resolver) =>
    enfileirar({ tipo: 'CONFIRMAR', titulo, mensagem, tom, resolver }));
}

/**
 * Substitui `prompt()`. Devolve null se o utilizador desistir.
 *
 * Aceita as duas formas, de propósito:
 *     pedir('Motivo:')                       — como o prompt() de sempre
 *     pedir('Motivo:', 'valor inicial')
 *     pedir({ titulo: 'Motivo', entrada: 'numero' })
 * A forma curta é o que existe em centenas de sítios; obrigar a escrever um objeto em
 * todos eles não tornava nenhum deles mais claro.
 */
export function pedir(
  opcoes: string | { titulo?: string; mensagem?: string; valor?: string; entrada?: 'texto' | 'numero' },
  valorInicial?: string,
) {
  const o = typeof opcoes === 'string'
    ? { titulo: 'Escreva', mensagem: opcoes, valor: valorInicial }
    : opcoes;
  return new Promise<string | null>((resolver) =>
    enfileirar({ tipo: 'PEDIR', entrada: 'texto', ...o, resolver }));
}

// ── as teclas ────────────────────────────────────────────────────────────────
const LETRAS = [
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '7', '8', '9'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', 'ç', '4', '5', '6'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm', '-', '@', ',', '1', '2', '3'],
];
const NUMEROS = [['7', '8', '9'], ['4', '5', '6'], ['1', '2', '3'], ['.', '0', '⌫']];

const RELEVO = 'border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),'
  + 'inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]';
const CINZA = 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]';

/**
 * MONTA-SE UMA VEZ, no arranque (main.tsx). Sem isto os diálogos não aparecem — e os
 * pedidos ficam em fila à espera, em vez de se perderem.
 */
export default function DialogoHost() {
  const { ref, pegar, pos } = useArrastar();
  const [atual, setAtual] = useState<Pedido | null>(null);
  const [pendentes, setPendentes] = useState<Pedido[]>([]);
  const [texto, setTexto] = useState('');
  const [maiusc, setMaiusc] = useState(false);

  useEffect(() => {
    empurrar = (p: Pedido) => setPendentes((v) => [...v, p]);
    if (fila.length) { setPendentes((v) => [...v, ...fila]); fila.length = 0; }

    /**
     * ERROS QUE NINGUÉM VÊ. Um erro dentro de um botão (um `undefined` ao tocar em
     * "Pagar") morre na consola do browser: o ecrã não muda, o botão não responde, e
     * quem está a servir só sabe dizer "não dá para fazer nada". Sem a mensagem, não há
     * como saber o que falhou — nem para quem está a assistir à distância.
     *
     * Apanham-se aqui e mostram-se. Vale mais uma caixa com o erro do que um botão mudo.
     */
    const naErro = (e: ErrorEvent) => {
      // erros de recursos (imagens, scripts) não trazem mensagem útil ao operador
      if (!e?.message) return;
      aviso(`${e.message}\n\n${(e.filename || '').split('/').pop() || ''}${e.lineno ? `:${e.lineno}` : ''}`,
        'Erro no terminal');
    };
    const naPromessa = (e: PromiseRejectionEvent) => {
      const r: any = e?.reason;
      // os erros de API já são mostrados pelo próprio ecrã — não se repetem aqui
      if (r?.isAxiosError || r?.response) return;
      if (!r) return;
      aviso(String(r?.message || r), 'Erro no terminal');
    };
    window.addEventListener('error', naErro);
    window.addEventListener('unhandledrejection', naPromessa);

    return () => {
      empurrar = null;
      window.removeEventListener('error', naErro);
      window.removeEventListener('unhandledrejection', naPromessa);
    };
  }, []);

  useEffect(() => {
    if (atual || !pendentes.length) return;
    const [p, ...resto] = pendentes;
    setAtual(p); setPendentes(resto); setTexto(p.valor || '');
  }, [pendentes, atual]);

  if (!atual) return null;

  const fechar = (v: any) => { atual.resolver(v); setAtual(null); setMaiusc(false); };
  const tecla = (t: string) => {
    if (t === '⌫') return setTexto(texto.slice(0, -1));
    setTexto(texto + (maiusc ? t.toUpperCase() : t));
    if (maiusc) setMaiusc(false);
  };
  const perigo = atual.tom === 'perigo';

  return (
    <div className="fixed inset-0 z-[9000] bg-black/65 flex items-center justify-center p-4"
      onClick={() => fechar(atual.tipo === 'CONFIRMAR' ? false : null)}>
      <div ref={ref} className="max-w-[95vw] bg-[#2b2b2b] border-2 border-black shadow-2xl"
        style={{
          width: atual.tipo === 'PEDIR' ? 860 : 620,
          ...(pos ? { position: 'fixed' as const, left: pos.x, top: pos.y, margin: 0 } : {}),
        }}
        onClick={(e) => e.stopPropagation()}>
        {/* PEGA — o teclado move-se: fixo, tapava o campo que se esta a preencher. */}
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


        <div className={`h-[62px] flex items-center justify-center border-b-2 border-black
          ${perigo ? 'bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]'
            : 'bg-gradient-to-b from-[#4a4a4a] to-[#2e2e2e]'}`}>
          <span className="text-white text-[23px] font-bold">{atual.titulo}</span>
        </div>

        {atual.mensagem && (
          <div className="px-6 py-5 text-white text-[18px] leading-relaxed whitespace-pre-wrap
            max-h-[38vh] overflow-auto">
            {atual.mensagem}
          </div>
        )}

        {atual.tipo === 'PEDIR' && (
          <div className="px-2 pb-2">
            <div className="min-h-[62px] bg-[#8a8a8a]/60 border-2 border-black text-white
              text-[20px] px-4 py-3 mb-1 break-words">
              {texto || <span className="text-white/30">escreva…</span>}
            </div>
            {atual.entrada === 'numero' ? (
              <div className="grid grid-cols-3 gap-1.5">
                {NUMEROS.flat().map((t) => (
                  <button key={t} onClick={() => tecla(t)}
                    className={`h-[62px] rounded-[3px] text-white text-[24px] font-bold ${RELEVO} ${CINZA}`}>
                    {t}
                  </button>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {LETRAS.map((linha, i) => (
                  <div key={i} className="grid gap-1"
                    style={{ gridTemplateColumns: `repeat(${linha.length}, minmax(0,1fr))` }}>
                    {linha.map((t) => (
                      <button key={t} onClick={() => tecla(t)}
                        className={`h-[54px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO} ${CINZA}`}>
                        {maiusc ? t.toUpperCase() : t}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="grid gap-1" style={{ gridTemplateColumns: '1fr 5fr 1fr 1fr' }}>
                  <button onClick={() => setMaiusc(!maiusc)}
                    className={`h-[54px] rounded-[3px] text-[19px] font-bold ${RELEVO}
                      ${maiusc ? 'bg-gradient-to-b from-[#d4ac00] to-[#8a6f00] text-white' : `${CINZA} text-white`}`}>
                    ABC
                  </button>
                  <button onClick={() => setTexto(texto + ' ')}
                    className={`h-[54px] rounded-[3px] ${RELEVO} ${CINZA}`} />
                  <button onClick={() => setTexto('')}
                    className={`h-[54px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO}
                      bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]`}>C</button>
                  <button onClick={() => tecla('⌫')}
                    className={`h-[54px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO} ${CINZA}`}>⌫</button>
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`grid gap-1 p-1 bg-black
          ${atual.tipo === 'AVISO' ? 'grid-cols-1' : 'grid-cols-2'}`}>
          {atual.tipo !== 'AVISO' && (
            <button onClick={() => fechar(atual.tipo === 'CONFIRMAR' ? false : null)}
              className={`h-[66px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO} ${CINZA}`}>
              Cancelar
            </button>
          )}
          <button
            onClick={() => fechar(atual.tipo === 'PEDIR' ? (texto.trim() || null)
              : atual.tipo === 'CONFIRMAR' ? true : undefined)}
            className={`h-[66px] rounded-[3px] text-white text-[19px] font-bold ${RELEVO}
              ${perigo ? 'bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]'
                : 'bg-gradient-to-b from-[#2b9c48] to-[#125c26]'}`}>
            {atual.tipo === 'AVISO' ? 'OK' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
