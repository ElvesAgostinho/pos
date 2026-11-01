import { EventRequests } from '../posconfig/PosMarketing';

/**
 * EMS (Eventos) — o MESMO ecrã de Pedidos de Evento do comercial.
 *
 * ─── O QUE ESTAVA AQUI, E PORQUE SAIU ─────────────────────────────────────
 * Um formulário próprio com oito campos — designação, data, hora, sala (TEXTO
 * LIVRE), cliente, nº de pessoas, estado (quatro palavras fixas) e receita
 * estimada — a gravar numa tabela só do PMS (`pms.Event`).
 *
 * O ecrã do comercial, a dois cliques de distância, tinha o resto: tipo de
 * evento, tipo e disposição de espaço, estados definidos pelo hotel com a regra
 * de BLOQUEIO DO ESPAÇO, estados adicionais, motivo de cancelamento, segmento,
 * canal, package, preço por pessoa, extras e a marca de "respondido".
 *
 * A diferença não era de gosto. Um evento marcado aqui **não reservava a sala**:
 * nada impedia dois eventos no mesmo espaço à mesma hora, porque cada lado tinha
 * a sua tabela e não sabia do outro. E o Calendário de Eventos lia a tabela do
 * PMS, por isso o que o comercial lançava no ecrã bom não aparecia nele.
 *
 * Agora é um ecrã só, sobre uma tabela só (`pos.EventRequest`). O que o hotel
 * precisa de ver à sua maneira — o calendário e a previsão de receita —
 * continua a vir de `pms/events/`, que passou a ser uma VISTA do mesmo pedido
 * no vocabulário do PMS (ver backend/pms/events_api.py).
 *
 * Este ficheiro fica, em vez de se apontar o menu directamente ao componente do
 * POS, porque é aqui que se explica porquê — e porque o menu do PMS continua a
 * ser quem decide o que o EMS mostra.
 */
export default function PmsEventsView({ pedido }: { pedido?: { abrirId?: number } }) {
  // `pedido` é o que o ecrã anterior pediu ao navegar para cá — por exemplo, o
  // calendário a dizer em que evento se carregou. Sem isto, chegava-se ao EMS e
  // era preciso procurar outra vez o evento que se acabou de ver.
  return <EventRequests abrirId={pedido?.abrirId} />;
}
