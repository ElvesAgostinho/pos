/**
 * CADA MÓDULO MOSTRA O QUE É SEU — E MAIS NADA.
 *
 * ─── PORQUE É QUE ISTO É UM TESTE, E NÃO UMA REGRA DE ESTILO ──────────────
 * O sistema VENDE-SE POR MÓDULO. Um cliente que comprou só o POS não pode ver
 * sinal nenhum do PMS: nem um separador, nem um atalho, nem um nome numa
 * lista. Ver aquilo que não se comprou é, na melhor das hipóteses, uma
 * promessa que ninguém fez; na pior, abre um ecrã vazio e parece um defeito.
 *
 * O dono apanhou uma fuga destas no menu Iniciar: a barra de tarefas já
 * escondia o PMS (não estava licenciado), mas a lista "Usado recentemente"
 * mostrava-o à mesma — o nome tinha ficado no browser de uma sessão anterior
 * e ninguém o filtrava pela licença.
 *
 * ─── PORQUE É QUE O TESTE PROCURA NO ECRÃ INTEIRO ─────────────────────────
 * Porque a fuga não estava onde se esperava. Verificar "a barra de tarefas não
 * tem PMS" teria passado: a barra estava certa. O que falhava era outra lista,
 * três cliques ao lado. Um teste que só olha para os sítios de que o
 * programador se lembrou não apanha o sítio de que ele se esqueceu — e foi
 * exactamente esse que falhou.
 *
 * Por isso aqui lê-se o TEXTO TODO do ambiente de trabalho, com o menu Iniciar
 * aberto, e exige-se que a palavra não lá esteja.
 */
import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5177';
const UTILIZADOR = process.env.UTILIZADOR || 'dono';
const SENHA = process.env.SENHA || 'MwanaLodge#2026';

/** A licença passa a dizer que só o POS foi comprado. */
async function licencaSoComPos(page: any) {
  await page.route('**/licensing/active-modules/', async (rota: any) => {
    await rota.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        active: ['pos', 'inventory', 'fiscal', 'finance'],   // sem 'pms'
        core: [], catalog: [],
      }),
    });
  });
}

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

test('quem comprou só o POS não vê o PMS em lado nenhum', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 1440, height: 900 });

  // 1) Entra com a licença completa e ABRE o PMS — para ele ficar nos
  //    "recentes" do browser. É assim que a fuga nasce na vida real: o nome
  //    sobra de uma sessão anterior, de uma demonstração, de um teste.
  await entrar(page);
  await page.evaluate(() => {
    localStorage.setItem('recent_screens', JSON.stringify([
      { screen: 'pms_home', label: 'PMS', modulo: 'pms' },
      { screen: 'posc_config', label: 'Configuração POS', modulo: 'pos' },
    ]));
  });

  // 2) Agora a licença só tem POS — como no computador de um cliente que
  //    comprou um módulo só.
  await licencaSoComPos(page);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  // 3) Abre o menu Iniciar, que é onde a fuga estava.
  const iniciar = page.locator('button[aria-label="Iniciar"]');
  await iniciar.click();
  await page.waitForTimeout(1200);

  const texto = (await page.locator('body').innerText()) || '';
  expect(texto, 'o POS tem de estar lá — senão o teste não prova nada')
    .toContain('POS');
  expect(texto, 'FUGA DE MÓDULO: o PMS aparece a quem não o comprou')
    .not.toMatch(/\bPMS\b/);
});
