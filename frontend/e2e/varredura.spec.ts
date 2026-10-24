import { test, expect, type ConsoleMessage, type Page } from '@playwright/test';
import { ecrasDaArvore, itensSemEcra } from './ecras';

/**
 * A VARREDURA COM OLHOS — os 160 ecrãs do backoffice, abertos num browser real.
 *
 * Já existe uma varredura de servidor (`backend/core/test_todos_os_ecrans.py`):
 * abre as ~300 rotas de listagem da API e exige que nenhuma responda 500. É
 * indispensável e não chega, porque responde a uma pergunta diferente. Um ecrã
 * que RECEBE os dados e rebenta a formatá-los — uma data nula, uma divisão por
 * um total zero, o artigo de uma linha apagada — tem uma API a responder 200 e
 * um ecrã em branco. Foi assim que o defeito do foco no login chegou ao cliente
 * com 804 testes verdes atrás dele.
 *
 * Esta abre cada ecrã como a aplicação o abre (o mesmo `ui_nav` que o
 * `irParaModulo` usa) e exige três coisas:
 *   · a consola do browser não dá erro — um erro de JavaScript é um ecrã morto;
 *   · o ErrorBoundary não apareceu — se apareceu, o ecrã rebentou a desenhar;
 *   · ficou conteúdo no ecrã — um ecrã que desenha nada é um ecrã que não serve,
 *     mesmo que ninguém veja um erro.
 *
 * Corre contra o sistema a correr (backend em 8017 com base semeada, vite em
 * 5177). Ver playwright.config.ts.
 */

const BASE = 'http://localhost:5177';
const UTILIZADOR = 'dono';
const SENHA = 'MwanaLodge#2026';

const RUIDO = [
  'favicon', 'ERR_CONNECTION_REFUSED', 'Download the React DevTools',
  'net::ERR_ABORTED', 'ResizeObserver loop',
  // A licença e a VPN falam com serviços que não correm nesta máquina de teste.
  'licensing/', 'support/',
];

/** O que o ErrorBoundary escreve quando um ecrã rebenta a desenhar. */
const MARCA_DE_REBENTADO = 'O ecrã não pôde ser apresentado';

function vigiar(page: Page, saco: string[]) {
  page.on('console', (m: ConsoleMessage) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (RUIDO.some((r) => t.includes(r))) return;
    saco.push(t.slice(0, 220));
  });
  page.on('pageerror', (e) => saco.push(`pageerror: ${e.message.slice(0, 220)}`));
}

async function entrar(page: Page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  const u = page.locator('input').first();
  await u.waitFor({ state: 'visible', timeout: 45000 });
  await u.pressSequentially(UTILIZADOR, { delay: 8 });
  await page.locator('input[type="password"]').first().pressSequentially(SENHA, { delay: 8 });
  await page.locator('button[type="submit"], button:has-text("Entrar")').first().click();
  // Espera por SINAL (o login saiu do ecrã), nunca por "rede parada": uma
  // aplicação com consultas periódicas nunca tem a rede parada.
  await page.waitForFunction(() => !document.querySelector('input[type="password"]'),
    { timeout: 45000 });
}

