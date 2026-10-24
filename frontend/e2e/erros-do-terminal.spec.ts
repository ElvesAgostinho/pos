import { test, expect, type Page } from '@playwright/test';

/**
 * O QUE A CAIXA DE ERRO MOSTRA — E O QUE NÃO DEVE MOSTRAR.
 *
 * Um cliente acabado de instalar entrou no sistema e, no primeiro minuto, viu
 * uma caixa vermelha: «Erro no terminal — Window message "chrome: call method"
 * timed out». Essa mensagem não existe em nenhum ficheiro deste sistema: vem de
 * uma extensão instalada no browser da máquina dele, que faz uma pergunta à
 * página e desiste de esperar. O dono, que acabava de pagar o sistema, leu "erro
 * no terminal" e pensou que era nosso — e não tinha como saber que não era.
 *
 * O apanhador global de erros (`ui/dialogo.tsx`) é para manter: um erro
 * silencioso dentro de um botão deixa quem está a servir sem saber o que
 * falhou, e "o botão não faz nada" é a pior avaria de diagnosticar à distância.
 * O que ele não pode é pôr o nome da casa em cima do que não é da casa.
 *
 * Por isso estes dois testes andam SEMPRE juntos, e é o par que importa:
 * o ruído de fora é ignorado, e o erro nosso continua a aparecer. Apagar o
 * segundo para fazer o primeiro passar seria trocar um problema visível por um
 * problema mudo.
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
  await page.waitForTimeout(1200);
}

/** Atira uma promessa rejeitada para o ar, como o browser faz. */
async function rejeitar(page: Page, mensagem: string) {
  await page.evaluate((m) => {
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.reject(new Error(m)).catch(() => undefined) as unknown as Promise<unknown>,
      reason: new Error(m),
      cancelable: true,
    }));
  }, mensagem);
  await page.waitForTimeout(700);
}

const CAIXA = 'text=Erro no terminal';

test.describe('A caixa de erro do terminal', () => {
  test('o ruído de uma extensão do browser NÃO assusta o cliente', async ({ page }) => {
    await entrar(page);
    await rejeitar(page, 'Window message "chrome: call method" timed out.');
    await expect(page.locator(CAIXA),
      'A mensagem de uma extensão do browser apareceu como "Erro no terminal" — '
      + 'é o que o cliente viu no primeiro minuto de uso, e não há nada que ele '
      + 'possa fazer com ela.').toHaveCount(0);
  });

  test('um erro NOSSO continua a aparecer', async ({ page }) => {
    // A metade que impede a correcção de se tornar uma mordaça. Se este falhar,
    // o apanhador deixou de servir para o que foi feito.
    await entrar(page);
    await rejeitar(page, 'Cannot read properties of undefined (reading "total")');
    await expect(page.locator(CAIXA).first(),
      'Um erro do próprio sistema deixou de ser mostrado: quem está a servir fica '
      + 'com um botão mudo e sem saber porquê.').toBeVisible({ timeout: 10000 });
  });
});
