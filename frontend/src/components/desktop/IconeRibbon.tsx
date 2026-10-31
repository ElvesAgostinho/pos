/**
 * ÍCONES DO RIBBON — pictogramas coloridos, no registo dos ERP de gestão.
 *
 * Os ícones de traço (lucide) continuam a servir onde um símbolo acompanha
 * texto numa linha: botões pequenos, células de grelha, menus. Aqui é outro
 * trabalho: no ribbon o ícone é o que se procura com o olho antes de ler a
 * legenda, e um traço fino monocromático a 18px não se distingue do vizinho —
 * num grupo de cinco botões, lêem-se todos como "um desenho cinzento".
 *
 * Por isso são CHEIOS e COLORIDOS, e cada acção tem a sua cor: verde o que
 * cria, azul o que grava, vermelho o que apaga, âmbar o que procura. É a cor
 * que se reconhece de relance ao fim do primeiro dia de uso — e é por isso que
 * todos os ERP desta família (Comarch, PRODAT, Primavera, SAP B1) os desenham
 * assim, e não por serem antigos.
 *
 * Desenhados em SVG aqui, e não trazidos de uma biblioteca:
 *  · PESO — algumas centenas de bytes cada, contra 20-60 KB de um PNG;
 *  · NITIDEZ — num ecrã grande de recepção um PNG de 32px fica desfocado;
 *  · LICENÇA — um ícone desenhado aqui é nosso. Ícones de um ERP comercial
 *    são propriedade de quem os fez, e este sistema vende-se.
 *
 * A linguagem é a mesma em todos: silhueta cheia, uma cor base, uma aresta
 * clara em cima, e um emblema pequeno no canto inferior direito a dizer o que
 * a acção FAZ ao objecto (+ criar, ✓ gravar, × apagar).
 */

type Props = { size?: number };

/** O papel — a base de quase todos: um documento com o canto dobrado. */
function Papel({ fill = '#FFFFFF', stroke = '#6B7D8F' }: { fill?: string; stroke?: string }) {
  return (
    <>
      <path d="M7 2h11l6 6v22a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z"
        fill={fill} stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M18 2v6h6" fill="none" stroke={stroke} strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 14h12M9 19h12M9 24h8" stroke="#AEBECD" strokeWidth="1.6" strokeLinecap="round" />
    </>
  );
}

/** O emblema do canto — o círculo colorido que diz o que a acção faz. */
function Emblema({ cor, children }: { cor: string; children: React.ReactNode }) {
  return (
    <>
      <circle cx="23.5" cy="23.5" r="8" fill="#FFFFFF" />
      <circle cx="23.5" cy="23.5" r="7" fill={cor} />
      {children}
    </>
  );
}

const SVG = (filhos: React.ReactNode) => (size: number) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">{filhos}</svg>
);

