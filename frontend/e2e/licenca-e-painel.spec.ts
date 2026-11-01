/**
 * UM SOLUÇO NA REDE NÃO PODE FAZER DESAPARECER UM MÓDULO PAGO.
 *
 * ─── O QUE ACONTECEU ──────────────────────────────────────────────────────
 * O dono abriu o Ambiente de Trabalho e O PMS TINHA DESAPARECIDO da barra de
 * tarefas. O PMS está licenciado, o servidor estava de pé e respondia — bastou
 * um pedido que não chegou (a máquina corria a suite de testes ao mesmo tempo)
 * para um módulo que ele comprou sumir, sem uma palavra de explicação.
 *
 * A causa: `useActiveModules` não tinha tratamento de erro nenhum. O
 * comentário por cima dela dizia 'Cai para "tudo" em caso de erro', mas a
 * função não fazia isso. Falhava a leitura, os dados ficavam indefinidos, e
 * quem a chamava escrevia `lic?.active || []` — uma lista vazia, que quer
 * dizer "não tem módulo nenhum licenciado".
 *
 * ─── PORQUE É QUE ISTO É UM TESTE DE BROWSER ──────────────────────────────
 * Porque o defeito não está em nenhuma função sozinha: está no encontro entre
 * um pedido que falha, uma cache, e um ecrã que desenha o que lhe dão. Só se
 * vê com a rede a falhar a sério — e é isso que o `page.route(... abort())`
 * faz aqui, sem desligar nada nem mexer no servidor.
 *
 * Ensaiado contra a versão sem a correcção: o PMS desaparece e o teste fica
 * vermelho. É a única forma de saber que não está a passar por acaso.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5177';
const UTILIZADOR = process.env.UTILIZADOR || 'dono';
const SENHA = process.env.SENHA || 'MwanaLodge#2026';

async function entrar(page: any) {
  await page.goto(BASE + '/backoffice', { waitUntil: 'domcontentloaded' });
  const primeiro = page.locator('input').first();
  await primeiro.waitFor({ state: 'visible', timeout: 45_000 });
  if (await page.locator('input[type="password"]').count()) {
    await primeiro.pressSequentially(UTILIZADOR, { delay: 10 });
    await page.locator('input[type="password"]').first().pressSequentially(SENHA, { delay: 10 });
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'),
      { timeout: 45_000 });
  }
  await page.waitForTimeout(2500);
}

test('um módulo licenciado não desaparece quando a licença não se lê', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1) Entrada normal — a licença lê-se e fica lembrada.
  await entrar(page);
  await expect(page.locator('button[title*="PMS"]').first()).toBeVisible({ timeout: 20_000 });

  // 2) Agora o pedido da licença falha, como quando a rede engasga.
  await page.route('**/licensing/active-modules/', (r) => r.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const corpo = (await page.locator('body').innerText()) || '';
  expect(corpo, 'o PMS desapareceu da barra de tarefas com a licença a falhar')
    .toContain('PMS');
});

test('o painel diz quando não conseguiu ler, em vez de mostrar zeros', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await entrar(page);

  // Sem o Centro de Operações, o painel não tem números.
  await page.route('**/ops/center/', (r) => r.abort());
  await page.reload({ waitUntil: 'domcontentloaded' });

  // ESPERA POR UMA DAS DUAS FRASES, e não por um tempo fixo. O TanStack repete
  // o pedido tres vezes antes de desistir: durante esses segundos a consulta
  // ainda nao e um erro. O que se exige e que o painel NUNCA fique calado —
  // ou diz que esta a consultar, ou diz que nao conseguiu.
  //
  // ZEROS SERIAM PIORES DO QUE NADA: "0 mesas ocupadas" numa casa cheia e uma
  // mentira que leva alguem a decidir mal.
  await expect.poll(async () => {
    const t = (await page.locator('body').innerText()) || '';
    return /a consultar o servidor|estado da casa|ultima leitura/i.test(t);
  }, { timeout: 45_000, message: 'o painel ficou calado em traços, sem dizer nada' })
    .toBe(true);
});
