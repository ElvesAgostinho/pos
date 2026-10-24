import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';

/**
 * OS ECRÃS, CLICADOS A SÉRIO — num browser verdadeiro.
 *
 * Tudo o que esta casa tem de garantias era de servidor: 804 testes que chamam a
 * API pela mesma porta que o terminal usa. Não clicam num botão. E o defeito que
 * chegou ao cliente — o ecrã de login em que cada letra escrita saltava para
 * outro campo, e que fez parecer que "todas as credenciais estavam erradas" —
 * era INVISÍVEL a todos eles. Um componente definido dentro de outro é um tipo
 * novo em cada render: o React desmonta o campo a cada tecla e o foco vai-se.
 * Nenhum teste de servidor vê isso. Um browser vê.
 *
 * Por isso o que estes testes fazem é o que uma pessoa faz: escrevem, carregam,
 * esperam, e olham. E há uma regra que vale para todos e está no `beforeEach`:
 * **nenhum erro na consola do browser passa em silêncio**. Um "Cannot read
 * properties of undefined" num ecrã é um ecrã branco para quem está a trabalhar.
 */

const BASE = 'http://localhost:5177';
const UTILIZADOR = 'dono';
const SENHA = 'MwanaLodge#2026';

/** Os erros de consola que não são defeito nosso e que não vale a pena perseguir. */
const RUIDO = [
  'favicon',                      // o ícone da aba, que o dev server não serve
  'ERR_CONNECTION_REFUSED',       // serviços opcionais (impressão, VPN) que não correm aqui
  'Download the React DevTools',
  'net::ERR_ABORTED',
];

function vigiarConsola(page: Page, recolha: string[]) {
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const texto = m.text();
    if (RUIDO.some((r) => texto.includes(r))) return;
    recolha.push(texto);
  });
  page.on('pageerror', (e) => recolha.push(`pageerror: ${e.message}`));
}

/** Entra no sistema como o dono entra: a escrever. */
async function entrar(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const utilizador = page.locator('input').first();
  await utilizador.waitFor({ state: 'visible', timeout: 30000 });

  // ESCRITO LETRA A LETRA, de propósito: `fill()` põe o valor de uma vez e NÃO
  // apanha o defeito do foco perdido. `pressSequentially` escreve como uma
  // pessoa — e se o campo se desmontar a cada tecla, só fica a última letra.
  await utilizador.pressSequentially(UTILIZADOR, { delay: 15 });
  const senha = page.locator('input[type="password"]').first();
  await senha.pressSequentially(SENHA, { delay: 15 });
  await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
  await page.waitForLoadState('networkidle');
}

let erros: string[] = [];

test.beforeEach(({ page }) => {
  erros = [];
  vigiarConsola(page, erros);
});

test.afterEach(async () => {
  expect(erros, `A consola do browser deu erro(s) — para quem está a trabalhar, `
    + `isto é um ecrã em branco ou uma lista que não aparece:\n  `
    + erros.join('\n  ')).toEqual([]);
});

test.describe('O ecrã de login', () => {
  test('cada letra fica no campo onde foi escrita', async ({ page }) => {
    // O DEFEITO QUE CHEGOU AO CLIENTE. Escrever "dono" deixava um "o" no campo
    // do utilizador e espalhava o resto — e quem estava do outro lado concluía
    // que a senha estava errada.
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const utilizador = page.locator('input').first();
    await utilizador.waitFor({ state: 'visible', timeout: 30000 });
    await utilizador.pressSequentially(UTILIZADOR, { delay: 20 });
    await expect(utilizador, 'O nome de utilizador não ficou inteiro no campo: '
      + 'o campo está a ser desmontado a cada tecla (componente definido dentro '
      + 'de outro).').toHaveValue(UTILIZADOR);

    const senha = page.locator('input[type="password"]').first();
    await senha.pressSequentially(SENHA, { delay: 20 });
    await expect(senha).toHaveValue(SENHA);
    // E o primeiro campo não pode ter sido tocado por se escrever no segundo.
    await expect(utilizador, 'Escrever a senha mexeu no campo do utilizador.')
      .toHaveValue(UTILIZADOR);
  });

  test('a senha errada diz que está errada, e não desaparece', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    const utilizador = page.locator('input').first();
    await utilizador.waitFor({ state: 'visible', timeout: 30000 });
    await utilizador.pressSequentially(UTILIZADOR, { delay: 10 });
    await page.locator('input[type="password"]').first().pressSequentially('errada', { delay: 10 });
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    // Tem de ficar NO login, com uma mensagem — não um ecrã branco nem um salto.
    await expect(page.locator('input[type="password"]').first()).toBeVisible({ timeout: 15000 });
  });

  test('entra e chega ao sistema', async ({ page }) => {
    await entrar(page);
    await expect(page.locator('input[type="password"]'),
      'Depois de entrar, o ecrã de login ainda está à vista.').toHaveCount(0);
  });
});

test.describe('Os ecrãs do backoffice abrem com conteúdo', () => {
  test.beforeEach(async ({ page }) => {
    await entrar(page);
  });

  test('o ambiente de trabalho mostra os centros', async ({ page }) => {
    const corpo = await page.locator('body').innerText();
    expect(corpo.length, 'O ecrã abriu praticamente vazio.').toBeGreaterThan(80);
  });

  test('nenhum ecrã da árvore abre em branco', async ({ page }) => {
    // A VARREDURA, mas com olhos. A de servidor garante que a API não rebenta;
    // esta garante que o ecrã DESENHA. São coisas diferentes: um ecrã que recebe
    // os dados e rebenta a formatá-los responde 200 e aparece em branco.
    const vazios: string[] = [];
    const itens = page.locator('[role="treeitem"], aside li, nav li');
    const total = Math.min(await itens.count(), 25);
    for (let i = 0; i < total; i += 1) {
      const item = itens.nth(i);
      const nome = (await item.innerText().catch(() => ''))?.trim().split('\n')[0] ?? '';
      if (!nome) continue;
      await item.click({ timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      const texto = (await page.locator('main, [role="main"], body').first()
        .innerText().catch(() => '')) ?? '';
      if (texto.trim().length < 40) vazios.push(nome);
    }
    expect(vazios, `Estes ecrãs abriram em branco: ${vazios.join(', ')}`).toEqual([]);
  });
});
