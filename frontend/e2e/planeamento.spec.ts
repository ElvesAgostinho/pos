/**
 * NO MAPA DE PLANEAMENTO TEM DE SE PODER PLANEAR.
 *
 * O ecrã mostrava quartos em linha e dias em coluna, e uma barra colorida por
 * cada reserva. Clicar numa barra abria a reserva; clicar num dia LIVRE não
 * fazia nada — e é no dia livre que se planeia. O dono olhou para ele e
 * perguntou, com razão: "como trabalho com esta área se não tem nada para
 * editar ou planificar?"
 *
 * Um mapa onde só se consegue abrir o que já existe não é um mapa de
 * planeamento: é um relatório em forma de grelha. Para marcar uma estadia era
 * preciso sair dali, ir às reservas, criar, escolher o quarto outra vez e
 * voltar para confirmar que caiu no sítio certo.
 *
 * Este teste carrega no cruzamento de um quarto com um dia livre e exige que a
 * marcação abra. Não verifica o aspeto — verifica que o ecrã FAZ alguma coisa,
 * que é o que lhe faltava.
 */
import { test, expect } from '@playwright/test';

const UTILIZADOR = process.env.UTILIZADOR || 'dono';
const SENHA = process.env.SENHA || 'MwanaLodge#2026';

test('carregar num dia livre do mapa abre a marcação de reserva', async ({ page }) => {
  const erros: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') erros.push(m.text().slice(0, 160)); });

  await page.goto('/backoffice');

  // O caminho de login já provado nos outros testes: o primeiro input da página,
  // escrito letra a letra (um `fill` não apanha um campo que perde o foco à
  // primeira tecla).
  const primeiro = page.locator('input').first();
  await primeiro.waitFor({ state: 'visible', timeout: 45_000 });
  if (await page.locator('input[type="password"]').count()) {
    await primeiro.pressSequentially(UTILIZADOR, { delay: 10 });
    await page.locator('input[type="password"]').first().pressSequentially(SENHA, { delay: 10 });
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'), { timeout: 45_000 });
  }

  // Entra-se pelo mecanismo da própria aplicação (o que `irParaModulo` escreve),
  // e não por um URL inventado para o teste.
  await page.evaluate(() => {
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'pms', screen: 'pms_home' }));
  });
  await page.reload();
  await expect.poll(
    async () => (await page.evaluate(() => document.body.innerText.length)),
    { timeout: 60_000 },
  ).toBeGreaterThan(40);

  await page.locator('button', { hasText: /^Front Desk$/ }).first().click();
  await page.locator('button', { hasText: /^Planning$/ }).first().click();

  // Espera pelo mapa — a linha de um quarto. Sem quartos criados não há nada
  // para planear e o teste não tem o que exercitar: nesse caso não se finge que
  // passou, diz-se.
  const mapa = page.locator('table');
  await mapa.first().waitFor({ state: 'visible', timeout: 30_000 });
  const linhas = page.locator('tbody tr');
  expect(await linhas.count(), 'o mapa não tem quartos — crie quartos antes de correr este teste')
    .toBeGreaterThan(0);

  // UMA CÉLULA LIVRE: as ocupadas têm `title` a começar por "Marcar reserva" só
  // nas livres — é assim que se distinguem sem depender de cores.
  const livre = page.locator('td[title^="Marcar reserva"]').first();
  await livre.waitFor({ state: 'visible', timeout: 15_000 });
  await livre.click();

  // A MARCAÇÃO ABRE. É só isto que se exige: que o clique leve a algum lado.
  await expect(page.getByText('Nova Reserva', { exact: false }).first())
    .toBeVisible({ timeout: 15_000 });

  expect(erros, `erros na consola ao abrir a marcação:\n  ${erros.join('\n  ')}`).toEqual([]);
});
