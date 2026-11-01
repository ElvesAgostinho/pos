/**
 * PICTOGRAMAS — os ícones cheios do sistema.
 *
 * ─── PORQUE NÃO SÃO DE TRAÇO ──────────────────────────────────────────────
 * Os de traço (lucide) continuam a servir onde um símbolo acompanha texto numa
 * linha apertada: setas de paginação, o visto de uma célula, o × de fechar. Ali
 * o ícone é pontuação.
 *
 * No ribbon e nas barras de ferramentas o trabalho é outro: o ícone é o que o
 * olho procura ANTES de ler a legenda. A 24px, um traço de 1.5px monocromático
 * não se distingue do vizinho — seis botões seguidos lêem-se como seis manchas
 * cinzentas iguais, e volta-se a ler as legendas uma a uma, que é precisamente
 * o que os ícones existem para evitar. Um ícone CHEIO, com a sua cor, reconhece-se
 * de relance ao fim do primeiro dia de uso.
 *
 * ─── O ESTILO, E PORQUÊ ESTE ──────────────────────────────────────────────
 * Silhueta cheia, duas ou três cores, uma face clara em cima e uma aresta mais
 * escura em baixo. É o registo do Primavera V10 e do Office desde 2019.
 *
 * NÃO é 3D com brilho e perspetiva (o registo do Windows XP): esse lê como
 * software de 2005 e é o detalhe que mais envelhece uma interface. O volume
 * aqui vem de duas cores encostadas, não de reflexos.
 *
 * ─── AS MARCAS DE OUTROS ──────────────────────────────────────────────────
 * O logótipo do Excel é marca registada da Microsoft, e isto é um produto que
 * se VENDE. Usar o logótipo verdadeiro dentro dele tem regras próprias da
 * Microsoft e quem responde por elas é quem vende, não quem programa.
 *
 * Por isso o ícone do Excel aqui é DESENHO NOSSO: a folha quadriculada, o verde
 * da folha de cálculo (#1D6F42/#21A366), o canto dobrado e o X branco. Ninguém
 * hesita sobre o que aquele botão faz — e não há marca de ninguém no produto. O
 * mesmo critério para o Word (azul) e o PDF (vermelho).
 *
 * Onde NÃO há marca pelo meio — envelope, pasta, impressora, dinheiro, cama —
 * o desenho é o objecto a sério, sem rodeios.
 *
 * ─── PORQUÊ SVG ESCRITO AQUI ──────────────────────────────────────────────
 *  · PESO — umas centenas de bytes cada, contra 20-60 KB de um PNG;
 *  · NITIDEZ — num ecrã grande de recepção, um PNG de 32px fica desfocado;
 *  · LICENÇA — um ícone desenhado aqui é nosso. Os de um ERP comercial são de
 *    quem os fez, e este sistema vende-se.
 */
import type { ReactElement } from 'react';

const svg = (filhos: ReactElement) => (size: number) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true"
    style={{ display: 'block', flexShrink: 0 }}>{filhos}</svg>
);

