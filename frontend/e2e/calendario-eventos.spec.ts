/**
 * O CALENDÁRIO DO EMS TEM DE LEVAR A ALGUM LADO.
 *
 * Era uma lista morta: mostrava os eventos por mês e carregar num não fazia
 * nada. Quem queria ver o evento tinha de ir ao EMS e procurá-lo outra vez pelo
 * nome — num calendário, que existe justamente para se chegar àquele dia e
 * àquele evento.
 *
 * Era o último ecrã inerte do PMS. Este teste carrega na linha e exige que o
 * pedido de evento abra.
 *
 * ─── PORQUE É QUE ISTO PRECISA DE TESTE ───────────────────────────────────
 * Um ecrã que não faz nada não rebenta: abre, desenha, e fica à espera. A
 * varredura dá-o por são (não há erro na consola nem ecrã em branco) e os testes
 * do servidor também (a API responde). O defeito só se vê a alguém a usá-lo — e
 * foi assim que ele sobreviveu: ninguém lhe carregou.
 */
import { test, expect } from '@playwright/test';

const UTILIZADOR = process.env.UTILIZADOR || 'dono';
const SENHA = process.env.SENHA || 'MwanaLodge#2026';

test('carregar num evento do calendário abre o pedido de evento', async ({ page }) => {
  await page.goto('/backoffice');

  const primeiro = page.locator('input').first();
  await primeiro.waitFor({ state: 'visible', timeout: 45_000 });
  if (await page.locator('input[type="password"]').count()) {
    await primeiro.pressSequentially(UTILIZADOR, { delay: 10 });
    await page.locator('input[type="password"]').first().pressSequentially(SENHA, { delay: 10 });
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 45_000 });
  }

  await page.evaluate(() => {
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'pms', screen: 'pms_home' }));
  });
  await page.reload();
  await expect.poll(
    async () => (await page.evaluate(() => document.body.innerText.length)),
    { timeout: 60_000 },
  ).toBeGreaterThan(40);

  await page.locator('button', { hasText: /^EMS$/ }).first().click();
  await page.locator('button', { hasText: /^Calendário EMS$/ }).first().click();

  // Uma linha do calendário. Sem eventos lançados não há o que exercitar, e
  // nesse caso não se finge que passou — diz-se.
  const linha = page.locator('[title^="Abrir o pedido de evento"]').first();
  await linha.waitFor({ state: 'visible', timeout: 30_000 });
  await linha.click();

  // O PEDIDO ABRE. A ficha do pedido escreve "Pedido <número> — <designação>"
  // no topo; é isso que se exige, e não um aspecto.
  await expect(page.getByText(/^Pedido\s/).first()).toBeVisible({ timeout: 20_000 });
});
