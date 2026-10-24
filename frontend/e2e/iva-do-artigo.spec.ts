import { test, expect, type Page } from '@playwright/test';

/**
 * PÔR IVA NUM ARTIGO — o que o cliente fez e não conseguiu.
 *
 * Um cliente acabado de instalar tentou criar um artigo, escolheu o IVA na
 * lista, gravou, e o sistema respondeu: «tax percentage tem de ser um número».
 * Não havia forma de contornar: nenhum artigo da casa podia ter IVA, e sem IVA
 * não há venda que se fature.
 *
 * A causa estava à vista no próprio ecrã, e ninguém a leu: a lista do IVA
 * mostrava «IVA 7% — NaN%». O selector lia a taxa de um campo chamado `rate`,
 * que a API não devolve (chama-se `percentage`). Com o valor da opção a sair
 * `undefined`, o browser faz uma coisa que quase ninguém sabe: usa o TEXTO da
 * opção como valor. Era o texto — "IVA 7% — NaN%" — que ia para o servidor no
 * campo da percentagem.
 *
 * Este teste faz o que ele fez, num browser a sério: abre a ficha do artigo,
 * escolhe um IVA da lista, e exige duas coisas — que a lista mostre uma
 * percentagem que se leia, e que o valor que vai no formulário seja um NÚMERO.
 */

const BASE = 'http://localhost:5177';

async function entrar(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const u = page.locator('input').first();
  await u.waitFor({ state: 'visible', timeout: 45000 });
  await u.pressSequentially('dono', { delay: 8 });
  await page.locator('input[type="password"]').first().pressSequentially('MwanaLodge#2026', { delay: 8 });
  await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'),
    { timeout: 45000 });
}

/** Abre a ficha do primeiro artigo, pelo caminho da própria aplicação. */
async function abrirFichaDeArtigo(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem('posc_section', 'articles');
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'posmgmt', screen: 'posc_config' }));
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  // A grelha de artigos: abre-se o primeiro com duplo clique, como no ecrã.
  const linha = page.locator('table tbody tr').first();
  await linha.waitFor({ state: 'visible', timeout: 20000 });
  await linha.dblclick();
  await page.waitForTimeout(2000);
}

test.describe('O IVA na ficha do artigo', () => {
  test('a lista de IVA mostra a percentagem, e não "NaN"', async ({ page }) => {
    await entrar(page);
    await abrirFichaDeArtigo(page);

    const iva = page.locator('select').filter({ hasText: '%' }).first();
    await iva.waitFor({ state: 'visible', timeout: 20000 });
    const opcoes = await iva.locator('option').allInnerTexts();
    const texto = opcoes.join(' | ');

    expect(texto, `A lista do IVA mostra "NaN": ${texto}. É o sintoma visível de o `
      + 'ecrã estar a ler a taxa de um campo que a API não devolve.')
      .not.toContain('NaN');
    expect(opcoes.length, 'A lista do IVA só tem "(nenhum)" — nenhuma taxa configurada '
      + 'chegou ao ecrã.').toBeGreaterThan(1);
  });

  test('escolher um IVA põe um NÚMERO no formulário', async ({ page }) => {
    await entrar(page);
    await abrirFichaDeArtigo(page);

    const iva = page.locator('select').filter({ hasText: '%' }).first();
    await iva.waitFor({ state: 'visible', timeout: 20000 });

    // Escolhe a segunda opção (a primeira é "(nenhum)").
    const valores = await iva.locator('option').evaluateAll(
      (os) => os.map((o) => (o as HTMLOptionElement).value));
    const escolhido = valores.find((v) => v !== '');
    expect(escolhido, 'Nenhuma opção de IVA tem valor.').toBeTruthy();
    await iva.selectOption(escolhido as string);

    const valor = await iva.inputValue();
    expect(Number.isNaN(Number(valor)), `O formulário ficou com "${valor}" no campo da `
      + 'percentagem do IVA — não é um número, e é isto que o servidor recusa com '
      + '"tax percentage tem de ser um número". O artigo não se consegue gravar.')
      .toBe(false);
    expect(Number(valor), 'A percentagem do IVA ficou negativa.').toBeGreaterThanOrEqual(0);
  });
});