test.describe('Varredura do backoffice num browser real', () => {
  test('a árvore não promete ecrãs que não existem', () => {
    // Um item na árvore sem vista registada abre... nada. O utilizador clica e o
    // ecrã fica no anterior, sem explicação nenhuma.
    const orfaos = itensSemEcra();
    expect(orfaos, 'Itens da árvore sem ecrã registado: '
      + orfaos.map((o) => `${o.module}/${o.id} (${o.name})`).join(', ')).toEqual([]);
  });

  test('a varredura conhece mesmo o sistema todo', () => {
    // Uma varredura só vale se estiver a abrir o sistema inteiro: se um dia ela
    // encontrar meia dúzia de ecrãs, passa por estar vazia e não por estar bem.
    const ecras = ecrasDaArvore();
    expect(ecras.length, `A varredura só encontrou ${ecras.length} ecrãs.`)
      .toBeGreaterThan(120);
    expect(new Set(ecras.map((e) => e.module)).size,
      'A varredura não está a cobrir os 21 centros.').toBeGreaterThanOrEqual(20);
  });

  // UM TESTE POR CENTRO, e não um único que abre os 160.
  //
  // Começou por ser um só: abria os 160 ecrãs na mesma página, com um
  // recarregamento em cada, e o processo do Node morria a meio com "JavaScript
  // heap out of memory" — 160 ciclos de vida de uma aplicação React numa página
  // que nunca é largada. O teste não falhava: MORRIA, que é pior, porque não diz
  // nada sobre nenhum ecrã.
  //
  // Um teste por centro dá uma página nova a cada um (o Playwright larga-a no
  // fim), e dá outra coisa que falta ao teste único: quando falha, falha com o
  // nome do centro no título — vê-se logo onde doeu.
  for (const modulo of [...new Set(ecrasDaArvore().map((e) => e.module))]) {
    const doModulo = ecrasDaArvore().filter((e) => e.module === modulo);
    const titulo = doModulo[0].moduleTitle;

    test(`${titulo}: nenhum ecrã rebenta nem abre em branco`, async ({ page }) => {
      test.setTimeout(4 * 60 * 1000);
      const problemas: string[] = [];
      const erros: string[] = [];
      vigiar(page, erros);
      await entrar(page);

      for (const ecra of doModulo) {
        erros.length = 0;
        const onde = `${ecra.name} (${ecra.module}/${ecra.id})`;

        // UMA VARREDURA NÃO PÁRA NA PRIMEIRA BAIXA.
        //
        // Sem isto, o primeiro ecrã que rebentasse de um modo inesperado (uma
        // navegação que destaca a página, um `body` que nunca fica visível)
        // levava consigo o teste do centro INTEIRO — e os ecrãs a seguir ficavam
        // por abrir, sem ninguém saber se estavam bons ou maus. O que se quer de
        // uma varredura é a LISTA do que está mau, não o primeiro item dela.
        try {

        // Aberto pelo MECANISMO DA PRÓPRIA APLICAÇÃO (`ui_nav` é o que o
        // `irParaModulo` escreve): nada de URLs inventados para o teste.
        await page.evaluate(({ module, id }) => {
          localStorage.setItem('ui_nav', JSON.stringify({ module, screen: id }));
        }, { module: ecra.module, id: ecra.id });
        await page.reload({ waitUntil: 'domcontentloaded' });

        // ESPERA PELO CONTEÚDO, não por "o body estar visível".
        //
        // `body.waitFor({state:'visible'})` parecia a espera óbvia e era uma
        // armadilha: para o Playwright, um elemento sem caixa é um elemento
        // escondido — e um `<body>` ainda vazio (o React por montar) tem altura
        // zero. A varredura falhava em centros DIFERENTES a cada corrida,
        // conforme a máquina estivesse mais ou menos carregada, e culpava o
        // ecrã que calhasse. Um teste que acusa um inocente diferente de cada
        // vez é pior do que não existir.
        //
        // O que interessa é se o ecrã chegou a DESENHAR. Espera-se por isso; se
        // não desenhar a tempo, não se rebenta — regista-se, que é a conclusão
        // que o teste existe para tirar.
        await page.waitForFunction(
          () => (document.body?.innerText || '').trim().length > 40,
          { timeout: 20000 },
        ).catch(() => undefined);

        const corpo = (await page.locator('body').innerText().catch(() => '')) || '';

        if (corpo.includes(MARCA_DE_REBENTADO)) {
          const detalhe = (await page.locator('pre').first().innerText().catch(() => '')) || '';
          problemas.push(`${onde} — REBENTOU A DESENHAR: ${detalhe.slice(0, 200)}`);
        } else if (corpo.trim().length < 120) {
          problemas.push(`${onde} — ABRIU EM BRANCO (${corpo.trim().length} caracteres)`);
        }
        if (erros.length) {
          problemas.push(`${onde} — ERRO NA CONSOLA: ${[...new Set(erros)].slice(0, 2).join(' | ')}`);
        }
        } catch (e: any) {
          problemas.push(`${onde} — NÃO SE CONSEGUIU ABRIR: ${String(e?.message).slice(0, 180)}`);
          // A página pode ter ficado num estado estranho (navegada para fora,
          // destacada). Volta-se ao princípio para o ecrã seguinte não herdar isso.
          await page.goto(BASE + '/backoffice', { waitUntil: 'domcontentloaded' })
            .catch(() => undefined);
          await page.waitForTimeout(600);
        }
      }

      expect(problemas, `${problemas.length} problema(s) em ${doModulo.length} ecrãs de `
        + `"${titulo}", abertos num browser a sério:\n    `
        + problemas.join('\n    ') + '\n').toEqual([]);
    });
  }
});