/** O desenho de cada pictograma. A chave é o símbolo que os menus já usam. */
const DESENHOS: Record<string, (size: number) => ReactElement> = {

  // ── FICHEIROS DE OUTROS PROGRAMAS ────────────────────────────────────────
  // Desenho nosso com as cores de cada família. Ver a nota sobre marcas no topo.
  excel: svg(<>
    {/* A FIGURA DO EXCEL: folha branca de canto dobrado, uma tira verde em cima
        e o quadrado verde com o X branco a sair por baixo à esquerda. É a
        silhueta que toda a gente reconhece à distância de um metro — e é
        desenho nosso, pela razão explicada no topo deste ficheiro. */}
    <path d="M9 2h12l8 8v19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#FFFFFF" stroke="#C7D6CD" strokeWidth="1.1" />
    <path d="M21 2l8 8h-7a1 1 0 0 1-1-1V2z" fill="#D7E6DC" />
    <path d="M13 13h14M13 17h14M13 21h14" stroke="#B9CFC2" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="2" y="12" width="16" height="16" rx="2.4" fill="#1D6F42" />
    <path d="M2 12h16v4H2z" fill="#21A366" opacity="0.65" />
    <path d="M6.6 17.2l6.8 7.6M13.4 17.2l-6.8 7.6" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" />
  </>),

  word: svg(<>
    <path d="M9 2h12l8 8v19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#FFFFFF" stroke="#C7D2E0" strokeWidth="1.1" />
    <path d="M21 2l8 8h-7a1 1 0 0 1-1-1V2z" fill="#D7E0EE" />
    <path d="M13 13h14M13 17h14M13 21h10" stroke="#B9C6DA" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="2" y="12" width="16" height="16" rx="2.4" fill="#2B579A" />
    <path d="M2 12h16v4H2z" fill="#41A5EE" opacity="0.6" />
    <path d="M5 17.6l1.9 6.6 2.1-6.6 2.1 6.6L13 17.6" fill="none" stroke="#FFFFFF"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
  </>),

  pdf: svg(<>
    <path d="M9 2h12l8 8v19a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" fill="#FFFFFF" stroke="#E0C7C7" strokeWidth="1.1" />
    <path d="M21 2l8 8h-7a1 1 0 0 1-1-1V2z" fill="#EEDADA" />
    <path d="M13 13h14M13 17h14" stroke="#DCBEBE" strokeWidth="1.5" strokeLinecap="round" />
    <rect x="1" y="14" width="19" height="13" rx="2.2" fill="#C8102E" />
    <text x="10.5" y="24" textAnchor="middle" fill="#FFFFFF"
      style={{ font: 'bold 8.5px system-ui, sans-serif', letterSpacing: '0.2px' }}>PDF</text>
  </>),

  // ── COMUNICAÇÃO ──────────────────────────────────────────────────────────
  '✉': svg(<>
    {/* Envelope a sério: corpo claro, aba da frente mais escura, e o V do
        fecho — sem o V não é um envelope, é um rectângulo. */}
    <rect x="2" y="7" width="28" height="19" rx="2" fill="#FFFFFF" stroke="#8FA6BC" strokeWidth="1.2" />
    <path d="M2.8 8.6L16 18.4 29.2 8.6" fill="none" stroke="#2F6FB5" strokeWidth="2.2"
      strokeLinecap="round" strokeLinejoin="round" />
    <path d="M2 25.2l10.6-8.1M30 25.2l-10.6-8.1" stroke="#C3D2E0" strokeWidth="1.6" strokeLinecap="round" />
  </>),

  '☎': svg(<>
    <path d="M7 4h5l2.4 6-3 2.2a16 16 0 0 0 8.4 8.4l2.2-3 6 2.4v5a3 3 0 0 1-3 3C13.8 28 4 18.2 4 7a3 3 0 0 1 3-3z"
      fill="#2F6FB5" />
    <path d="M7 4h5l2.4 6-3 2.2a16 16 0 0 0 3 4.1C10.6 13 8.6 8.8 8.2 4H7z" fill="#4E8FD4" />
  </>),

  // ── ARQUIVO ──────────────────────────────────────────────────────────────
  '🗂': svg(<>
    {/* A pasta de arquivo: a lingueta atrás, o corpo à frente, duas cores. */}
    <path d="M3 8a2 2 0 0 1 2-2h7.6l2.6 3H27a2 2 0 0 1 2 2v3H3V8z" fill="#D9941F" />
    <path d="M3 12h26a2 2 0 0 1 2 2l-2.4 11a2 2 0 0 1-2 1.6H5.4a2 2 0 0 1-2-1.6L1 14a2 2 0 0 1 2-2z" fill="#F2B544" />
    <path d="M3 12h26a2 2 0 0 1 2 2l-.4 2H1.4L1 14a2 2 0 0 1 2-2z" fill="#F7C96B" />
  </>),

  '📄': svg(<>
    <path d="M6 3h13l7 7v19a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="#FFFFFF" stroke="#7D9BB5" strokeWidth="1.5" />
    {/* A faixa azul é a mancha: é ela que se vê antes de se ver o resto. */}
    <path d="M19 3l7 7h-6a1 1 0 0 1-1-1V3z" fill="#A8BDD0" />
    <rect x="4" y="13" width="22" height="4.5" fill="#2F6FB5" opacity="0.14" />
    <path d="M8 15.2h14M8 20h14M8 24.4h9" stroke="#5A7A96" strokeWidth="1.9" strokeLinecap="round" />
  </>),

  pastaAberta: svg(<>
    <path d="M3 8a2 2 0 0 1 2-2h7.6l2.6 3H27a2 2 0 0 1 2 2v3H3V8z" fill="#D9941F" />
    {/* A frente baixada e inclinada é o que diz "aberta" sem precisar de setas. */}
    <path d="M6.4 14h25.2a1.4 1.4 0 0 1 1.34 1.82l-3.1 10.2A2 2 0 0 1 27.72 27.4H3.4a1.4 1.4 0 0 1-1.34-1.82l3.1-10.2A2 2 0 0 1 6.4 14z" fill="#F2B544" />
  </>),

  '📑': svg(<>
    {/* Duas folhas sobrepostas com um separador colorido — "vários registos",
        que é o que estes ecrãs mostram. */}
    <rect x="4" y="7" width="18" height="23" rx="2" fill="#C3D2E0" />
    <rect x="8" y="4" width="18" height="23" rx="2" fill="#FFFFFF" stroke="#7D9BB5" strokeWidth="1.5" />
    <rect x="8" y="4" width="18" height="4.5" rx="2" fill="#2F6FB5" />
    <path d="M12 14h10M12 18h10M12 22h6" stroke="#5A7A96" strokeWidth="1.9" strokeLinecap="round" />
    <path d="M24 2.5v8l-2.6-2-2.6 2v-8z" fill="#D9941F" />
  </>),

  '🧾': svg(<>
    {/* Recibo: o rasgado em baixo é o que o distingue de uma folha. */}
    <path d="M5 3h22v24l-3-2-3 2-3-2-3 2-3-2-3 2-2-1.4V3z" fill="#FFFFFF" stroke="#8FA6BC" strokeWidth="1.2" strokeLinejoin="round" />
    <path d="M10 10h12M10 15h12M10 20h8" stroke="#2F6FB5" strokeWidth="1.8" strokeLinecap="round" />
  </>),

  // ── NÚMEROS ──────────────────────────────────────────────────────────────
  '📊': svg(<>
    <rect x="3" y="4" width="26" height="24" rx="2" fill="#FFFFFF" stroke="#C3D2E0" strokeWidth="1.2" />
    <rect x="7" y="16" width="4.5" height="8" rx="1" fill="#2F6FB5" />
    <rect x="13.8" y="11" width="4.5" height="13" rx="1" fill="#3C8C4E" />
    <rect x="20.6" y="7" width="4.5" height="17" rx="1" fill="#D9941F" />
  </>),

  '📈': svg(<>
    <rect x="3" y="4" width="26" height="24" rx="2" fill="#FFFFFF" stroke="#C3D2E0" strokeWidth="1.2" />
    <path d="M7 22l6-6 4.5 4L25 10" fill="none" stroke="#3C8C4E" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" />
    <path d="M20 10h5v5" fill="none" stroke="#3C8C4E" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" />
  </>),

  // ── DINHEIRO ─────────────────────────────────────────────────────────────
  '💰': svg(<>
    <ellipse cx="16" cy="9" rx="10" ry="3.6" fill="#E8B23A" />
    <path d="M6 9v5c0 2 4.5 3.6 10 3.6S26 16 26 14V9" fill="#C9962A" />
    <ellipse cx="16" cy="14" rx="10" ry="3.6" fill="#F2C94C" />
    <path d="M6 14v6c0 2 4.5 3.6 10 3.6S26 22 26 20v-6" fill="#C9962A" />
    <ellipse cx="16" cy="20" rx="10" ry="3.6" fill="#F2C94C" />
  </>),

  '💳': svg(<>
    <rect x="2" y="7" width="28" height="18" rx="2.5" fill="#2F6FB5" />
    <rect x="2" y="11" width="28" height="4" fill="#1F4E80" />
    <rect x="5" y="18" width="7" height="4" rx="1" fill="#F2C94C" />
  </>),

  // ── COISAS E LUGARES ─────────────────────────────────────────────────────
  '📦': svg(<>
    <path d="M16 3l13 5.5-13 5.5L3 8.5z" fill="#D9941F" />
    <path d="M3 8.5l13 5.5V29L3 23.5z" fill="#B87C19" />
    <path d="M29 8.5L16 14v15l13-5.5z" fill="#F2B544" />
  </>),

  '🛏': svg(<>
    <path d="M3 10v16h3v-4h20v4h3V17a5 5 0 0 0-5-5H14v6H6v-8z" fill="#8FA6BC" />
    <rect x="6" y="12" width="7" height="5" rx="2" fill="#FFFFFF" />
    <path d="M14 12h10a5 5 0 0 1 5 5H14v-5z" fill="#A8BDD0" />
  </>),

  '🏢': svg(<>
    <rect x="5" y="3" width="14" height="26" fill="#5A7A96" />
    <rect x="19" y="11" width="9" height="18" fill="#7D9BB5" />
    <g fill="#FFFFFF">
      <rect x="8" y="6" width="3" height="3" /><rect x="13" y="6" width="3" height="3" />
      <rect x="8" y="11" width="3" height="3" /><rect x="13" y="11" width="3" height="3" />
      <rect x="8" y="16" width="3" height="3" /><rect x="13" y="16" width="3" height="3" />
      <rect x="21.5" y="14" width="3" height="3" /><rect x="21.5" y="19" width="3" height="3" />
    </g>
  </>),

  '🏛': svg(<>
    <path d="M16 3l13 6H3z" fill="#7D9BB5" />
    <g fill="#5A7A96">
      <rect x="6" y="11" width="3.5" height="13" /><rect x="12.2" y="11" width="3.5" height="13" />
      <rect x="18.4" y="11" width="3.5" height="13" /><rect x="24.6" y="11" width="3.5" height="13" />
    </g>
    <rect x="3" y="24" width="26" height="4" rx="1" fill="#7D9BB5" />
  </>),

  '🏪': svg(<>
    <path d="M4 10h24l2 5a4 4 0 0 1-8 0 4 4 0 0 1-8 0 4 4 0 0 1-8 0z" fill="#C8562B" />
    <rect x="5" y="15" width="22" height="13" fill="#E0E8EF" />
    <rect x="12" y="19" width="8" height="9" fill="#5A7A96" />
    <rect x="5" y="6" width="22" height="4" rx="1" fill="#9E4322" />
  </>),

  '🖥': svg(<>
    <rect x="2" y="4" width="28" height="18" rx="2" fill="#4A6B8A" />
    <rect x="4" y="6" width="24" height="14" rx="1" fill="#CFE0EE" />
    <path d="M12 26h8l1 3H11z" fill="#4A6B8A" />
    <rect x="9" y="28" width="14" height="2" rx="1" fill="#2F4A63" />
  </>),

  '🖨': svg(<>
    <rect x="7" y="3" width="18" height="8" rx="1" fill="#C3D2E0" />
    <rect x="4" y="11" width="24" height="11" rx="2" fill="#5A7A96" />
    <rect x="24" y="14" width="2.5" height="2.5" rx="1.2" fill="#3C8C4E" />
    <rect x="8" y="18" width="16" height="11" rx="1" fill="#FFFFFF" stroke="#C3D2E0" strokeWidth="1.2" />
    <path d="M11 22h10M11 25h7" stroke="#9FB3C6" strokeWidth="1.6" strokeLinecap="round" />
  </>),

  // ── PESSOAS ──────────────────────────────────────────────────────────────
  '👤': svg(<>
    <circle cx="16" cy="10" r="6" fill="#4E8FD4" />
    <path d="M4 29c0-6.2 5.4-10 12-10s12 3.8 12 10z" fill="#2F6FB5" />
  </>),

  '👥': svg(<>
    <circle cx="23" cy="11" r="5" fill="#8FA6BC" />
    <path d="M14 28c0-5.2 4.2-8.4 9-8.4s9 3.2 9 8.4z" fill="#8FA6BC" />
    <circle cx="12" cy="10" r="6" fill="#4E8FD4" />
    <path d="M1 29c0-6 4.9-9.6 11-9.6S23 23 23 29z" fill="#2F6FB5" />
  </>),

  '🪪': svg(<>
    <rect x="2" y="6" width="28" height="20" rx="2.5" fill="#FFFFFF" stroke="#8FA6BC" strokeWidth="1.3" />
    <rect x="2" y="6" width="28" height="4.5" rx="2.5" fill="#2F6FB5" />
    <circle cx="11" cy="17" r="3.6" fill="#4E8FD4" />
    <path d="M6 24c0-2.8 2.2-4.4 5-4.4s5 1.6 5 4.4z" fill="#2F6FB5" />
    <path d="M19 15h8M19 19h8M19 23h5" stroke="#C3D2E0" strokeWidth="1.8" strokeLinecap="round" />
  </>),

  // ── TEMPO E EVENTOS ──────────────────────────────────────────────────────
  '🕐': svg(<>
    <circle cx="16" cy="16" r="13" fill="#FFFFFF" stroke="#5A7A96" strokeWidth="2.2" />
    <path d="M16 8v8.6l5.6 3.4" fill="none" stroke="#C8562B" strokeWidth="2.4"
      strokeLinecap="round" strokeLinejoin="round" />
  </>),

  '🎉': svg(<>
    <path d="M4 28l7-17 10 10z" fill="#C8562B" />
    <path d="M4 28l4.4-10.6L15 24z" fill="#E07A4A" />
    <circle cx="23" cy="7" r="2.2" fill="#F2C94C" />
    <circle cx="28" cy="13" r="1.8" fill="#3C8C4E" />
    <circle cx="19" cy="4" r="1.6" fill="#2F6FB5" />
  </>),

  '🌙': svg(<>
    <path d="M24 20A11 11 0 0 1 12 8a11 11 0 1 0 12 12z" fill="#5A6BA8" />
    <path d="M24 20a11 11 0 0 1-9.4 5.4A11 11 0 0 0 23 10a11 11 0 0 1 1 10z" fill="#8491C9" />
  </>),

  // ── SISTEMA ──────────────────────────────────────────────────────────────
  '⚙': svg(<>
    <path d="M16 2l2.2 3.6 4.2-.6 1 4.1 3.9 1.6-1.6 3.9 2.6 3.3-3.3 2.6.6 4.2-4.1 1-1.6 3.9-3.9-1.6L16 31l-2.4-3-3.9 1.6-1.6-3.9-4.1-1 .6-4.2L1.3 18l2.6-3.3-1.6-3.9 3.9-1.6 1-4.1 4.2.6z"
      fill="#7D9BB5" />
    <circle cx="16" cy="16" r="6" fill="#FFFFFF" />
    <circle cx="16" cy="16" r="3" fill="#5A7A96" />
  </>),

  '🔧': svg(<>
    <path d="M22.6 3a8 8 0 0 0-7.2 11.6L3.6 26.4a2.6 2.6 0 0 0 3.7 3.7L19.1 18.3A8 8 0 0 0 29.4 8l-4.6 4.6-4-1-1-4L24.4 3z"
      fill="#8FA6BC" />
  </>),

  '🔑': svg(<>
    <circle cx="10" cy="11" r="7" fill="none" stroke="#D9941F" strokeWidth="4" />
    <path d="M14.6 15.6L27 28M22 23l3-3M25 20l3-3" stroke="#D9941F" strokeWidth="4" strokeLinecap="round" />
  </>),

  '🔒': svg(<>
    <path d="M10 14V10a6 6 0 0 1 12 0v4" fill="none" stroke="#8FA6BC" strokeWidth="3.4" strokeLinecap="round" />
    <rect x="5" y="14" width="22" height="15" rx="2.5" fill="#D9941F" />
    <circle cx="16" cy="21" r="2.6" fill="#8A5E12" />
  </>),

  '🛡': svg(<>
    <path d="M16 2l12 4.5v9c0 7.4-5 12.8-12 15.5C9 28.3 4 22.9 4 15.5v-9z" fill="#3C8C4E" />
    <path d="M16 2l12 4.5v9c0 7.4-5 12.8-12 15.5z" fill="#2E7138" />
    <path d="M10.5 15.5l4 4 7.5-7.5" fill="none" stroke="#FFFFFF" strokeWidth="2.8"
      strokeLinecap="round" strokeLinejoin="round" />
  </>),

  '🔍': svg(<>
    <circle cx="13.5" cy="13.5" r="8.5" fill="#DCE9F5" stroke="#2F6FB5" strokeWidth="2.6" />
    <path d="M19.8 19.8L28 28" stroke="#2F6FB5" strokeWidth="3.4" strokeLinecap="round" />
  </>),

  '🛒': svg(<>
    <path d="M2 4h4.2l3.4 15.4h14.6l2.8-10.4H9" fill="none" stroke="#C8562B" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" />
    <circle cx="12" cy="26" r="2.6" fill="#C8562B" />
    <circle cx="23" cy="26" r="2.6" fill="#C8562B" />
  </>),

  '⭐': svg(<>
    <path d="M16 3l4 8.4 9.2 1.2-6.7 6.4 1.7 9.1L16 23.8 7.8 28.1l1.7-9.1L2.8 12.6 12 11.4z" fill="#F2C94C" />
    <path d="M16 3l4 8.4 9.2 1.2-6.7 6.4 1.7 9.1L16 23.8z" fill="#D9A41F" />
  </>),

  '♥': svg(<>
    <path d="M16 28S3 20.2 3 11.6A6.6 6.6 0 0 1 16 8.4 6.6 6.6 0 0 1 29 11.6C29 20.2 16 28 16 28z" fill="#C0392B" />
  </>),

  // ── LISTAS, LIGAÇÕES E IMAGENS ─────────────────────────────────
  '📋': svg(<>
    {/* Prancheta: a mola metálica em cima é o que a distingue de uma folha. */}
    <rect x="5" y="4" width="22" height="26" rx="2.5" fill="#D9941F" />
    <rect x="7.5" y="7" width="17" height="20.5" rx="1.5" fill="#FFFFFF" />
    <rect x="11" y="1.5" width="10" height="5.5" rx="1.8" fill="#8FA6BC" />
    <path d="M11 13h10M11 17h10M11 21h7" stroke="#9FB3C6" strokeWidth="1.8" strokeLinecap="round" />
  </>),

  '🔗': svg(<>
    {/* Dois elos de corrente — o símbolo universal de ligação. */}
    <path d="M13 19l6-6" stroke="#5A7A96" strokeWidth="2.6" strokeLinecap="round" />
    <path d="M17.5 8.5l2.5-2.5a6 6 0 0 1 8.5 8.5L26 17" fill="none" stroke="#2F6FB5"
      strokeWidth="3.2" strokeLinecap="round" />
    <path d="M14.5 23.5L12 26a6 6 0 0 1-8.5-8.5L6 15" fill="none" stroke="#2F6FB5"
      strokeWidth="3.2" strokeLinecap="round" />
  </>),

  '🖼': svg(<>
    <rect x="2" y="5" width="28" height="22" rx="2.5" fill="#FFFFFF" stroke="#8FA6BC" strokeWidth="1.3" />
    <circle cx="10" cy="12" r="2.8" fill="#F2C94C" />
    <path d="M3.5 25.8l7.5-8.4 5 5.2 4.5-5.4 8 8.6z" fill="#3C8C4E" />
  </>),

  '💸': svg(<>
    {/* Dinheiro a SAIR: a nota com a seta para fora — pagamentos, despesa. */}
    <rect x="2" y="9" width="24" height="14" rx="2" fill="#3C8C4E" />
    <rect x="5" y="12" width="18" height="8" rx="1" fill="#5CA86E" />
    <circle cx="14" cy="16" r="3" fill="#FFFFFF" opacity="0.85" />
    <path d="M24 5l6 5-6 5" fill="none" stroke="#C8562B" strokeWidth="2.6"
      strokeLinecap="round" strokeLinejoin="round" />
  </>),
};

