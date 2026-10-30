/**
 * FOTOGRAFAR UM ECRÃ — para ver o que o dono vê, e não o que eu imagino.
 *
 * Não é um teste: é uma ferramenta. Abre o sistema na largura indicada, faz
 * login, vai ao ecrã pedido e guarda a imagem. Serve para duas coisas:
 *
 *  · REPRODUZIR um defeito que chegou por captura de ecrã, antes de lhe mexer
 *    (um defeito que não se reproduz não se corrigiu — adivinhou-se);
 *  · COMPARAR o antes e o depois de uma mudança visual.
 *
 * Corre com o sistema de pé (backend em 8017, vite em 5177):
 *   npx playwright test e2e/ver-ecra.spec.ts --project=ecras
 *
 * A largura vem de LARGURA_ECRA e o destino de ECRA_ALVO, para se poder apontar
 * a outro sítio sem mexer no ficheiro.
 */
import { test, expect } from '@playwright/test';

const LARGURA = Number(process.env.LARGURA_ECRA || 1030);
const ALTURA = Number(process.env.ALTURA_ECRA || 800);
const UTILIZADOR = process.env.UTILIZADOR || 'dono';
const SENHA = process.env.SENHA || 'MwanaLodge#2026';

test('fotografar a Configuração POS', async ({ page }) => {
  await page.setViewportSize({ width: LARGURA, height: ALTURA });

  // DIZER O QUE O BROWSER VÊ. Sem isto, uma falha de rede aparece como um
  // ecrã de erro e fica-se a adivinhar a causa — que foi o que aconteceu aqui.
  page.on('requestfailed', (r) => {
    // eslint-disable-next-line no-console
    console.log('FALHOU: ' + r.url() + '  ->  ' + (r.failure()?.errorText || '?'));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLA: ' + m.text().slice(0, 200));
  });

  await page.goto('/backoffice');
  // O login só aparece se não houver sessão — por isso não se exige.
  // O MESMO CAMINHO DA VARREDURA (e2e/varredura.spec.ts): o PRIMEIRO input da
  // página. Tentar `getByPlaceholder(/utilizador/i)` apanhava o campo certo mas
  // o formulário não submetia — e o caminho que já está provado é este.
  //
  // `pressSequentially` e não `fill`: escrever letra a letra é o que apanha um
  // campo que perde o foco ao primeiro caractere; `fill` escreve tudo de uma
  // vez por baixo do teclado e não apanha.
  const primeiro = page.locator('input').first();
  await primeiro.waitFor({ state: 'visible', timeout: 45_000 });
  if (await page.locator('input[type="password"]').count()) {
    await primeiro.pressSequentially(UTILIZADOR, { delay: 10 });
    await page.locator('input[type="password"]').first().pressSequentially(SENHA, { delay: 10 });
    await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
    // Espera por SINAL — o login saiu do ecrã —, nunca por um tempo fixo.
    await page.waitForFunction(() => !document.querySelector('input[type="password"]'),
      { timeout: 45_000 });
  }

  // Espera por CONTEÚDO, e não pelo `body`: um body vazio tem altura zero e
  // conta como "escondido", o que faz esta espera passar cedo de mais.
  await expect.poll(
    async () => (await page.evaluate(() => document.body.innerText.length)),
    { timeout: 60_000 },
  ).toBeGreaterThan(40);

  // CHEGAR AO ECRÃ. O Ambiente de Trabalho é um lançador: abre-se o ícone do
  // módulo e de lá vai-se ao ecrã pedido. É o caminho que o dono faz.
  const atalho = page.locator('text=POS').first();
  if (await atalho.isVisible().catch(() => false)) {
    await atalho.dblclick();
    await page.waitForTimeout(3500);
  }
  // Abre a Configuração POS pelo menu, que é onde ela vive.
  for (const alvo of ['Utilitários', 'Configuração POS', 'Artigos']) {
    const it = page.locator(`text=${alvo}`).first();
    if (await it.isVisible().catch(() => false)) {
      await it.click().catch(() => {});
      await page.waitForTimeout(1800);
    }
  }

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/ecra.png', fullPage: false });
  // eslint-disable-next-line no-console
  console.log('IMAGEM: frontend/test-results/ecra.png');
});
