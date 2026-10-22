/**
 * ÍCONES 3D — volume a sério, desenhado em SVG.
 *
 * Os ícones de traço (lucide) continuam a servir as barras de ferramentas e as
 * grelhas, onde um símbolo tem de acompanhar a letra sem gritar. Estes são para
 * onde o ícone É o elemento: atalhos do Ambiente de Trabalho, cabeçalhos de
 * ecrã, cartões de módulo.
 *
 * Porquê SVG desenhado e não imagens 3D renderizadas:
 *  · PESO — cada PNG 3D decente anda nos 20-60 KB; vinte deles são mais do que
 *    todo o código desta aplicação. Estes são algumas centenas de bytes.
 *  · NITIDEZ — num ecrã 4K de recepção, um PNG de 128px fica desfocado; um
 *    vector nunca.
 *  · COR — recebem a cor por parâmetro e acompanham o tema. Uma imagem fica
 *    presa à cor com que foi renderizada.
 *
 * A linguagem é a mesma em todos: uma face de cima mais clara, uma face lateral
 * mais escura, um brilho curto na aresta superior e uma sombra aberta por baixo.
 * É assim que se lê volume — pela luz, não pelo contorno.
 */

type Props = { size?: number; cor?: string; className?: string };

const AZUL = '#2563EB';

/** Clareia ou escurece um hex — para as faces saírem todas da MESMA cor. */
function tom(hex: string, pct: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.max(0, Math.min(255, (n >> 16) + pct));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + pct));
  const b = Math.max(0, Math.min(255, (n & 0xff) + pct));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

/** Moldura comum: gradientes das faces + a sombra pousada. */
function Base({ size = 48, cor = AZUL, className, children }: Props & { children: any }) {
  const id = Math.random().toString(36).slice(2, 8);
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}
      style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={`t${id}`} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor={tom(cor, 58)} />
          <stop offset="100%" stopColor={cor} />
        </linearGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0.6">
          <stop offset="0%" stopColor={tom(cor, -18)} />
          <stop offset="100%" stopColor={tom(cor, -56)} />
        </linearGradient>
        <linearGradient id={`f${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.06" />
        </linearGradient>
        <radialGradient id={`sh${id}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor="#0F172A" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#0F172A" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* sombra pousada — o que separa o objecto do fundo */}
      <ellipse cx="24" cy="43" rx="15" ry="3.4" fill={`url(#sh${id})`} />
      {children({ topo: `url(#t${id})`, lado: `url(#s${id})`, luz: `url(#f${id})`, cor })}
    </svg>
  );
}

/** HOTEL — o edifício, em dois volumes. */
export function Icon3DHotel(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <path d="M8 18 L24 10 L30 13 L14 21 Z" fill={topo} />
          <path d="M8 18 L14 21 L14 40 L8 37 Z" fill={lado} />
          <path d="M14 21 L30 13 L30 40 L14 40 Z" fill={topo} />
          <path d="M30 13 L36 16 L40 14 L40 40 L30 40 Z" fill={lado} />
          <path d="M14 21 L30 13 L30 18 L14 26 Z" fill={luz} />
          {[0, 1, 2].map((l) => [0, 1].map((c) => (
            <rect key={`${l}-${c}`} x={17.5 + c * 6} y={24 + l * 5} width="3.6" height="3.2"
              rx="0.7" fill="#FFFFFF" opacity="0.82" />
          )))}
        </>
      )}
    </Base>
  );
}

/** QUARTO — a cama vista em perspectiva. */
export function Icon3DQuarto(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <path d="M7 24 L17 19 L41 19 L41 24 L31 29 L7 29 Z" fill={topo} />
          <path d="M7 29 L31 29 L31 37 L7 37 Z" fill={lado} />
          <path d="M31 29 L41 24 L41 32 L31 37 Z" fill={lado} opacity="0.75" />
          <path d="M10 21 L19 16 L27 16 L27 21 L18 26 L10 26 Z" fill="#FFFFFF" opacity="0.9" />
          <path d="M7 24 L17 19 L41 19 L41 21 L17 21 L7 26 Z" fill={luz} />
          <rect x="6" y="36" width="3" height="5" rx="1" fill={lado} />
          <rect x="29" y="36" width="3" height="5" rx="1" fill={lado} />
        </>
      )}
    </Base>
  );
}

/** RESERVA — o calendário com o dia marcado. */
export function Icon3DReserva(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <rect x="9" y="12" width="30" height="27" rx="4" fill={lado} />
          <rect x="9" y="12" width="30" height="9" rx="4" fill={topo} />
          <rect x="9" y="18" width="30" height="3" fill={topo} />
          <rect x="9" y="12" width="30" height="4" rx="4" fill={luz} />
          <rect x="12.5" y="24" width="23" height="12" rx="2.5" fill="#FFFFFF" opacity="0.94" />
          <rect x="15" y="8" width="4" height="8" rx="2" fill={lado} />
          <rect x="29" y="8" width="4" height="8" rx="2" fill={lado} />
          <path d="M19 30.5 L22.5 33.5 L29.5 26.5" stroke={p.cor || AZUL} strokeWidth="2.6"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
    </Base>
  );
}