/* ─── OS QUE O PAINEL DE INFORMAÇÃO TROUXE ─────────────────────────
   Sete símbolos que os menus nunca tinham pedido e o painel pede: a vassoura
   (quartos e mesas por limpar), o calendário (chegadas), a porta (saídas), o
   prato (mesas), o chapéu de chef (cozinha), o banco (caixas abertas) e o
   alfinete (barra de acesso rápido).

   Desenhá-los é melhor do que lhes dar um símbolo parecido que já exista: num
   painel de seis números, dois mosaicos com o mesmo desenho obrigam a ler os
   rótulos — e é exactamente isso que os ícones estão ali para evitar. Antes de
   os desenhar, "Por limpar" e "Saídas hoje" saíam os dois como a folha
   genérica, que era o mesmo que não terem ícone nenhum. */

/** VASSOURA — o que está por limpar. */
DESENHOS['🧹'] = svg(<>
  <rect x="14.5" y="3" width="3" height="13" rx="1.5" fill="#A9743F" />
  <path d="M9 16h14l2 12H7Z" fill="#E0A94A" stroke="#B9822C" strokeWidth="1" />
  <path d="M9 16h14l.6 3.6H8.4Z" fill="#C8902F" />
  <g stroke="#B9822C" strokeWidth="0.9">
    <path d="M11 20.5v7.5" /><path d="M14.3 20.5v7.5" /><path d="M17.7 20.5v7.5" /><path d="M21 20.5v7.5" />
  </g>
</>);

