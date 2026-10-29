import { defineConfig } from '@playwright/test';

/**
 * OS TESTES DE INTERFACE correm contra o sistema A CORRER — backend em 8017 com
 * uma base de dados semeada no scratchpad (nunca a de desenvolvimento) e o vite
 * em 5177. Não se arrancam servidores aqui de propósito: quem os arranca é quem
 * corre os testes, para poder ver o que ficou no ecrã se algo falhar.
 */
export default defineConfig({
  // DOIS CONJUNTOS, porque têm necessidades opostas:
  //
  //   · `calculo` (unit/) — a aritmética do rodapé dos relatórios. São funções
  //     puras: não abrem browser nem precisam de servidor nenhum, e correm em
  //     milissegundos. Ficam aqui, no runner que o projecto já tem, em vez de
  //     se instalar um segundo runner só para elas.
  //   · `ecras` (e2e/) — o sistema a correr, com backend e vite de pé.
  //
  // Correr só a aritmética:  npx playwright test --project=calculo
  projects: [
    { name: 'calculo', testDir: './unit' },
    { name: 'ecras', testDir: './e2e' },
  ],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5177',
    headless: true,
    screenshot: 'only-on-failure',
    video: 'off',
    trace: 'off',
    viewport: { width: 1440, height: 900 },
  },
});
