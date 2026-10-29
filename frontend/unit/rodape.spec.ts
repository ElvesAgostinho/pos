/**
 * O RODAPÉ DOS RELATÓRIOS — a aritmética, executada.
 *
 * Estes testes não abrem browser nem precisam de servidores: correm a função
 * `calcularTotais` de `src/components/posconfig/rodape.ts` com os dados que o
 * servidor manda, e comparam com o número que o contabilista tem de ler.
 *
 * Porque é que existem: o rodapé estava dentro do componente, onde nenhum teste
 * lhe chegava. Os testes do servidor (pos/tests_centro_relatorios.py) provavam
 * que o relatório manda os números certos, e o ecrã recalculava-os a somar as
 * colunas à bruta — ou seja, o número certo chegava ao ecrã e o ecrã estragava-o.
 * Era um defeito que só se via abrindo o ecrã e olhando.
 *
 * Os casos aqui são os DADOS REAIS dos relatórios, copiados do cenário de
 * `CasaCheia` (um dia de casa cheia: ver o topo desse ficheiro). Se mudarem,
 * mudam nos dois lados ao mesmo tempo.
 *
 * Corre com:  npx playwright test --project=calculo
 */
import { test, expect } from '@playwright/test';

import {
  calcularTotais, num, peso, quaisSaoSomaveis, rodapeEDoPeriodo, somaPesada,
  type Coluna,
} from '../src/components/posconfig/rodape';