/** CALENDÁRIO — as chegadas de hoje. */
DESENHOS['📅'] = svg(<>
  <rect x="4" y="6" width="24" height="22" rx="2" fill="#FFFFFF" stroke="#C3D2E0" strokeWidth="1.2" />
  <path d="M4 8a2 2 0 0 1 2-2h20a2 2 0 0 1 2 2v4H4Z" fill="#C0504A" />
  <g fill="#4A5461">
    <rect x="8" y="3" width="2.6" height="6" rx="1.3" /><rect x="21.4" y="3" width="2.6" height="6" rx="1.3" />
  </g>
  <g fill="#9AA6B4">
    <rect x="7.5" y="15" width="4" height="3.4" rx="0.6" /><rect x="14" y="15" width="4" height="3.4" rx="0.6" />
    <rect x="20.5" y="15" width="4" height="3.4" rx="0.6" /><rect x="14" y="20.5" width="4" height="3.4" rx="0.6" />
    <rect x="20.5" y="20.5" width="4" height="3.4" rx="0.6" />
  </g>
  <rect x="7.5" y="20.5" width="4" height="3.4" rx="0.6" fill="#2F6FB5" />
</>);

/** PORTA — as saídas de hoje. */
DESENHOS['🚪'] = svg(<>
  <rect x="6" y="3" width="20" height="26" rx="1.5" fill="#B07B4F" stroke="#8A5C36" strokeWidth="1.1" />
  <rect x="9" y="6" width="14" height="20" rx="1" fill="#C89468" />
  <circle cx="20.5" cy="16.5" r="1.6" fill="#E0A94A" stroke="#B9822C" strokeWidth="0.7" />
</>);

