import { test, expect, type Page } from '@playwright/test';

/**
 * O PONTO DE VENDA — onde se cria, e porque é que o cliente não o encontrava.
 *
 * Um cliente configurou o setor e disse: «em todos os campos o Outlet não
 * aparece». Não era um defeito de dados nem de API: o ecrã onde se CRIA um
 * ponto de venda existia, mas vivia no Centro de Gestão Hoteleira (04) — outro
 * módulo. Quem estava na Configuração POS via o campo "Ponto de venda" em
 * metade das fichas (setores, terminais, impressoras, modos de pagamento, happy
 * hour) e não tinha ali forma nenhuma de criar um, nem uma pista de onde ele se
 * criava. Ficava com as listas vazias, sem saber se faltava configurar alguma
 * coisa ou se o ecrã estava avariado.
 *
 * O comentário na árvore de navegação dizia que os Outlets tinham passado para
 * dentro da Configuração POS "num só sítio". Não tinham.
 */

const BASE = 'http://localhost:5177';

async function entrar(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const u = page.locator('input').first();
  await u.waitFor({ state: 'visible', timeout: 45000 });
  await u.pressSequentially('dono', { delay: 8 });
  await page.locator('input[type="password"]').first().pressSequentially('MwanaLodge#2026', { delay: 8 });
  await page.getByRole('button', { name: /entrar/i }).first().click()
    .catch(() => page.locator('button[type="submit"]').first().click());
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'),
    { timeout: 45000 });
}

async function abrirConfigPos(page: Page, seccao: string) {
  await page.evaluate((s) => {
    localStorage.setItem('posc_section', s);
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'posmgmt', screen: 'posc_config' }));
  }, seccao);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2800);
}

test.describe('O ponto de venda na Configuração POS', () => {
  test('cria-se no mesmo sítio onde se configura o POS', async ({ page }) => {
    await entrar(page);
    await abrirConfigPos(page, 'p_outlets');

    const corpo = await page.locator('body').innerText();
    expect(corpo, 'A Configuração POS não oferece onde criar um ponto de venda — '
      + 'e pede um em metade das fichas dela.').not.toContain('a construir a seguir');
    expect(corpo.toLowerCase(), 'O ecrã dos pontos de venda não abriu.')
      .toMatch(/outlet|ponto de venda/);
  });

  test('o menu da Configuração POS mostra a entrada', async ({ page }) => {
    await entrar(page);
    await abrirConfigPos(page, 'p_sectors');
    // O grupo "Parâmetros do Sistema" tem de estar aberto para a lista aparecer.
    const menu = page.locator('text=PARÂMETROS DO SISTEMA').first();
    if (await menu.count()) { await menu.click().catch(() => undefined); }
    await page.waitForTimeout(800);
    const corpo = await page.locator('body').innerText();
    expect(corpo, 'Quem está a configurar o POS não vê no menu onde criar o ponto '
      + 'de venda de que todas as outras fichas dependem.')
      .toContain('Pontos de Venda');
  });

  test('a ficha do setor oferece o ponto de venda configurado', async ({ page }) => {
    await entrar(page);
    await abrirConfigPos(page, 'p_sectors');
    const linha = page.locator('table tbody tr').first();
    await linha.waitFor({ state: 'visible', timeout: 20000 });
    await linha.dblclick();
    await page.waitForTimeout(2200);

    // A lista do ponto de venda: a que tem o nome do outlet, ou a que explica
    // que ainda não há nenhum. O que não pode é estar muda.
    const listas = await page.locator('select').all();
    const textos: string[] = [];
    for (const l of listas) textos.push((await l.innerText().catch(() => '')) || '');
    const juntos = textos.join(' | ');
    expect(juntos, 'Nenhuma lista da ficha do setor oferece um ponto de venda, nem '
      + `explica que não há nenhum. Listas: ${juntos.slice(0, 300)}`)
      .toMatch(/Restaurante|nenhum ponto de venda criado/);
  });
});
