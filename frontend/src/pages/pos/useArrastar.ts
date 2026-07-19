import { useEffect, useRef, useState } from 'react';

/**
 * ARRASTAR UMA JANELA — pela pega, com o dedo ou com o rato.
 *
 * Um teclado fixo no meio do ecrã tapa exatamente o que se está a preencher: a linha da
 * comanda, a lista de entidades, o campo seguinte. Num ecrã tátil não há como espreitar
 * por baixo — ou se afasta a janela, ou se escreve às cegas.
 *
 * Por isso todas as janelas e teclados do terminal se agarram e movem. A posição fica
 * onde o empregado a deixou, que é onde ele já sabe que está.
 *
 * Devolve:
 *   ref    — a pôr na caixa que se move
 *   pegar  — a pôr na PEGA (onMouseDown/onTouchStart)
 *   estilo — left/top a aplicar à caixa
 */
export function useArrastar(inicial?: { x: number; y: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const agarre = useRef<{ dx: number; dy: number } | null>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(inicial ?? null);

  useEffect(() => {
    const mover = (e: MouseEvent | TouchEvent) => {
      if (!agarre.current || !ref.current) return;
      const p: any = 'touches' in e ? (e as TouchEvent).touches[0] : e;
      if (!p) return;
      if ('touches' in e) e.preventDefault();      // não faz scroll da página ao arrastar
      const l = ref.current.offsetWidth;
      // A janela NÃO se perde fora do ecrã: deixa-se sempre um bocado agarrável, senão
      // arrasta-se demais e nunca mais se volta a apanhar a pega.
      const x = Math.min(Math.max(p.clientX - agarre.current.dx, 8 - l + 120), window.innerWidth - 120);
      const y = Math.min(Math.max(p.clientY - agarre.current.dy, 0), window.innerHeight - 60);
      setPos({ x, y });
    };
    const largar = () => { agarre.current = null; };
    window.addEventListener('mousemove', mover);
    window.addEventListener('touchmove', mover, { passive: false });
    window.addEventListener('mouseup', largar);
    window.addEventListener('touchend', largar);
    return () => {
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('touchmove', mover as any);
      window.removeEventListener('mouseup', largar);
      window.removeEventListener('touchend', largar);
    };
  }, []);

  const pegar = (e: React.MouseEvent | React.TouchEvent) => {
    const el = ref.current;
    if (!el) return;
    const p: any = 'touches' in e ? (e as React.TouchEvent).touches[0] : e;
    const r = el.getBoundingClientRect();
    agarre.current = { dx: p.clientX - r.left, dy: p.clientY - r.top };
  };

  return { ref, pegar, pos };
}

/** A pega visual — as três barras do canto, como nas janelas do terminal. */
export const BARRAS_PEGA = 'cursor-grab active:cursor-grabbing select-none';