/** PRATO E TALHERES — as mesas. */
DESENHOS['🍽'] = svg(<>
  <circle cx="16" cy="16" r="10" fill="#FFFFFF" stroke="#C3D2E0" strokeWidth="1.2" />
  <circle cx="16" cy="16" r="6" fill="none" stroke="#DCE3EA" strokeWidth="1.2" />
  <g fill="#8793A1">
    <rect x="2.5" y="5" width="1.8" height="22" rx="0.9" />
    <path d="M26 5h2.4v7a1.2 1.2 0 0 1-2.4 0Z" /><rect x="26.6" y="11" width="1.6" height="16" rx="0.8" />
  </g>
</>);

/** CHAPÉU DE CHEF — a cozinha. */
DESENHOS['👨‍🍳'] = svg(<>
  <path d="M8 18a6 6 0 1 1 2.4-11.5A6 6 0 0 1 21.6 6.5 6 6 0 1 1 24 18Z"
    fill="#FFFFFF" stroke="#C3D2E0" strokeWidth="1.2" />
  <rect x="8" y="18" width="16" height="9" rx="1.5" fill="#EDF1F5" stroke="#C3D2E0" strokeWidth="1.2" />
  <g stroke="#C3D2E0" strokeWidth="1"><path d="M13 18v9" /><path d="M19 18v9" /></g>
</>);

