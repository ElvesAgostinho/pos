/**
 * AS MENSAGENS DE ERRO — as frases que o cliente lê quando alguma coisa falha.
 *
 * Estes testes não abrem browser: correm a função que traduz o erro do servidor
 * (`friendlyError`) e comparam com a frase que sai no ecrã.
 *
 * Porque é que existem: apareceu em produção, numa captura de ecrã do dono, uma
 * caixa a dizer **"Já existe um registo com este este campo. Use outro."** O
 * substituto para "campo desconhecido" já trazia o "este", e a frase punha-lhe
 * outro à frente. O mesmo defeito estava noutra frase: "O este campo escolhido
 * não existe".
 *
 * Uma frase assim custa mais do que parece. Quem a lê está parado a meio de uma
 * coisa e fica sem saber se o problema é dele, se é do programa, e o que há-de
 * fazer a seguir — e é a cara do produto à frente do cliente do nosso cliente.
 *
 * Nenhum teste apanhava isto porque a função nunca tinha sido exercitada com o
 * caso em que o servidor NÃO diz qual é o campo — que é justamente o caso em
 * que a frase tem de ser outra, e não a mesma com um buraco preenchido.
 */
import { test, expect } from '@playwright/test';
import { friendlyError } from '../src/utils/friendlyError';

/** Um erro do DRF como ele chega: resposta 400 com os campos e as mensagens. */
const erroDo400 = (data: any) => ({ response: { status: 400, data } });

test('campo repetido, com o servidor a dizer qual: a frase nomeia o campo', () => {
  const g = friendlyError(erroDo400({ code: ['outlet with this code already exists.'] }));
  expect(g.message).toBe('Já existe um registo com este código. Use outro.');
});

test('campo repetido, sem o servidor dizer qual: não escreve "este este campo"', () => {
  // É assim que o Django devolve um `unique_together` ou uma restrição de base
  // de dados: a mensagem vem solta, sem campo nenhum associado.
  const g = friendlyError(erroDo400({ non_field_errors: ['The fields must make a unique set.'] }));
  expect(g.message).not.toContain('este este');
  expect(g.message).not.toMatch(/\beste campo\b/);
  expect(g.message).toContain('Já existe um registo igual');
});

test('opção que já não existe, sem o servidor dizer qual: não escreve "O este campo"', () => {
  const g = friendlyError(erroDo400({ non_field_errors: ['Invalid pk "9" - object does not exist.'] }));
  expect(g.message).not.toContain('O este campo');
  expect(g.message).toContain('já não existe');
});

test('nenhuma frase traduzida sai com o substituto duplicado', () => {
  // A varredura: qualquer que seja o erro, se o campo for desconhecido a frase
  // nunca pode conter "este este" nem "O este". Guarda as frases que ainda não
  // existem tanto como as de hoje.
  const amostras = [
    'This field is required.',
    'This field may not be blank.',
    'already exists.',
    'A valid integer is required.',
    'A valid number is required.',
    'Date has wrong format.',
    'Invalid pk "3" - object does not exist.',
    'This field may not be null.',
  ];
  for (const m of amostras) {
    const g = friendlyError(erroDo400({ non_field_errors: [m] }));
    expect(g.message, `frase para "${m}"`).not.toContain('este este');
    expect(g.message, `frase para "${m}"`).not.toContain('O este campo');
  }
});
