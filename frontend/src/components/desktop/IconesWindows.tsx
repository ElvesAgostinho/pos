/**
 * ÍCONES DO AMBIENTE DE TRABALHO — no registo dos ícones do Windows.
 *
 * ─── O QUE ESTAVA AQUI E PORQUE SAIU ──────────────────────────────────────
 * Estavam ícones 3D isométricos (Icon3D.tsx): um objecto em perspectiva, numa
 * cor só, com brilho de verniz na aresta de cima e uma sombra oval pousada por
 * baixo. Desenhados com cuidado, mas lêem como ícones de loja de aplicações —
 * é o registo do telemóvel, não o de uma ferramenta de trabalho.
 *
 * Os do Windows fazem três coisas ao contrário, e são essas três que se copiam:
 *
 *  1. COR POR OBJECTO, não por tema. A pasta é âmbar, o ecrã é cinzento-aço, o
 *     documento é branco com uma aba azul. A cor é parte da identidade do
 *     objecto — é por ela que se encontra o ícone certo sem ler o nome. Pintar
 *     tudo da cor da marca transforma vinte ícones em vinte manchas iguais.
 *  2. FACES LISAS, não envernizadas. Um gradiente vertical muito curto para
 *     dizer de onde vem a luz, e nada mais: sem reflexo, sem brilho especular.
 *  3. SEM SOMBRA POUSADA. A sombra oval fazia o ícone flutuar acima do ecrã.
 *     Um ícone de ambiente de trabalho está NO ambiente de trabalho.
 *
 * ─── PORQUE SÃO SVG E NÃO IMAGENS ─────────────────────────────────────────
 * Peso (cada PNG decente são 20-60 KB; estes são centenas de bytes), nitidez
 * (num ecrã 4K de recepção um PNG de 128px fica desfocado, um vector nunca) e
 * manutenção (uma paleta aqui em cima muda o conjunto todo).
 *
 * O id dos gradientes é o NOME do ícone, não um número aleatório. Com ids
 * aleatórios, cada volta de renderização gera ids novos — e o mesmo ecrã
 * fotografado duas vezes dava dois ficheiros diferentes, o que estraga a
 * comparação de imagens nos testes.
 */
import React from 'react';

type Props = { size?: number; className?: string };

/**
 * A paleta — cinzentos de aço e cores sóbrias, nenhuma saturada.
 *
 * Os aços são CLAROS de propósito. Comecei-os em cinzentos médios, que é o que
 * os ícones do Windows usam — mas o Windows põe-nos sobre um fundo de
 * fotografia, e aqui estão sobre um cinzento-azulado escuro. Cinzento médio
 * sobre escuro não é um ícone: é uma mancha. O que dá a leitura é o VALOR, e
 * num ambiente escuro o objecto tem de ser mais claro do que o fundo.
 */
const P = {
  acoClaro: '#C2CBD6', aco: '#9AA6B4', acoEscuro: '#6E7A89', acoAresta: '#424B57',
  ambarClaro: '#FFC95C', ambar: '#EFAE2A', ambarEscuro: '#D08F12',
  azulClaro: '#6FA0DB', azul: '#4A7EBB', azulEscuro: '#2F5D94',
  papel: '#FAFBFC', papelSombra: '#E4E8ED', papelAresta: '#B9C1CB',
  verde: '#6CB173', verdeEscuro: '#4A8A52',
  vermelho: '#C05A4E', vermelhoEscuro: '#9A4236',
  madeira: '#C08A5C', madeiraEscuro: '#95653E',
  vidro: '#9FD2E8',
};

/**
 * A moldura comum. Declara UM gradiente vertical a partir de duas cores — a
 * receita de "de onde vem a luz" fica num sítio só, e é a mesma em todos.
 */
function Svg({ nome, size = 32, className, de, para, children }:
Props & { nome: string; de?: string; para?: string; children: React.ReactNode }) {
  const id = `iw-${nome}`;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" className={className}
      style={{ display: 'block' }} aria-hidden="true">
      {de && para && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={de} /><stop offset="100%" stopColor={para} />
          </linearGradient>
        </defs>
      )}
      {children}
    </svg>
  );
}
const grad = (nome: string) => `url(#iw-${nome})`;

/* ═══════════════════ OS ÍCONES ═══════════════════ */