/** BANCO — as caixas abertas. */
DESENHOS['🏦'] = svg(<>
  <path d="M16 3 30 10H2Z" fill="#6B7786" stroke="#4A5461" strokeWidth="1" />
  <g fill="#8793A1" stroke="#4A5461" strokeWidth="0.9">
    <rect x="6" y="12" width="3.5" height="12" /><rect x="14.2" y="12" width="3.5" height="12" />
    <rect x="22.5" y="12" width="3.5" height="12" />
  </g>
  <rect x="2" y="24" width="28" height="4" rx="1" fill="#6B7786" stroke="#4A5461" strokeWidth="1" />
</>);

/** ALFINETE — fixado na barra de acesso rápido. */
DESENHOS['📌'] = svg(<>
  <path d="M19 3 29 13l-3.5 1.2-1.6 5.3-8.4-8.4 5.3-1.6Z" fill="#C0504A" stroke="#9A4236" strokeWidth="1" />
  <path d="M15.5 11.1 20.9 16.5 8 29Z" fill="#8793A1" stroke="#4A5461" strokeWidth="1" />
</>);

/**
 * OUTROS NOMES PARA O MESMO DESENHO.
 *
 * Os menus foram escritos ao longo de meses por mãos diferentes: uns pedem a
 * lupa por '🔍', outros por '🔎'; uns a impressora por '🖨', outros por '🖶'. São o
 * mesmo comando e têm de ter o mesmo ícone — e andar a uniformizar as chamadas
 * uma a uma deixaria sempre uma por fazer. Aqui o nome alternativo aponta para
 * o desenho que já existe.
 */
