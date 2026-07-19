import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { IcoCruz } from './Icons';

/**
 * JANELA DO TERMINAL — arrastável, como uma janela de verdade.
 *
 * Um popup fixo no meio do ecrã tapa exatamente aquilo que o empregado precisa de ver: o
 * mapa das mesas por trás, a comanda, o total. Ele fecha, olha, e volta a abrir — três
 * vezes por conta. Aqui pega-se na barra do título e põe-se a janela de lado.
 *
 * A janela nunca sai do ecrã (senão perdia-se a barra de título e ficava presa), e nunca
 * fica mais alta do que o ecrã (era isso que cortava os botões de baixo).
 */
export default function Window({
  title, children, onClose, width = 700, altura, footer, tone = '#3a3a3a', center = true,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
  /** altura fixa (ex.: '86vh'). Sem ela, a janela cresce com o conteúdo. */
  altura?: string | number;
  footer?: ReactNode;
  tone?: string;            // cor da barra do título
  center?: boolean;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const arrastar = useRef<{ dx: number; dy: number } | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  // Nasce centrada; a partir daí, fica onde o empregado a deixar.
  useEffect(() => {
    if (!center || pos) return;
    const el = caixa.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPos({
      x: Math.max(8, (window.innerWidth - r.width) / 2),
      y: Math.max(8, Math.min((window.innerHeight - r.height) / 2 - 20,
                              window.innerHeight - r.height - 8)),
    });
  }, [center, pos]);

  useEffect(() => {
    const mover = (e: MouseEvent | TouchEvent) => {
      if (!arrastar.current || !caixa.current) return;
      const p = 'touches' in e ? e.touches[0] : (e as MouseEvent);
      const r = caixa.current.getBoundingClientRect();
      // Presa ao ecrã: pelo menos a barra do título tem de continuar a ver-se.
      const x = Math.min(Math.max(-r.width + 120, p.clientX - arrastar.current.dx),
        window.innerWidth - 120);
      const y = Math.min(Math.max(0, p.clientY - arrastar.current.dy),
        window.innerHeight - 60);
      setPos({ x, y });
    };
    const largar = () => { arrastar.current = null; };
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
    const el = caixa.current;
    if (!el) return;
    const p = 'touches' in e ? (e as React.TouchEvent).touches[0] : (e as React.MouseEvent);
    const r = el.getBoundingClientRect();
    arrastar.current = { dx: p.clientX - r.left, dy: p.clientY - r.top };
  };

  return (
    <div className="fixed inset-0 z-40" style={{ background: 'rgba(0,0,0,0.45)' }}>
      <div ref={caixa}
        style={{
          position: 'absolute',
          left: pos?.x ?? 40, top: pos?.y ?? 40,
          width,
          // A ALTURA PEDIDA, MAS NUNCA MAIOR DO QUE O ECRÃ. Com uma altura fixa a
          // janela passava por baixo do fundo e os botões de confirmar ficavam
          // cortados — o empregado via a conta mas não conseguia fechá-la.
          ...(altura ? { height: `min(${typeof altura === 'number' ? `${altura}px` : altura}, calc(100vh - 24px))` } : {}),
          maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)',
        }}
        className="bg-[#2b2b2b] border-[3px] border-black rounded-[3px] shadow-[0_24px_70px_rgba(0,0,0,0.75)]
          flex flex-col overflow-hidden">
        {/* pega */}
        <div onMouseDown={pegar} onTouchStart={pegar}
          style={{ background: tone }}
          className="h-[62px] flex items-center px-3 cursor-grab active:cursor-grabbing select-none
            flex-shrink-0 border-b-2 border-black
            shadow-[inset_0_2px_0_rgba(255,255,255,0.22),inset_0_-2px_0_rgba(0,0,0,0.35)]">
          <span className="w-[46px] flex flex-col gap-[3px] opacity-40">
            <span className="h-[2px] bg-white rounded" />
            <span className="h-[2px] bg-white rounded" />
            <span className="h-[2px] bg-white rounded" />
          </span>
          <span className="flex-1 text-center text-white text-[21px] font-bold truncate px-2">
            {title}
          </span>
          {onClose ? (
            <button onClick={onClose}
              className="w-[52px] h-[46px] rounded-[3px] text-white flex items-center justify-center
                border-2 border-black bg-gradient-to-b from-[#d42a24] to-[#8a0f0b]
                shadow-[inset_0_2px_0_rgba(255,255,255,0.22),inset_0_-2px_0_rgba(0,0,0,0.45)]
                active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]"><IcoCruz size={26} /></button>
          ) : <span className="w-[46px]" />}
        </div>

        <div className="flex-1 overflow-auto min-h-0 pos-arrasta">{children}</div>

        {footer && <div className="flex-shrink-0 border-t border-black">{footer}</div>}
      </div>
    </div>
  );
}