/** ECRÃ / TERMINAL — "Este PC" do Windows: um monitor de frente, com pé. */
export function IwTerminal(p: Props) {
  return (
    <Svg nome="terminal" de={P.acoClaro} para={P.acoEscuro} {...p}>
      <rect x="4" y="8" width="40" height="27" rx="2" fill={grad('terminal')}
        stroke={P.acoAresta} strokeWidth="1" />
      <rect x="7" y="11" width="34" height="21" fill={P.azulEscuro} />
      <rect x="7" y="11" width="34" height="21" fill={P.vidro} opacity="0.22" />
      {/* o reflexo é UMA diagonal, não um brilho — é o que faz ler "vidro" */}
      <path d="M7 32 L24 11 h8 L15 32 Z" fill="#FFFFFF" opacity="0.10" />
      <rect x="20" y="35" width="8" height="5" fill={P.aco} />
      <rect x="14" y="40" width="20" height="3" rx="1.5" fill={P.acoEscuro} />
    </Svg>
  );
}

/** DEFINIÇÕES — a roda dentada de aço, de frente e simétrica. */
export function IwDefinicoes(p: Props) {
  const dentes = Array.from({ length: 8 }, (_, i) => i * 45);
  return (
    <Svg nome="gear" de={P.acoClaro} para={P.acoEscuro} {...p}>
      <g fill={grad('gear')} stroke={P.acoAresta} strokeWidth="0.9">
        {dentes.map((a) => (
          <rect key={a} x="21" y="3" width="6" height="10" rx="1"
            transform={`rotate(${a} 24 24)`} />
        ))}
        <circle cx="24" cy="24" r="14" />
      </g>
      <circle cx="24" cy="24" r="5.5" fill="#4A5461" />
      <circle cx="24" cy="24" r="5.5" fill="none" stroke={P.acoAresta} strokeWidth="0.9" />
      <path d="M12 18a14 14 0 0 1 14-8" fill="none" stroke="#FFFFFF" strokeWidth="1.4"
        opacity="0.35" strokeLinecap="round" />
    </Svg>
  );
}

/** PASTA — âmbar, com a aba de trás mais escura e a frente mais clara. */
export function IwPasta(p: Props) {
  return (
    <Svg nome="folder" de={P.ambarClaro} para={P.ambar} {...p}>
      <path d="M4 12a2 2 0 0 1 2-2h11l4 4h21a2 2 0 0 1 2 2v4H4Z" fill={P.ambarEscuro} />
      <path d="M4 18h40v20a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" fill={grad('folder')}
        stroke={P.ambarEscuro} strokeWidth="1" />
      <path d="M4 18h40v3H4Z" fill="#FFFFFF" opacity="0.28" />
    </Svg>
  );
}

/** APLICAÇÃO — a janela, que é como o Windows mostra um programa sem ícone. */
export function IwAplicacao(p: Props) {
  return (
    <Svg nome="app" de={P.papel} para={P.papelSombra} {...p}>
      <rect x="5" y="8" width="38" height="32" rx="2" fill={grad('app')}
        stroke={P.papelAresta} strokeWidth="1" />
      <path d="M5 10a2 2 0 0 1 2-2h34a2 2 0 0 1 2 2v5H5Z" fill={P.azul} />
      <circle cx="10" cy="11.5" r="1.3" fill="#FFFFFF" opacity="0.8" />
      <circle cx="14.5" cy="11.5" r="1.3" fill="#FFFFFF" opacity="0.55" />
      <g fill={P.papelAresta}>
        <rect x="9" y="20" width="22" height="2.2" /><rect x="9" y="25" width="30" height="2.2" />
        <rect x="9" y="30" width="16" height="2.2" />
      </g>
    </Svg>
  );
}

/** QUARTO — a cama vista de lado, em madeira e tecido claro. */
export function IwQuarto(p: Props) {
  return (
    <Svg nome="bed" de={P.papel} para={P.papelSombra} {...p}>
      <rect x="4" y="16" width="7" height="24" rx="1.5" fill={P.madeira} stroke={P.madeiraEscuro} strokeWidth="0.9" />
      <rect x="37" y="24" width="7" height="16" rx="1.5" fill={P.madeira} stroke={P.madeiraEscuro} strokeWidth="0.9" />
      <rect x="9" y="26" width="31" height="9" rx="1.5" fill={grad('bed')} stroke={P.papelAresta} strokeWidth="1" />
      <rect x="11" y="19" width="12" height="8" rx="2" fill="#FFFFFF" stroke={P.papelAresta} strokeWidth="1" />
      <rect x="9" y="33" width="31" height="2.5" fill={P.azulClaro} opacity="0.65" />
    </Svg>
  );
}