const ALIAS: Record<string, string> = {
  '🔎': '🔍',   // lupa
  '🖶': '🖨',   // impressora
  '🧑': '👤',   // pessoa
  '✉': '✉',
  excel_xlsx: 'excel',
};
for (const [de, para] of Object.entries(ALIAS)) {
  if (DESENHOS[para] && !DESENHOS[de]) DESENHOS[de] = DESENHOS[para];
}

/**
 * O SELECTOR DE VARIAÇÃO (U+FE0F) TIRA-SE ANTES DE PROCURAR.
 *
 * O mesmo símbolo escreve-se de duas maneiras: "🍽" e "🍽️" — o segundo leva um
 * caractere invisível a seguir que pede ao sistema para o desenhar a cores. São
 * o mesmo desenho para quem lê e dois textos DIFERENTES para o código.
 *
 * Os menus foram escritos sem ele e o Centro de Operações (que vem do servidor)
 * com ele. Resultado: o pictograma aparecia nos menus e no painel saía o emoji
 * colorido do sistema operativo — precisamente o que não se quer. Um alias por
 * símbolo resolvia os de hoje e deixava o próximo por resolver.
 */
const limpar = (nome: string) => (nome || '').replace(/\uFE0F/g, '');

/** Há desenho cheio para este símbolo? */
export function temPictograma(nome: string): boolean {
  return !!DESENHOS[limpar(nome)];
}

export default function Pictograma({ nome, size = 22 }: { nome: string; size?: number }) {
  const desenho = DESENHOS[limpar(nome)];
  return desenho ? desenho(size) : null;
}