/** FACTURA — o documento com o selo. */
export function Icon3DFactura(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <path d="M12 9 L28 9 L37 18 L37 40 L12 40 Z" fill="#FFFFFF" />
          <path d="M12 9 L28 9 L37 18 L37 40 L12 40 Z" fill={topo} opacity="0.13" />
          <path d="M28 9 L37 18 L28 18 Z" fill={lado} />
          <path d="M12 9 L28 9 L28 12 L12 12 Z" fill={luz} />
          {[0, 1, 2].map((i) => (
            <rect key={i} x="17" y={23 + i * 5} width={i === 2 ? 9 : 15} height="2.6" rx="1.3"
              fill={p.cor || AZUL} opacity={0.85 - i * 0.18} />
          ))}
          <circle cx="34" cy="34" r="7" fill={lado} />
          <circle cx="34" cy="34" r="7" fill={topo} opacity="0.5" />
          <path d="M31 34 L33.2 36.2 L37.2 31.8" stroke="#FFFFFF" strokeWidth="2.2"
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
    </Base>
  );
}

/** DINHEIRO — as moedas empilhadas. */
export function Icon3DDinheiro(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          {[0, 1, 2].map((i) => {
            const y = 32 - i * 7;
            return (
              <g key={i}>
                <path d={`M9 ${y} a15 6 0 0 0 30 0 v-5 a15 6 0 0 1 -30 0 z`} fill={lado} />
                <ellipse cx="24" cy={y - 5} rx="15" ry="6" fill={topo} />
                <ellipse cx="24" cy={y - 5} rx="15" ry="6" fill={luz} />
              </g>
            );
          })}
          <ellipse cx="24" cy="13" rx="8" ry="3.2" fill="#FFFFFF" opacity="0.65" />
        </>
      )}
    </Base>
  );
}

/** RELATÓRIOS — as barras do gráfico, com altura real. */
export function Icon3DGrafico(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          {[{ x: 9, h: 11 }, { x: 19, h: 20 }, { x: 29, h: 29 }].map((b, i) => (
            <g key={i}>
              <path d={`M${b.x} ${38 - b.h} L${b.x + 5} ${41 - b.h} L${b.x + 10} ${38 - b.h} L${b.x + 5} ${35 - b.h} Z`} fill={topo} />
              <path d={`M${b.x} ${38 - b.h} L${b.x + 5} ${41 - b.h} L${b.x + 5} 41 L${b.x} 38 Z`} fill={lado} opacity="0.85" />
              <path d={`M${b.x + 5} ${41 - b.h} L${b.x + 10} ${38 - b.h} L${b.x + 10} 38 L${b.x + 5} 41 Z`} fill={lado} />
              <path d={`M${b.x} ${38 - b.h} L${b.x + 5} ${41 - b.h} L${b.x + 10} ${38 - b.h} L${b.x + 5} ${35 - b.h} Z`} fill={luz} />
            </g>
          ))}
        </>
      )}
    </Base>
  );
}

/** UTILIZADORES — as pessoas, uma à frente da outra. */
export function Icon3DUtilizadores(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <circle cx="32" cy="17" r="6" fill={lado} />
          <path d="M22 39 a10 10 0 0 1 20 0 z" fill={lado} />
          <circle cx="19" cy="16" r="7.5" fill={topo} />
          <circle cx="19" cy="16" r="7.5" fill={luz} />
          <path d="M7 40 a12 12 0 0 1 24 0 z" fill={topo} />
          <path d="M7 40 a12 12 0 0 1 24 0 z" fill={luz} />
        </>
      )}
    </Base>
  );
}

/** STOCK — a caixa fechada, em perspectiva. */
export function Icon3DCaixa(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <path d="M24 8 L41 16 L24 24 L7 16 Z" fill={topo} />
          <path d="M7 16 L24 24 L24 41 L7 33 Z" fill={lado} opacity="0.85" />
          <path d="M41 16 L24 24 L24 41 L41 33 Z" fill={lado} />
          <path d="M24 8 L41 16 L24 24 L7 16 Z" fill={luz} />
          <path d="M15.5 12 L32.5 20 L32.5 25 L28 23 L28 19.5 L15.5 14 Z" fill="#FFFFFF" opacity="0.7" />
        </>
      )}
    </Base>
  );
}

