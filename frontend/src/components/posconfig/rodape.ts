/**
 * O RODAPÉ DE UM RELATÓRIO — a aritmética, fora do ecrã para se poder testar.
 *
 * A grelha recalcula os totais sobre as linhas que passam nos filtros, porque o
 * rodapé tem de falar do que está à vista. Fazia-o somando as colunas à bruta, e
 * isso DESFAZIA a conta que o servidor tinha feito. Em seis relatórios o número
 * que o contabilista lia estava errado:
 *
 *   · Documentos: somava a factura ANULADA e a NOTA DE CRÉDITO como vendas
 *     (23 940 Kz num dia em que a casa facturou 15 960);
 *   · Depósitos: somava a utilização ao adiantamento (70 000 onde há 30 000);
 *   · Consumos do PMS: somava um PAGAMENTO aos consumos;
 *   · Pontos: somava os pontos resgatados aos ganhos;
 *   · Reservas: somava as canceladas e os no-shows à receita;
 *   · Ocupação: somava percentagens — 125% de ocupação, e um ADR que é a soma
 *     de dois ADR; e dizia 0 acessos falhados onde houve 2.
 *
 * Duas regras resolvem os seis, e qualquer relatório futuro:
 *
 *   1. `_peso` — o servidor diz quanto PESA cada linha no total: 1 normalmente,
 *      0 numa linha que não é dinheiro da casa (factura anulada, reserva
 *      cancelada, um pagamento num relatório de consumos) e −1 numa que o
 *      devolve (nota de crédito, utilização de depósito, pontos usados). Uma
 *      linha sem `_peso` vale 1, como sempre valeu.
 *
 *   2. UM TOTAL QUE NÃO É UMA SOMA NÃO SE RECALCULA. Percentagens, ADR, RevPAR
 *      e contagens são do PERÍODO: não há soma de linhas que lhes dê o valor.
 *      Mede-se COM AS LINHAS TODAS se o total do servidor é a soma pesada
 *      delas; quando não é, o número do servidor fica como está e o rodapé diz
 *      que é do período, em vez de inventar um a somar.
 *
 * Esta regra não precisa que o servidor declare nada de novo: calibra-se com os
 * dados que já vêm, e por isso serve os 51 relatórios do catálogo e os que
 * vierem depois.
 */

/** Uma coluna, como o servidor a anuncia: [chave, título] ou [chave, título, 'money']. */
export type Coluna = [string, string, string?];

/** O MESMO número que o ecrã lê: sem espaços, vírgula decimal, e o que não é número é nulo. */
export const num = (v: any): number | null => {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
};

export const eDinheiro = (c: Coluna) => c[2] === 'money';

/** Quanto esta linha pesa no total. Sem `_peso`, pesa 1. */
export const peso = (r: any): number => (r?._peso === undefined ? 1 : (num(r._peso) ?? 1));

/** A soma de uma coluna, pesando cada linha. */
export const somaPesada = (linhas: any[], chave: string): number =>
  linhas.reduce((s, r) => s + (num(r[chave]) ?? 0) * peso(r), 0);

/**
 * Quais dos totais do servidor SÃO a soma pesada das linhas — e por isso se
 * podem recalcular sobre um subconjunto filtrado. Mede-se uma vez, com as
 * linhas todas.
 */
export function quaisSaoSomaveis(linhas: any[], totais: Record<string, any> | undefined) {
  const ok: Record<string, boolean> = {};
  Object.keys(totais || {}).forEach((k) => {
    const servidor = num(totais![k]);
    ok[k] = servidor === null ? false : Math.abs(servidor - somaPesada(linhas, k)) < 0.01;
  });
  return ok;
}

/**
 * O rodapé. `linhas` são as que passaram nos filtros; `totaisDoServidor` é o que
 * o relatório mandou; `filtrado` diz se o utilizador está a ver um subconjunto.
 */
export function calcularTotais(
  cols: Coluna[],
  linhas: any[],
  totaisDoServidor: Record<string, any> | undefined,
  filtrado: boolean,
  somaveis: Record<string, boolean>,
): Record<string, number | string> {
  const t: Record<string, number | string> = {};
  const doServidor = totaisDoServidor || {};
  cols.forEach((c) => {
    const k = c[0];
    const temDoServidor = doServidor[k] !== undefined;
    if (!eDinheiro(c) && !temDoServidor) return;
    if (temDoServidor && (!filtrado || !somaveis[k])) {
      t[k] = doServidor[k];           // o número do servidor, tal como veio
      return;
    }
    t[k] = somaPesada(linhas, k);
  });
  // Totais que o servidor manda e que não são colunas da grelha (derivados,
  // como "pendente") não se recalculam — mostram-se como vieram.
  Object.entries(doServidor).forEach(([k, v]) => {
    if (t[k] === undefined) t[k] = v as any;
  });
  return t;
}

/**
 * Um rodapé recalculado sobre um filtro diz-se "filtrado"; um que traz rácios do
 * período inteiro TEM de o dizer, senão quem filtra acredita que a percentagem
 * é da selecção.
 */
export function rodapeEDoPeriodo(
  filtrado: boolean,
  totaisDoServidor: Record<string, any> | undefined,
  somaveis: Record<string, boolean>,
): boolean {
  return filtrado && Object.keys(totaisDoServidor || {}).some((k) => !somaveis[k]);
}
