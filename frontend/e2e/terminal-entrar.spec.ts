import { test, expect } from '@playwright/test';

/**
 * ENTRAR NO TERMINAL — o que o cliente não conseguiu fazer.
 *
 * Um cliente acabado de instalar configurou o setor no backoffice e foi ao
 * terminal: a lista de setores dizia «Sem setores configurados», e o PIN não
 * passava. Duas coisas distintas, as duas a deixá-lo de fora do próprio
 * sistema:
 *
 *  · A LISTA DE SETORES era pedida a `pos/outlets/`, que exige autenticação. No
 *    ecrã de ENTRADA ainda não há sessão nenhuma: a resposta era 401, o erro
 *    morria num `catch` vazio, e o ecrã dizia-lhe que a culpa era da
 *    configuração dele — numa casa com os setores todos configurados.
 *
 *  · O PIN não é a senha do dono. O terminal abre-se com o PIN de um OPERADOR,
 *    que alguém tem de criar no backoffice. Quando ainda não existe nenhum, o
 *    servidor respondia "PIN inválido" — uma resposta verdadeira e inútil, que
 *    manda a pessoa tentar outra vez aquilo que nunca vai funcionar.
 *
 * Este teste faz o percurso dele: abre o terminal, escolhe o setor, escreve o
 * PIN, e exige chegar ao outro lado.
 */

const BASE = 'http://localhost:5177';
const PIN = '4071';

test.describe('O terminal POS', () => {
  test('o ecrã de entrada mostra os setores configurados', async ({ page }) => {
    await page.goto(`${BASE}/pos/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2500);

    const corpo = await page.locator('body').innerText();
    expect(corpo, 'O terminal diz "Sem setores configurados" numa casa que TEM setores '
      + 'configurados — é o que o cliente viu, e deixa-o sem saber onde vai servir.')
      .not.toContain('Sem setores configurados');

    const setores = page.locator('select').first();
    const opcoes = await setores.locator('option').allInnerTexts();
    expect(opcoes.filter((o) => o.trim()).length,
      `A lista de setores veio vazia: ${JSON.stringify(opcoes)}`).toBeGreaterThan(0);
  });

  test('o PIN do operador abre o terminal', async ({ page }) => {
    await page.goto(`${BASE}/pos/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    // Escrito tecla a tecla, como no teclado do terminal.
    const campo = page.locator('input[type="password"]').first();
    await campo.waitFor({ state: 'visible', timeout: 20000 });
    await campo.pressSequentially(PIN, { delay: 60 });
    await page.getByRole('button', { name: 'Entrar' }).click();

    await page.waitForURL('**/pos/terminal', { timeout: 25000 });
    const corpo = await page.locator('body').innerText();
    expect(corpo.trim().length, 'O terminal abriu em branco depois do login.')
      .toBeGreaterThan(40);
  });

  test('um setor sem ponto de venda não se oferece como se servisse', async ({ page }) => {
    // O BECO QUE O CLIENTE APANHOU. Ele gravou um setor sem ponto de venda — não
    // por descuido: a lista aparecia-lhe vazia, porque o ecrã para criar pontos
    // de venda vivia noutro centro. O terminal mostrava esse setor como qualquer
    // outro: escolhia-se, ABRIA-SE UMA SESSÃO DE CAIXA (dinheiro registado num
    // setor que não pertence a lado nenhum) e o ecrã seguinte dizia "este setor
    // não tem mesas" — a culpar as mesas por um problema de outro sítio.
    await page.goto(`${BASE}/pos/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const campo = page.locator('input[type="password"]').first();
    await campo.waitFor({ state: 'visible', timeout: 20000 });
    await campo.pressSequentially(PIN, { delay: 50 });
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForURL('**/pos/terminal', { timeout: 25000 });
    await page.waitForTimeout(3000);

    // Volta ao passo do setor (o terminal salta-o quando só há um utilizável).
    const voltar = page.getByRole('button', { name: /Setor/ }).first();
    if (await voltar.count()) { await voltar.click(); await page.waitForTimeout(1500); }

    const semPdv = page.getByRole('button', { name: /Esplanada/ }).first();
    if (!(await semPdv.count())) {
      test.skip(true, 'não há setor sem ponto de venda nesta base de ensaio');
    }
    await expect(semPdv, 'O terminal oferece um setor sem ponto de venda como se ele '
      + 'servisse — e abre caixa nele.').toBeDisabled();
    const corpo = await page.locator('body').innerText();
    expect(corpo, 'O setor está desactivado mas não diz porquê nem onde se resolve.')
      .toContain('Sem ponto de venda');
  });

  test('um PIN errado não entra e explica-se', async ({ page }) => {
    await page.goto(`${BASE}/pos/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const campo = page.locator('input[type="password"]').first();
    await campo.waitFor({ state: 'visible', timeout: 20000 });
    await campo.pressSequentially('0000', { delay: 40 });
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForTimeout(2500);

    expect(page.url(), 'Um PIN errado entrou no terminal.').toContain('/pos/login');
    const corpo = await page.locator('body').innerText();
    expect(corpo.toLowerCase(), 'Recusou o PIN sem dizer nada a quem está ao balcão.')
      .toMatch(/pin|inválido|invalido|operador/);
  });
});
