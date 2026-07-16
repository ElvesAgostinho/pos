import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

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
  title, children, onClose, width = 700, footer, tone = '#3a3a3a', center = true,
}: {
  title: ReactNode;
  children: ReactNode;
  onClose?: () => void;
  width?: number;
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
      y: Math.max(8, (window.innerHeight - r.height) / 2 - 20),
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
          width, maxWidth: 'calc(100vw - 16px)', maxHeight: 'calc(100vh - 16px)',
        }}
        className="bg-[#2b2b2b] border-2 border-black rounded-lg shadow-[0_20px_60px_rgba(0,0,0,0.6)]
          flex flex-col overflow-hidden">
        {/* pega */}
        <div onMouseDown={pegar} onTouchStart={pegar}
          style={{ background: tone }}
          className="h-[58px] flex items-center px-3 cursor-grab active:cursor-grabbing select-none flex-shrink-0">
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
              className="w-[46px] h-[40px] rounded bg-[#c0140f] text-white text-[18px] font-bold
                hover:bg-[#e02020]">✕</button>
          ) : <span className="w-[46px]" />}
        </div>

        <div className="flex-1 overflow-auto min-h-0">{children}</div>

        {footer && <div className="flex-shrink-0 border-t border-black">{footer}</div>}
      </div>
    </div>
  );
}
