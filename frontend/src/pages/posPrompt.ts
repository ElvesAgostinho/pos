import { apiClient } from '../api/client';

/**
 * O TERMINAL OBEDECE ÀS CAIXAS — sem as reimplementar.
 *
 * As regras vivem no servidor (é lá que o dinheiro se conta). Quando falta alguma coisa,
 * o servidor não diz só "erro": diz O QUE falta, com um sinal claro — `requires_price`,
 * `requires_quantity`, `requires_weight`, `requires_description`, `requires_auth_code`…
 *
 * Este ficheiro faz a ponte: apanha o sinal, PERGUNTA ao empregado, e repete o pedido
 * com a resposta. Se amanhã se acrescentar uma caixa nova ao backend, o terminal
 * pergunta-a sozinho — não é preciso mexer aqui.
 */

type Pedido = { campo: string; label: string; tipo: 'text' | 'number' };

/** O que cada sinal do servidor quer que se pergunte. */
const PERGUNTAS: Record<string, Pedido> = {
  requires_price: { campo: 'unit_price', label: 'Preço do artigo (Kz)', tipo: 'number' },
  requires_quantity: { campo: 'quantity', label: 'Quantidade', tipo: 'number' },
  requires_weight: { campo: 'quantity', label: 'Peso (kg) — da balança', tipo: 'number' },
  requires_description: { campo: 'description', label: 'O que está a vender', tipo: 'text' },
  requires_document_number: { campo: 'document_number', label: 'Nº do documento (cheque/transf.)', tipo: 'text' },
  requires_bank_reference: { campo: 'bank_reference', label: 'Referência bancária', tipo: 'text' },
  requires_auth_code: { campo: 'auth_code', label: 'Código de autorização do TPA', tipo: 'text' },
  requires_room: { campo: 'room', label: 'Nº do quarto', tipo: 'text' },
  requires_entity: { campo: 'customer', label: 'Nº da entidade (conta corrente)', tipo: 'number' },
};

/**
 * Faz o pedido; se o servidor pedir um dado que falta, pergunta-o e repete.
 * `perguntar` é injetado (prompt, ou um teclado tátil bonito) para isto ser testável.
 */
export async function comPerguntas(
  url: string,
  body: any,
  perguntar: (label: string, detalhe: string, tipo: string) => Promise<string | null>,
  tentativas = 3,
): Promise<any> {
  let corpo = { ...body };
  for (let i = 0; i < tentativas; i++) {
    try {
      return (await apiClient.post(url, corpo)).data;
    } catch (e: any) {
      const d = e?.response?.data;
      if (!d) throw e;
      const sinal = Object.keys(PERGUNTAS).find((k) => d[k]);
      if (!sinal) throw e;                       // é um erro a sério: sobe
      const p = PERGUNTAS[sinal];
      const resposta = await perguntar(p.label, d.detail || '', p.tipo);
      if (resposta === null || resposta === '') throw e;   // o empregado desistiu
      corpo = { ...corpo, [p.campo]: resposta };
    }
  }
  throw new Error('Faltam dados para completar a operação.');
}