/** DEFINIÇÕES — a roda dentada com espessura. */
export function Icon3DDefinicoes(p: Props) {
  const dentes = Array.from({ length: 8 }, (_, i) => (i * 360) / 8);
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <g transform="translate(0,3)">
            {dentes.map((a) => (
              <rect key={a} x="21" y="7" width="6" height="9" rx="2" fill={lado}
                transform={`rotate(${a} 24 24)`} />
            ))}
            <circle cx="24" cy="24" r="14" fill={lado} />
          </g>
          {dentes.map((a) => (
            <rect key={a} x="21" y="7" width="6" height="9" rx="2" fill={topo}
              transform={`rotate(${a} 24 24)`} />
          ))}
          <circle cx="24" cy="24" r="14" fill={topo} />
          <circle cx="24" cy="24" r="14" fill={luz} />
          <circle cx="24" cy="24" r="6" fill="#FFFFFF" opacity="0.92" />
        </>
      )}
    </Base>
  );
}

/** TERMINAL — o monitor assente na base. */
export function Icon3DTerminal(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <rect x="7" y="10" width="34" height="23" rx="3.5" fill={lado} />
          <rect x="9" y="12" width="30" height="19" rx="2" fill={topo} />
          <rect x="9" y="12" width="30" height="8" rx="2" fill={luz} />
          <path d="M18 33 L30 33 L32 39 L16 39 Z" fill={lado} />
          <rect x="13" y="38.5" width="22" height="3" rx="1.5" fill={topo} />
          <rect x="13.5" y="16" width="13" height="2.2" rx="1.1" fill="#FFFFFF" opacity="0.85" />
          <rect x="13.5" y="21" width="20" height="2.2" rx="1.1" fill="#FFFFFF" opacity="0.6" />
        </>
      )}
    </Base>
  );
}

/** CANAIS — o globo com o meridiano. */
export function Icon3DCanais(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <circle cx="24" cy="23" r="15" fill={lado} />
          <circle cx="24" cy="23" r="15" fill={topo} opacity="0.92" />
          <ellipse cx="24" cy="23" rx="6.5" ry="15" fill="none" stroke="#FFFFFF"
            strokeWidth="1.8" opacity="0.75" />
          <path d="M9.6 18 H38.4 M9.6 28 H38.4" stroke="#FFFFFF" strokeWidth="1.8" opacity="0.75" />
          <circle cx="24" cy="23" r="15" fill={luz} />
        </>
      )}
    </Base>
  );
}

/** CHAVE — o acesso. */
export function Icon3DChave(p: Props) {
  return (
    <Base {...p}>
      {({ topo, lado, luz }: any) => (
        <>
          <g transform="rotate(-38 24 24)">
            <rect x="21.5" y="20" width="5" height="19" rx="2.5" fill={lado} />
            <rect x="26.5" y="30" width="5" height="4" rx="1.5" fill={lado} />
            <rect x="26.5" y="35" width="4" height="3.5" rx="1.5" fill={lado} />
            <circle cx="24" cy="15" r="9" fill={lado} />
            <circle cx="24" cy="15" r="9" fill={topo} opacity="0.95" />
            <circle cx="24" cy="15" r="9" fill={luz} />
            <circle cx="24" cy="15" r="3.6" fill="#FFFFFF" opacity="0.95" />
          </g>
        </>
      )}
    </Base>
  );
}

/** O catálogo, por nome — para quem só tem uma etiqueta à mão. */
export const ICONES_3D: Record<string, (p: Props) => any> = {
  hotel: Icon3DHotel, building: Icon3DHotel, empresa: Icon3DHotel,
  quarto: Icon3DQuarto, rooms: Icon3DQuarto, bed: Icon3DQuarto,
  reserva: Icon3DReserva, reservations: Icon3DReserva, calendar: Icon3DReserva,
  factura: Icon3DFactura, fatura: Icon3DFactura, receipt: Icon3DFactura, fiscal: Icon3DFactura,
  dinheiro: Icon3DDinheiro, money: Icon3DDinheiro, caixa: Icon3DDinheiro, contas: Icon3DDinheiro,
  grafico: Icon3DGrafico, chart: Icon3DGrafico, reporting: Icon3DGrafico, report: Icon3DGrafico,
  utilizadores: Icon3DUtilizadores, users: Icon3DUtilizadores, hospedes: Icon3DUtilizadores,
  stock: Icon3DCaixa, box: Icon3DCaixa, inventory: Icon3DCaixa, produtos: Icon3DCaixa,
  definicoes: Icon3DDefinicoes, settings: Icon3DDefinicoes, config: Icon3DDefinicoes,
  gear: Icon3DDefinicoes, posc_config: Icon3DDefinicoes,
  terminal: Icon3DTerminal, pos: Icon3DTerminal, monitor: Icon3DTerminal,
  canais: Icon3DCanais, channels: Icon3DCanais, globe: Icon3DCanais, online: Icon3DCanais,
  chave: Icon3DChave, key: Icon3DChave, acessos: Icon3DChave,
};

/** Desenha pelo nome; sem correspondência, devolve nada (quem chama decide). */
export default function Icon3D({ nome, ...resto }: Props & { nome: string }) {
  const Cmp = ICONES_3D[nome?.toLowerCase?.()];
  return Cmp ? <Cmp {...resto} /> : null;
}