/** RESERVA / CALENDÁRIO — folha branca com a pasta vermelha em cima. */
export function IwCalendario(p: Props) {
  return (
    <Svg nome="calendar" de={P.papel} para={P.papelSombra} {...p}>
      <rect x="6" y="9" width="36" height="33" rx="2" fill={grad('calendar')}
        stroke={P.papelAresta} strokeWidth="1" />
      <path d="M6 11a2 2 0 0 1 2-2h32a2 2 0 0 1 2 2v7H6Z" fill={P.vermelho} />
      <path d="M6 16h36v2H6Z" fill={P.vermelhoEscuro} opacity="0.5" />
      <g fill={P.acoEscuro} opacity="0.45">
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`${r}-${c}`} x={11 + c * 7.5} y={23 + r * 6} width="5" height="4" rx="0.6" />
        )))}
      </g>
      <rect x="11" y="29" width="5" height="4" rx="0.6" fill={P.azul} />
      <g fill={P.acoEscuro}>
        <rect x="13" y="5" width="3" height="7" rx="1.5" /><rect x="32" y="5" width="3" height="7" rx="1.5" />
      </g>
    </Svg>
  );
}

/** RELATÓRIO / GRÁFICO — as barras, em azul, dentro de um painel claro. */
export function IwGrafico(p: Props) {
  return (
    <Svg nome="chart" de={P.papel} para={P.papelSombra} {...p}>
      <rect x="5" y="7" width="38" height="34" rx="2" fill={grad('chart')}
        stroke={P.papelAresta} strokeWidth="1" />
      <g>
        <rect x="12" y="25" width="6" height="11" fill={P.azulClaro} />
        <rect x="21" y="18" width="6" height="18" fill={P.azul} />
        <rect x="30" y="13" width="6" height="23" fill={P.azulEscuro} />
      </g>
      <path d="M9 36h30" stroke={P.papelAresta} strokeWidth="1.4" />
      <path d="M9 11v25" stroke={P.papelAresta} strokeWidth="1.4" />
    </Svg>
  );
}

/** DINHEIRO / CAIXA — as notas, verdes, com uma moeda em cima. */
export function IwDinheiro(p: Props) {
  return (
    <Svg nome="money" de="#6FB277" para={P.verdeEscuro} {...p}>
      <rect x="4" y="14" width="34" height="20" rx="2" fill={grad('money')}
        stroke={P.verdeEscuro} strokeWidth="1" />
      <rect x="8" y="18" width="26" height="12" rx="1" fill="none" stroke="#FFFFFF"
        strokeWidth="1" opacity="0.4" />
      <circle cx="21" cy="24" r="4.5" fill="#FFFFFF" opacity="0.32" />
      <circle cx="35" cy="32" r="9" fill={P.ambarClaro} stroke={P.ambarEscuro} strokeWidth="1" />
      <circle cx="35" cy="32" r="6" fill="none" stroke={P.ambarEscuro} strokeWidth="1" opacity="0.7" />
      <text x="35" y="36" textAnchor="middle" fontSize="9" fontWeight="bold" fill={P.ambarEscuro}>K</text>
    </Svg>
  );
}

/** UTILIZADORES — duas silhuetas, a de trás mais fraca. */
export function IwUtilizadores(p: Props) {
  return (
    <Svg nome="users" de={P.azulClaro} para={P.azulEscuro} {...p}>
      <g opacity="0.45" fill={P.aco}>
        <circle cx="32" cy="17" r="6.5" />
        <path d="M20 42c0-7 5.4-12 12-12s12 5 12 12Z" />
      </g>
      <circle cx="19" cy="18" r="8" fill={grad('users')} stroke={P.azulEscuro} strokeWidth="0.9" />
      <path d="M4 43c0-8.3 6.7-14 15-14s15 5.7 15 14Z" fill={grad('users')}
        stroke={P.azulEscuro} strokeWidth="0.9" />
    </Svg>
  );
}

