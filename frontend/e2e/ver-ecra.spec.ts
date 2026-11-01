/**
 * FOTOGRAFAR OS ECRÃS — para ver o que o dono vê, e não o que eu imagino.
 *
 * Não é um teste: é uma ferramenta. Abre o sistema, faz login e guarda uma
 * imagem de cada ecrã principal. Serve para duas coisas:
 *
 *  · REPRODUZIR um defeito que chegou por captura de ecrã, antes de lhe mexer
 *    (um defeito que não se reproduz não se corrigiu — adivinhou-se);
 *  · COMPARAR o antes e o depois de uma mudança visual.
 *
 * Corre com o sistema de pé (backend em 8017, vite em 5177):
 *   npx playwright test e2e/ver-ecra.spec.ts --project=ecras
 *
 * As imagens ficam em frontend/test-results/.
 */
import { test, expect } from '@playwright/test';

const LARGURA = Number(process.env.LARGURA_ECRA || 1440);
const ALTURA = Number(process.env.ALTURA_ECRA || 900);
const UTILIZADOR = process.env.UTILIZADOR || 'dono';
const SENHA = process.env.SENHA || 'MwanaLodge#2026';

test('fotografar os ecrãs principais', async ({ page }) => {
  await page.setViewportSize({ width: LARGURA, height: ALTURA });

  // DIZER O QUE O BROWSER VÊ. Sem isto, uma falha de rede aparece como um ecrã
  // de erro e fica-se a adivinhar a causa — que foi o que aconteceu da outra
  // vez: andei a culpar o CORS enquanto o browser dizia, em claro,
  // ERR_CONNECTION_REFUSED num porto errado.
  page.on('requestfailed', (r) => {
    // eslint-disable-next-line no-console
    console.log('FALHOU: ' + r.url() + '  ->  ' + (r.failure()?.errorText || '?'));
  });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log('CONSOLA: ' + m.text().slice(0, 200));
  });

  await page.goto('/backoffice');

  // O login só aparece se não houver sessão — por isso não se exige.
  // O PRIMEIRO input da página, como em e2e/varredura.spec.ts: é o caminho que
  // já está provado. `pressSequentially` e não `fill`, porque escrever letra a
  // letra apanha um campo que perde o foco ao primeiro caractere.
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

  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'test-results/1-ambiente.png' });
  // eslint-disable-next-line no-console
  console.log('IMAGEM 1 (Ambiente de Trabalho): frontend/test-results/1-ambiente.png');

  // ── OS ECRÃS DE MÓDULO ──────────────────────────────────────────────────
  // Entra-se por onde a aplicação entra: deixando o pedido em `ui_nav` e
  // recarregando (config/navegar.ts). É o mesmo caminho do duplo clique num
  // ícone do Ambiente de Trabalho, sem depender de acertar no ícone.
  const ecras: [string, string, string][] = [
    ['pos', 'posc_config', '2-pos'],
    ['pms', 'pms_home', '3-pms'],
  ];
  for (const [modulo, ecra, nome] of ecras) {
    await page.evaluate(([m, e]) => {
      localStorage.setItem('ui_nav', JSON.stringify({ module: m, screen: e }));
    }, [modulo, ecra]);
    await page.reload();
    await expect.poll(
      async () => (await page.evaluate(() => document.body.innerText.length)),
      { timeout: 60_000 },
    ).toBeGreaterThan(40);
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `test-results/${nome}.png` });
    // eslint-disable-next-line no-console
    console.log(`IMAGEM (${modulo}): frontend/test-results/${nome}.png`);
  }

  // ── UM ECRÃ COM FORMULÁRIO ──────────────────────────────────────────────
  // A lista acima mostra a moldura; um formulário mostra o que a moldura faz
  // AOS CAMPOS. Foi num formulário que a mudança de densidade anterior partiu o
  // ecrã (duas etiquetas uma por cima da outra), e uma fotografia da lista não
  // o teria apanhado — por isso esta vai aqui, e não só quando houver queixa.
  await page.evaluate(() => {
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'pos', screen: 'posc_config' }));
  });
  await page.reload();
  await expect.poll(
    async () => (await page.evaluate(() => document.body.innerText.length)),
    { timeout: 60_000 },
  ).toBeGreaterThan(40);
  for (const alvo of ['Parâmetros do Sistema', 'Pontos de Venda']) {
    const it = page.locator(`text=${alvo}`).first();
    if (await it.isVisible().catch(() => false)) {
      await it.click().catch(() => {});
      await page.waitForTimeout(1200);
    }
  }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'test-results/4-formulario.png' });
  // eslint-disable-next-line no-console
  console.log('IMAGEM (formulário): frontend/test-results/4-formulario.png');

  // ── A LISTA DE RESERVAS ─────────────────────────────────────────────────
  // É o ecrã mais usado do PMS e o que mudou de forma: era um bloco de cinco
  // linhas por reserva, passou a uma linha de grelha. Fica fotografado para se
  // ver o antes/depois sem ter de abrir o sistema à mão.
  await page.evaluate(() => {
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'pms', screen: 'pms_home' }));
  });
  await page.reload();
  await expect.poll(
    async () => (await page.evaluate(() => document.body.innerText.length)),
    { timeout: 60_000 },
  ).toBeGreaterThan(40);
  // Varios ecras do PMS, pelo caminho que o utilizador faz: separador do ribbon,
  // depois o comando. Cada um fica fotografado para se comparar com a imagem.
  const destinos: [string, string, string][] = [
    ['EMS', 'Calendário EMS', '5c-calendario-ems'],
    ['Front Desk', 'Planning', '5b-planning'],
    ['Reserva', 'Disponibilidade', '5a-disponibilidade'],
    ['Reserva', 'Reservas', '5-reservas'],
    ['Reserva', 'Reservas de Grupo', '6-grupos'],
    ['Front Desk', 'Estado do Hotel', '7-frontdesk'],
    ['Contas', 'Faturação', '8-contas'],
  ];
  for (const [aba, comando, nome] of destinos) {
    const sep = page.locator('button', { hasText: new RegExp('^' + aba + '$') }).first();
    if (await sep.isVisible().catch(() => false)) {
      await sep.click().catch(() => {});
      await page.waitForTimeout(600);
    }
    const bt = page.locator('button', { hasText: new RegExp('^' + comando + '$') }).first();
    if (await bt.isVisible().catch(() => false)) {
      await bt.click().catch(() => {});
      await page.waitForTimeout(2800);
    }
    await page.screenshot({ path: `test-results/${nome}.png` });
    // eslint-disable-next-line no-console
    console.log(`IMAGEM (${comando}): frontend/test-results/${nome}.png`);
  }

  // ── UM EDITOR COM SEPARADORES ───────────────────────────────────────────
  // Os separadores de ficha e a sombra dos diálogos foram as duas peças
  // mudadas que nenhuma das fotografias acima mostra: uma lista não abre
  // nenhuma das duas. Sem isto, ficavam por ver até alguém reclamar.
  await page.evaluate(() => {
    localStorage.setItem('ui_nav', JSON.stringify({ module: 'pos', screen: 'posc_config' }));
  });
  await page.reload();
  await expect.poll(
    async () => (await page.evaluate(() => document.body.innerText.length)),
    { timeout: 60_000 },
  ).toBeGreaterThan(40);
  await page.waitForTimeout(1500);
  for (const alvo of ['Adicionar', 'Novo']) {
    const bt = page.locator('button', { hasText: new RegExp('^' + alvo + '$') }).first();
    if (await bt.isVisible().catch(() => false)) {
      await bt.click().catch(() => {});
      await page.waitForTimeout(2000);
      break;
    }
  }
  await page.screenshot({ path: 'test-results/9-editor.png' });
  // eslint-disable-next-line no-console
  console.log('IMAGEM (editor): frontend/test-results/9-editor.png');
});