const DESENHOS: Record<string, (size: number) => React.ReactElement> = {
  // ── CRIAR — verde, o que acrescenta ───────────────────────────────────
  novo: SVG(<>
    <Papel />
    <Emblema cor="#2E8B36">
      <path d="M23.5 20v7M20 23.5h7" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
    </Emblema>
  </>),

  // ── EDITAR — o lápis sobre o papel ────────────────────────────────────
  editar: SVG(<>
    <Papel />
    <path d="M28.6 12.3l2.1 2.1-9.1 9.1-2.9.8.8-2.9z" fill="#F2B233" stroke="#9A6B12" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M27.2 13.7l2.1 2.1" stroke="#9A6B12" strokeWidth="1.2" />
  </>),

  // ── GRAVAR — a disquete, azul. Ninguém usa disquetes e toda a gente
  //    sabe o que este símbolo faz: é o caso raro em que o objecto morreu
  //    e o símbolo ficou. Trocá-lo por uma seta obrigava a reaprender.
  gravar: SVG(<>
    <path d="M4 5h19l5 5v17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 0-2z"
      fill="#2F6FB0" stroke="#1E4C7D" strokeWidth="1.4" strokeLinejoin="round" />
    <rect x="9" y="5" width="12" height="8" fill="#DCE9F5" stroke="#1E4C7D" strokeWidth="1.2" />
    <rect x="16.5" y="6.5" width="3" height="5" fill="#1E4C7D" />
    <rect x="8" y="18" width="16" height="9" fill="#F2F6FA" stroke="#1E4C7D" strokeWidth="1.2" />
    <path d="M10.5 21h11M10.5 24h8" stroke="#8FB0CE" strokeWidth="1.4" strokeLinecap="round" />
  </>),

  // ── ELIMINAR — vermelho, e com o caixote: é a acção que não se desfaz,
  //    e o símbolo tem de dizer isso antes de se ler a legenda.
  eliminar: SVG(<>
    <Papel />
    <path d="M17 19h13l-1.2 11a2 2 0 0 1-2 1.8h-6.6a2 2 0 0 1-2-1.8z"
      fill="#C8372D" stroke="#8E241C" strokeWidth="1.3" strokeLinejoin="round" />
    <path d="M15.5 17.5h16" stroke="#8E241C" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M21 15.5h5v2h-5z" fill="#8E241C" />
    <path d="M21 22.5v6M26 22.5v6" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" />
  </>),

  // ── DUPLICAR — dois papéis ────────────────────────────────────────────
  duplicar: SVG(<>
    <g opacity="0.55"><Papel /></g>
    <g transform="translate(5,5) scale(0.86)"><Papel /></g>
  </>),

  // ── PESQUISAR — a lupa, âmbar ─────────────────────────────────────────
  pesquisar: SVG(<>
    <circle cx="14" cy="14" r="9" fill="#EAF2FA" stroke="#2F6FB0" strokeWidth="2.4" />
    <circle cx="14" cy="14" r="5.5" fill="#FFFFFF" opacity="0.65" />
    <path d="M20.5 20.5l8 8" stroke="#F2B233" strokeWidth="4" strokeLinecap="round" />
    <path d="M20.5 20.5l8 8" stroke="#9A6B12" strokeWidth="1.4" strokeLinecap="round" />
  </>),

  // ── ATUALIZAR — as duas setas em ciclo, verde ─────────────────────────
  atualizar: SVG(<>
    <path d="M16 5a11 11 0 0 1 10.4 7.5" fill="none" stroke="#2E8B36" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M27.5 5.5v7.5h-7.5z" fill="#2E8B36" />
    <path d="M16 27a11 11 0 0 1-10.4-7.5" fill="none" stroke="#49A552" strokeWidth="3.4" strokeLinecap="round" />
    <path d="M4.5 26.5V19h7.5z" fill="#49A552" />
  </>),

  // ── IMPRIMIR — a impressora com a folha a sair ────────────────────────
  imprimir: SVG(<>
    <rect x="8" y="3" width="16" height="9" fill="#FFFFFF" stroke="#6B7D8F" strokeWidth="1.4" />
    <path d="M5 12h22a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-3v-7H8v7H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z"
      fill="#56687A" stroke="#3B4957" strokeWidth="1.3" strokeLinejoin="round" />
    <circle cx="25" cy="16" r="1.5" fill="#6FD66F" />
    <rect x="8" y="19" width="16" height="11" fill="#FFFFFF" stroke="#6B7D8F" strokeWidth="1.4" />
    <path d="M11 23h10M11 26h7" stroke="#AEBECD" strokeWidth="1.5" strokeLinecap="round" />
  </>),

  // ── EXPORTAR — o papel com a seta a sair, verde (Excel) ───────────────
  exportar: SVG(<>
    <Papel />
    <Emblema cor="#1F7A3D">
      <path d="M23.5 27.5V19.5M20.3 22.7l3.2-3.2 3.2 3.2" fill="none" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </Emblema>
  </>),

  // ── ANEXOS — o clipe ──────────────────────────────────────────────────
  anexos: SVG(<>
    <Papel />
    <path d="M26 10.5v12a5 5 0 0 1-10 0V9a3 3 0 0 1 6 0v12.5a1.4 1.4 0 0 1-2.8 0V11"
      fill="none" stroke="#8795A4" strokeWidth="2.4" strokeLinecap="round" />
  </>),

  // ── HISTÓRICO — o relógio com a seta para trás ────────────────────────
  historico: SVG(<>
    <circle cx="16" cy="17" r="12" fill="#EAF2FA" stroke="#2F6FB0" strokeWidth="2" />
    <path d="M16 10v7.5l5 3" fill="none" stroke="#1E4C7D" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M5 8.5v6h6" fill="none" stroke="#2F6FB0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </>),

  // ── AUDITORIA — a prancheta com o visto ───────────────────────────────
  auditoria: SVG(<>
    <rect x="6" y="4" width="20" height="26" fill="#FFFFFF" stroke="#6B7D8F" strokeWidth="1.5" />
    <rect x="11" y="2" width="10" height="5" rx="1" fill="#8795A4" stroke="#56687A" strokeWidth="1.2" />
    <path d="M10 14h12M10 19h12" stroke="#AEBECD" strokeWidth="1.6" strokeLinecap="round" />
    <Emblema cor="#2E8B36">
      <path d="M20 23.6l2.6 2.8 4.4-5" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </Emblema>
  </>),
};

/** O nome da acção do ribbon → o desenho. Desconhecido = nada (o chamador
 *  continua a ter a legenda, que é o que importa não perder). */
export default function IconeRibbon({ nome, size = 26 }: Props & { nome: string }) {
  const desenho = DESENHOS[nome];
  if (!desenho) return null;
  return desenho(size);
}

export const TEM_ICONE = (nome: string) => Boolean(DESENHOS[nome]);