/** CAIXA / STOCK — a caixa de cartão fechada, com fita. */
export function IwCaixa(p: Props) {
  return (
    <Svg nome="box" de="#D9A96E" para={P.madeiraEscuro} {...p}>
      <path d="M24 6 44 14v6L24 28 4 20v-6Z" fill="#E3B882" stroke={P.madeiraEscuro} strokeWidth="0.9" />
      <path d="M4 20l20 8v14L4 34Z" fill={P.madeira} stroke={P.madeiraEscuro} strokeWidth="0.9" />
      <path d="M44 20L24 28v14l20-8Z" fill={P.madeiraEscuro} />
      <path d="M24 28v14" stroke="#8A5C36" strokeWidth="0.8" opacity="0.6" />
      <path d="M4 14l20 8 20-8" fill="none" stroke={P.ambar} strokeWidth="2.2" opacity="0.85" />
    </Svg>
  );
}

/** CHAVE — aço, com a cabeça redonda. */
export function IwChave(p: Props) {
  return (
    <Svg nome="key" de={P.acoClaro} para={P.acoEscuro} {...p}>
      <g fill={grad('key')} stroke={P.acoAresta} strokeWidth="0.9">
        <circle cx="16" cy="18" r="10" />
        <path d="M22 24l16 16h5v-5l-2-2h-4v-4h-4l-2-2Z" />
      </g>
      <circle cx="16" cy="18" r="4" fill="#4A5461" />
      <path d="M9 13a10 10 0 0 1 8-4" fill="none" stroke="#FFFFFF" strokeWidth="1.3" opacity="0.4" strokeLinecap="round" />
    </Svg>
  );
}

/** GLOBO / CANAIS — azul, com os paralelos desenhados. */
export function IwGlobo(p: Props) {
  return (
    <Svg nome="globe" de={P.azulClaro} para={P.azulEscuro} {...p}>
      <circle cx="24" cy="24" r="19" fill={grad('globe')} stroke={P.azulEscuro} strokeWidth="1" />
      <g fill="none" stroke="#FFFFFF" strokeWidth="1.2" opacity="0.5">
        <path d="M5 24h38" /><path d="M8 15h32" /><path d="M8 33h32" />
        <ellipse cx="24" cy="24" rx="9" ry="19" /><path d="M24 5v38" />
      </g>
      <path d="M10 13a19 19 0 0 1 12-7" fill="none" stroke="#FFFFFF" strokeWidth="1.6" opacity="0.4" strokeLinecap="round" />
    </Svg>
  );
}

/** DOCUMENTO / NOTA — a folha com o canto dobrado. */
export function IwDocumento(p: Props) {
  return (
    <Svg nome="note" de={P.papel} para={P.papelSombra} {...p}>
      <path d="M9 5h20l10 10v28a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z"
        fill={grad('note')} stroke={P.papelAresta} strokeWidth="1" />
      <path d="M29 5l10 10H29Z" fill={P.papelAresta} opacity="0.8" />
      <g fill={P.aco} opacity="0.5">
        <rect x="14" y="21" width="20" height="2.2" /><rect x="14" y="26" width="20" height="2.2" />
        <rect x="14" y="31" width="13" height="2.2" />
      </g>
    </Svg>
  );
}

/** CARRINHO / COMPRAS — o cesto, em azul. */
export function IwCarrinho(p: Props) {
  return (
    <Svg nome="cart" de={P.azulClaro} para={P.azulEscuro} {...p}>
      <path d="M6 10h6l5 20h20l5-14H15" fill="none" stroke={P.acoEscuro} strokeWidth="2.4"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 17h24l-3.6 10H18.4Z" fill={grad('cart')} stroke={P.azulEscuro} strokeWidth="0.9" />
      <circle cx="19" cy="38" r="3.6" fill={P.acoEscuro} />
      <circle cx="36" cy="38" r="3.6" fill={P.acoEscuro} />
    </Svg>
  );
}

/** CARTÃO — o cartão de pagamento, com a banda e o chip. */
export function IwCartao(p: Props) {
  return (
    <Svg nome="card" de={P.acoClaro} para={P.acoEscuro} {...p}>
      <rect x="4" y="12" width="40" height="25" rx="3" fill={grad('card')}
        stroke={P.acoAresta} strokeWidth="1" />
      <rect x="4" y="17" width="40" height="6" fill="#2F3740" />
      <rect x="9" y="27" width="8" height="6" rx="1" fill={P.ambarClaro} stroke={P.ambarEscuro} strokeWidth="0.8" />
      <g fill="#FFFFFF" opacity="0.55">
        <rect x="24" y="29" width="7" height="2" /><rect x="33" y="29" width="7" height="2" />
      </g>
    </Svg>
  );
}