/** O que a grelha faz: mede o que é somável e calcula o rodapé. */
function rodape(d: { columns: Coluna[]; rows: any[]; totals?: Record<string, any> },
                linhas = d.rows) {
  const somaveis = quaisSaoSomaveis(d.rows, d.totals);
  const filtrado = linhas.length !== d.rows.length;
  return {
    totais: calcularTotais(d.columns, linhas, d.totals, filtrado, somaveis),
    doPeriodo: rodapeEDoPeriodo(filtrado, d.totals, somaveis),
    somaveis,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// A leitura dos números — é a mesma do ecrã, e tem de o ser
// ─────────────────────────────────────────────────────────────────────────────
test('um número com espaços e vírgula decimal lê-se como número', () => {
  expect(num('15 960,50')).toBe(15960.5);
  expect(num('-2000.00')).toBe(-2000);
  // Uma célula VAZIA lê-se como zero — é o que faz uma coluna com buracos somar
  // o que lá está em vez de não somar nada.
  expect(num(null)).toBe(0);
  expect(num('')).toBe(0);
  // E o que tem letras não é número nenhum: é por isso que a coluna "Falhou"
  // (SIM/vazio) não se pode somar, e o total dela tem de vir do servidor.
  expect(num('SIM')).toBe(null);
  expect(num('62,5%')).toBe(null);
});

test('uma linha sem peso vale 1, como sempre valeu', () => {
  expect(peso({})).toBe(1);
  expect(peso({ _peso: 0 })).toBe(0);
  expect(peso({ _peso: -1 })).toBe(-1);
  expect(peso({ _peso: '-1' })).toBe(-1);
});

test('o que não é número não contribui para a soma', () => {
  expect(somaPesada([{ v: '100' }, { v: 'SIM' }, { v: null }], 'v')).toBe(100);
});

// ─────────────────────────────────────────────────────────────────────────────
// Facturação — a factura anulada e a nota de crédito
// ─────────────────────────────────────────────────────────────────────────────
test('o rodapé da facturação não conta a anulada nem soma a nota de crédito', () => {
  // Os cinco documentos do cenário, exactamente como `fat_documentos` os manda.
  const d = {
    columns: [['invoice_no', 'Documento'], ['status', 'Estado'],
              ['net', 'Incidência', 'money'], ['gross', 'Total', 'money']] as Coluna[],
    rows: [
      { invoice_no: 'FT A/1', status: 'Por receber', net: '4000.00', gross: '4560.00', _peso: 1 },
      { invoice_no: 'FR A/1', status: 'Liquidado', net: '10000.00', gross: '11400.00', _peso: 1 },
      { invoice_no: 'NC A/1', status: 'Nota de crédito', net: '2000.00', gross: '2280.00', _peso: -1 },
      { invoice_no: 'FR A/2', status: 'Anulado', net: '5000.00', gross: '5700.00', _peso: 0 },
      { invoice_no: 'FR A/3', status: 'Regularizado por NC', net: '2000.00', gross: '2280.00', _peso: 1 },
    ],
    totals: { net: '14000.00', gross: '15960.00' },
  };
  const { totais } = rodape(d);
  expect(Number(totais.gross)).toBe(15960);
  expect(Number(totais.net)).toBe(14000);
  // A soma à bruta — o que o ecrã mostrava — era esta:
  expect(d.rows.reduce((s, r) => s + Number(r.gross), 0)).toBe(26220);
});

test('ao filtrar, a facturação recalcula e continua a respeitar os pesos', () => {
  const d = {
    columns: [['type', 'Tipo'], ['gross', 'Total', 'money']] as Coluna[],
    rows: [
      { type: 'FR', gross: '11400.00', _peso: 1 },
      { type: 'NC', gross: '2280.00', _peso: -1 },
      { type: 'FR', gross: '5700.00', _peso: 0 },
    ],
    totals: { gross: '9120.00' },
  };
  // O utilizador filtra pelos dois primeiros: 11 400 − 2 280 = 9 120.
  const { totais, doPeriodo } = rodape(d, d.rows.slice(0, 2));
  expect(Number(totais.gross)).toBe(9120);
  expect(doPeriodo).toBe(false);
});

// ─────────────────────────────────────────────────────────────────────────────
// Depósitos, pontos, consumos e reservas — o que tira em vez de somar
// ─────────────────────────────────────────────────────────────────────────────
test('o adiantamento de um cliente é o que entrou menos o que se usou', () => {
  const d = {
    columns: [['kind', 'Movimento'], ['amount', 'Valor', 'money']] as Coluna[],
    rows: [
      { kind: 'Utilização', amount: '20000.00', _peso: -1 },
      { kind: 'Entrada (depósito)', amount: '50000.00', _peso: 1 },
    ],
    totals: { amount: '30000.00' },
  };
  expect(Number(rodape(d).totais.amount)).toBe(30000);
});

test('um pagamento não é um consumo', () => {
  const d = {
    columns: [['kind', 'Tipo'], ['amount', 'Valor', 'money']] as Coluna[],
    rows: [
      { kind: 'Alojamento', amount: 25000, _peso: 1 },
      { kind: 'Pagamento', amount: 20000, _peso: 0 },
      { kind: 'F&B (POS)', amount: 8000, _peso: 1 },
    ],
    totals: { amount: 33000 },
  };
  expect(Number(rodape(d).totais.amount)).toBe(33000);
});

test('uma reserva cancelada aparece na lista e não na receita', () => {
  const d = {
    columns: [['confirmation', 'Reserva'], ['status', 'Estado'],
              ['nights', 'Noites'], ['total', 'Total', 'money']] as Coluna[],
    rows: [
      { confirmation: 'RA', status: 'Check-in', nights: 2, total: 50000, _peso: 1 },
      { confirmation: 'RC', status: 'Cancelada', nights: 2, total: 50000, _peso: 0 },
      { confirmation: 'RD', status: 'No-show', nights: 1, total: 25000, _peso: 0 },
    ],
    totals: { nights: 2, total: 50000 },
  };
  const { totais } = rodape(d);
  expect(Number(totais.total)).toBe(50000);
  expect(Number(totais.nights)).toBe(2);
});

// ─────────────────────────────────────────────────────────────────────────────
// O que NÃO é uma soma — e por isso não se recalcula
// ─────────────────────────────────────────────────────────────────────────────
test('uma percentagem não se soma, e o ADR do período não é a soma de dois ADR', () => {
  const d = {
    columns: [['day', 'Dia'], ['occupied', 'Ocupados'], ['revenue', 'Receita', 'money'],
              ['occupancy', 'Ocupação %'], ['adr', 'ADR', 'money']] as Coluna[],
    rows: [
      { day: '28/10', occupied: 2, revenue: 35000, occupancy: 50.0, adr: 17500 },
      { day: '29/10', occupied: 3, revenue: 95000, occupancy: 75.0, adr: 31666.67 },
    ],
    totals: { occupied: 5, revenue: 130000, occupancy: 62.5, adr: 26000 },
  };
  const { totais, somaveis } = rodape(d);
  expect(somaveis.occupancy).toBe(false);
  expect(somaveis.adr).toBe(false);
  expect(somaveis.revenue).toBe(true);
  expect(Number(totais.occupancy)).toBe(62.5);   // e não 125
  expect(Number(totais.adr)).toBe(26000);        // e não 49 166,67
  expect(Number(totais.revenue)).toBe(130000);
});

test('ao filtrar, um rácio do período fica como está e o rodapé diz que é do período', () => {
  const d = {
    columns: [['day', 'Dia'], ['revenue', 'Receita', 'money'],
              ['occupancy', 'Ocupação %']] as Coluna[],
    rows: [
      { day: '28/10', revenue: 35000, occupancy: 50.0 },
      { day: '29/10', revenue: 95000, occupancy: 75.0 },
    ],
    totals: { revenue: 130000, occupancy: 62.5 },
  };
  const { totais, doPeriodo } = rodape(d, [d.rows[0]]);
  expect(Number(totais.revenue)).toBe(35000);    // a receita recalcula-se
  expect(Number(totais.occupancy)).toBe(62.5);   // a percentagem do período não
  expect(doPeriodo).toBe(true);                  // e o rodapé diz-no
});

test('uma contagem de linhas marcadas não se soma — 0 falhas onde houve 2', () => {
  // A coluna "Falhou" diz SIM/vazio e o total é a CONTAGEM. A soma à bruta dava
  // zero, num relatório de SEGURANÇA.
  const d = {
    columns: [['user', 'Utilizador'], ['failed', 'Falhou']] as Coluna[],
    rows: [
      { user: 'ana', failed: 'SIM' },
      { user: 'ana', failed: '' },
      { user: 'x', failed: 'SIM' },
    ],
    totals: { failed: 2 },
  };
  expect(Number(rodape(d).totais.failed)).toBe(2);
});

test('um total derivado que não é coluna nenhuma mostra-se como veio', () => {
  const d = {
    columns: [['confirmation', 'Reserva'], ['amount', 'Valor', 'money']] as Coluna[],
    rows: [
      { confirmation: 'RC', amount: 10000 },
      { confirmation: 'RB', amount: 30000 },
    ],
    totals: { amount: 40000, pendente: 10000 },
  };
  const { totais } = rodape(d);
  expect(Number(totais.amount)).toBe(40000);
  expect(Number(totais.pendente)).toBe(10000);
});

// ─────────────────────────────────────────────────────────────────────────────
// O caso de sempre — um relatório sem nada de especial
// ─────────────────────────────────────────────────────────────────────────────
test('um relatório normal soma como sempre somou', () => {
  const d = {
    columns: [['date', 'Data'], ['tickets', 'Contas'], ['total', 'Total', 'money']] as Coluna[],
    rows: [
      { date: '2026-10-28', tickets: 1, total: '4000' },
      { date: '2026-10-29', tickets: 3, total: '16000' },
    ],
    totals: { total: '20000', tickets: 4 },
  };
  const { totais, doPeriodo } = rodape(d);
  expect(Number(totais.total)).toBe(20000);
  expect(Number(totais.tickets)).toBe(4);
  expect(doPeriodo).toBe(false);
  // E filtrado a um dia, recalcula.
  expect(Number(rodape(d, [d.rows[1]]).totais.total)).toBe(16000);
});

test('uma coluna de dinheiro sem total do servidor soma-se, como antes', () => {
  const d = {
    columns: [['item', 'Artigo'], ['value', 'Valor', 'money']] as Coluna[],
    rows: [{ item: 'Bife', value: '12000' }, { item: 'Cerveja', value: '8000' }],
    totals: {},
  };
  expect(Number(rodape(d).totais.value)).toBe(20000);
});
