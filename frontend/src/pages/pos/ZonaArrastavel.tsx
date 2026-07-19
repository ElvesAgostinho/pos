import { useRef } from 'react';

/**
 * UMA ZONA QUE SE PUXA COM O DEDO — sem barra de scroll.
 *
 * Num ecrã tátil a barra de scroll não serve para nada: tem 8 pixels de largura e é
 * preciso acertar-lhe com a ponta do dedo, que tapa a barra inteira. O que o dedo sabe
 * fazer é PUXAR o conteúdo.
 *
 * Aqui: arrasta-se para cima e para baixo e o conteúdo acompanha, com a inércia que se
 * espera de um telemóvel. A barra desaparece. E o TOQUE continua a funcionar como toque
 * — só se considera arrasto depois de o dedo andar uns pixels, senão cada tentativa de
 * lançar um artigo virava um arrasto e nada era lançado.
 */
export default function ZonaArrastavel({ children, className = '' }: {
  children: any; className?: string;
}) {
  const caixa = useRef<HTMLDivElement | null>(null);
  const arrasto = useRef<{ y: number; topo: number; ativo: boolean } | null>(null);
  // últimos movimentos, para a inércia
  const inercia = useRef<{ t: number; y: number }[]>([]);
  const animacao = useRef<number | null>(null);

  const parar = () => {
    if (animacao.current) { cancelAnimationFrame(animacao.current); animacao.current = null; }
  };

  const comecar = (y: number) => {
    parar();
    if (!caixa.current) return;
    arrasto.current = { y, topo: caixa.current.scrollTop, ativo: false };
    inercia.current = [{ t: Date.now(), y }];
  };

  const mover = (y: number) => {
    const a = arrasto.current;
    if (!a || !caixa.current) return;
    const dy = y - a.y;
    // LIMIAR: menos de 6px é um toque, não um arrasto. Sem isto, o tremor da mão ao
    // tocar numa tecla cancelava o toque e o artigo nunca era lançado.
    if (!a.ativo && Math.abs(dy) < 6) return;
    a.ativo = true;
    caixa.current.scrollTop = a.topo - dy;
    inercia.current.push({ t: Date.now(), y });
    if (inercia.current.length > 5) inercia.current.shift();
  };

  const largar = () => {
    const a = arrasto.current;
    arrasto.current = null;
    if (!a?.ativo || !caixa.current) return;
    // INÉRCIA: o conteúdo continua a andar e trava sozinho, como num telemóvel.
    const amostras = inercia.current;
    if (amostras.length < 2) return;
    const p = amostras[0];
    const u = amostras[amostras.length - 1];
    const dt = Math.max(1, u.t - p.t);
    let v = (u.y - p.y) / dt * 16;          // px por frame
    const passo = () => {
      if (!caixa.current || Math.abs(v) < 0.5) { animacao.current = null; return; }
      caixa.current.scrollTop -= v;
      v *= 0.94;                            // travagem
      animacao.current = requestAnimationFrame(passo);
    };
    animacao.current = requestAnimationFrame(passo);
  };

  return (
    <div ref={caixa}
      onPointerDown={(e) => { if (e.pointerType !== 'touch') comecar(e.clientY); }}
      onPointerMove={(e) => { if (e.pointerType !== 'touch') mover(e.clientY); }}
      onPointerUp={largar}
      onPointerLeave={largar}
      onTouchStart={(e) => comecar(e.touches[0].clientY)}
      onTouchMove={(e) => mover(e.touches[0].clientY)}
      onTouchEnd={largar}
      // a barra desaparece nos três motores; o conteúdo continua a poder rolar
      style={{ scrollbarWidth: 'none', msOverflowStyle: 'none', touchAction: 'pan-y' }}
      className={`overflow-auto pos-arrasta ${className}`}>
      {children}
    </div>
  );
}