/** HOTEL / EMPRESA — o edifício, de frente, com as janelas acesas. */
export function IwHotel(p: Props) {
  return (
    <Svg nome="hotel" de={P.acoClaro} para={P.acoEscuro} {...p}>
      <rect x="8" y="6" width="32" height="37" fill={grad('hotel')} stroke={P.acoAresta} strokeWidth="1" />
      <rect x="8" y="6" width="32" height="4" fill={P.azulEscuro} />
      <g fill={P.vidro}>
        {[0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`${r}-${c}`} x={12 + c * 7} y={14 + r * 6} width="4.5" height="4"
            opacity={(r + c) % 3 === 0 ? 0.45 : 0.9} />
        )))}
      </g>
      <rect x="20" y="36" width="8" height="7" fill={P.madeiraEscuro} />
    </Svg>
  );
}

/** RESTAURANTE / MESA — o prato visto de cima, com os cobertos. */
export function IwMesa(p: Props) {
  return (
    <Svg nome="table" de={P.papel} para={P.papelSombra} {...p}>
      <circle cx="24" cy="24" r="15" fill={grad('table')} stroke={P.papelAresta} strokeWidth="1" />
      <circle cx="24" cy="24" r="9" fill="none" stroke={P.papelAresta} strokeWidth="1" />
      <g fill={P.aco}>
        <rect x="5" y="12" width="2.4" height="24" rx="1.2" />
        <rect x="9" y="12" width="2.4" height="10" rx="1.2" />
        <path d="M37 12h3v10a1.5 1.5 0 0 1-3 0Z" />
        <rect x="37.6" y="21" width="1.8" height="15" rx="0.9" />
      </g>
    </Svg>
  );
}

/** FACTURA / RECIBO — a folha com o picotado em baixo e o selo. */
export function IwFactura(p: Props) {
  return (
    <Svg nome="receipt" de={P.papel} para={P.papelSombra} {...p}>
      <path d="M10 5h28v34l-4.7 3-4.6-3-4.7 3-4.6-3-4.7 3Z" fill={grad('receipt')}
        stroke={P.papelAresta} strokeWidth="1" />
      <g fill={P.aco} opacity="0.5">
        <rect x="15" y="13" width="18" height="2.2" /><rect x="15" y="19" width="18" height="2.2" />
        <rect x="15" y="25" width="11" height="2.2" />
      </g>
      <circle cx="31" cy="29" r="5.5" fill="none" stroke={P.vermelho} strokeWidth="1.6" opacity="0.85" />
      <path d="M28.5 29l2 2 3.5-3.5" fill="none" stroke={P.vermelho} strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

/**
 * O MAPA nome → ícone. As chaves são as MESMAS que o resto do sistema já usa
 * (workspace.ts, as fichas de módulo), para que trocar o estilo não obrigue a
 * mexer em nenhum sítio onde um ícone é escolhido.
 */
export const ICONES_WINDOWS: Record<string, (p: Props) => React.ReactElement> = {
  terminal: IwTerminal, pos: IwTerminal, monitor: IwTerminal, screen: IwTerminal,
  gear: IwDefinicoes, settings: IwDefinicoes, config: IwDefinicoes, definicoes: IwDefinicoes,
  folder: IwPasta, pasta: IwPasta, docs: IwPasta,
  app: IwAplicacao, module: IwAplicacao, janela: IwAplicacao,
  bed: IwQuarto, rooms: IwQuarto, quarto: IwQuarto,
  calendar: IwCalendario, reservations: IwCalendario, reserva: IwCalendario,
  chart: IwGrafico, report: IwGrafico, reporting: IwGrafico, grafico: IwGrafico,
  money: IwDinheiro, cashbox: IwDinheiro, caixa: IwDinheiro, dinheiro: IwDinheiro,
  user: IwUtilizadores, users: IwUtilizadores, people: IwUtilizadores, hospedes: IwUtilizadores,
  box: IwCaixa, stock: IwCaixa, inventory: IwCaixa, produtos: IwCaixa, product: IwCaixa,
  key: IwChave, chave: IwChave, acessos: IwChave,
  globe: IwGlobo, channels: IwGlobo, canais: IwGlobo, online: IwGlobo,
  note: IwDocumento, book: IwDocumento, documento: IwDocumento,
  cart: IwCarrinho, compras: IwCarrinho,
  card: IwCartao, pagamento: IwCartao,
  hotel: IwHotel, building: IwHotel, empresa: IwHotel,
  table: IwMesa, restaurante: IwMesa,
  receipt: IwFactura, fatura: IwFactura, factura: IwFactura, fiscal: IwFactura,
};
