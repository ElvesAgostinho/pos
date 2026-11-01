import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';

/**
 * COMO ESTÁ A CASA — os indicadores, a consulta e a escolha de cada utilizador.
 *
 * O DESENHO vive em desktop/EnterpriseDesktop.tsx (PainelDoAmbiente). Aqui fica
 * só o que não é desenho, para quem um dia quiser mostrar os mesmos números
 * noutro sítio não ter de os voltar a definir.
 *
 * ─── DE ONDE VÊM OS NÚMEROS ───────────────────────────────────────────────
 * Do Centro de Operações (`/api/ops/center/`), que já existia e já calculava
 * tudo isto de 12 em 12 segundos: mesas ocupadas, livres e por limpar, vendas
 * do dia, caixas abertas, pedidos atrasados na cozinha, quartos ocupados e
 * livres, chegadas e saídas de hoje, artigos em ruptura.
 *
 * Estava preso num ecrã que só o dono abria. Nenhum número aqui é calculado de
 * novo — se o fosse, haveria duas contas da mesma coisa no mesmo sistema, e
 * mais cedo ou mais tarde dariam valores diferentes. Quem trabalha na recepção
 * ou ao balcão passa a ver o mesmo que o dono vê, sem mudar de ecrã.
 *
 * ─── O QUE CADA MOSAICO TEM DE FAZER ──────────────────────────────────────
 * ABRIR O ECRÃ REAL. Um número que não leva a lado nenhum é decoração: quem vê
 * "3 mesas por limpar" quer ir ao mapa de mesas, não copiar o número para um
 * papel. Por isso cada mosaico tem um destino, e os que não têm destino não
 * entram.
 *
 * ─── E PORQUE SE PODEM DESLIGAR ───────────────────────────────────────────
 * Porque a casa de cada cliente é diferente: um lodge sem restaurante não quer
 * saber de mesas, e um bar sem quartos não quer saber de ocupação. Um painel
 * que mostra seis números irrelevantes é um painel que se fecha e não se volta
 * a abrir. A escolha é POR UTILIZADOR — a governanta e o chefe de sala não
 * olham para o mesmo.
 */

export interface Mosaico {
  id: string;
  label: string;
  icon: string;
  /** Lê o número do que o Centro de Operações devolveu. */
  valor: (d: any) => number | string;
  /** Linha pequena por baixo — o contexto que o número sozinho não dá. */
  nota?: (d: any) => string;
  /** ONDE SE VAI PARAR AO CLICAR.
   *
   * Uma chave de secção do módulo, ou um caminho começado por "/" quando o
   * sítio real vive noutra aplicação — o mapa de mesas e a cozinha são do
   * FrontOffice (/pos e /pos/kds), não do backoffice. Mandar "mesas ocupadas"
   * para uma secção de configuração era dar um destino que não existe, e um
   * mosaico que não abre nada é decoração. */
  destino: string;
  /** Pinta-se quando isto for verdade: é um número que pede acção. */
  alerta?: (d: any) => boolean;
}

/** Os mosaicos do PMS — a casa vista da recepção. */
export const MOSAICOS_PMS: Mosaico[] = [
  {
    id: 'ocupacao', label: 'Ocupação', icon: '📊', destino: 'hotel_status',
    valor: (d) => `${d?.hotel?.occupancy_pct ?? 0}%`,
    nota: (d) => `${d?.hotel?.occupied ?? 0} de ${d?.hotel?.sellable ?? 0} vendáveis`,
  },
  {
    id: 'livres', label: 'Quartos livres', icon: '🛏', destino: 'rooms',
    valor: (d) => d?.hotel?.free ?? 0,
    nota: () => 'prontos a vender',
    alerta: (d) => (d?.hotel?.sellable ?? 0) > 0 && (d?.hotel?.free ?? 0) === 0,
  },
  {
    id: 'porlimpar', label: 'Por limpar', icon: '🧹', destino: 'rooms',
    valor: (d) => d?.hotel?.dirty ?? 0,
    nota: () => 'a aguardar governanta',
    alerta: (d) => (d?.hotel?.dirty ?? 0) > 0,
  },
  {
    id: 'chegadas', label: 'Chegadas hoje', icon: '📅', destino: 'hotel_status',
    valor: (d) => d?.hotel?.arrivals ?? 0,
    nota: () => 'por fazer check-in',
  },
  {
    id: 'saidas', label: 'Saídas hoje', icon: '🚪', destino: 'checkout',
    valor: (d) => d?.hotel?.departures ?? 0,
    nota: () => 'por fazer check-out',
  },
  {
    id: 'emcasa', label: 'Em casa', icon: '👤', destino: 'hotel_status',
    valor: (d) => d?.hotel?.in_house ?? 0,
    nota: () => 'reservas em check-in',
  },
];

/** Os mosaicos do POS — a casa vista do balcão. */
export const MOSAICOS_POS: Mosaico[] = [
  {
    id: 'mesas', label: 'Mesas ocupadas', icon: '🍽', destino: '/pos',
    valor: (d) => `${d?.tables?.occupied ?? 0}/${d?.tables?.total ?? 0}`,
    nota: (d) => `${d?.tables?.free ?? 0} livres`,
  },
  {
    id: 'mesassujas', label: 'Mesas por limpar', icon: '🧹', destino: '/pos',
    valor: (d) => d?.tables?.dirty ?? 0,
    nota: () => 'a aguardar sala',
    alerta: (d) => (d?.tables?.dirty ?? 0) > 0,
  },
  {
    id: 'vendas', label: 'Vendas hoje', icon: '💰', destino: 'x_reports',
    valor: (d) => Number(d?.sales?.today || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 }),
    nota: (d) => `${d?.sales?.tickets ?? 0} documento(s)`,
  },
  {
    id: 'porfechar', label: 'Contas abertas', icon: '🧾', destino: 'x_accounts',
    valor: (d) => Number(d?.sales?.open_amount || 0).toLocaleString('pt-PT', { maximumFractionDigits: 0 }),
    nota: () => 'ainda por cobrar',
  },
  {
    id: 'cozinha', label: 'Cozinha', icon: '👨‍🍳', destino: '/pos/kds',
    valor: (d) => (d?.kitchen?.pending ?? 0) + (d?.kitchen?.preparing ?? 0),
    nota: (d) => `${d?.kitchen?.delayed ?? 0} atrasado(s)`,
    alerta: (d) => (d?.kitchen?.delayed ?? 0) > 0,
  },
  {
    id: 'caixas', label: 'Caixas abertas', icon: '🏦', destino: 'x_dayclose',
    valor: (d) => d?.cash?.sessions_open ?? 0,
    nota: () => 'por fechar',
  },
  {
    id: 'rutura', label: 'Em ruptura', icon: '📦', destino: 'x_stock',
    valor: (d) => d?.stock?.low_count ?? 0,
    nota: () => 'artigos abaixo do mínimo',
    alerta: (d) => (d?.stock?.low_count ?? 0) > 0,
  },
];

/* ─── QUAIS ESTÃO LIGADOS, POR UTILIZADOR ──────────────────────────────── */

function quem(): string {
  try {
    return JSON.parse(localStorage.getItem('erp_user') || '{}').username || 'anonimo';
  } catch {
    return 'anonimo';
  }
}
const chave = (modulo: string) => `painel_rapido:${quem()}:${modulo}`;

/** Sem escolha gravada, vêm todos ligados: quem nunca abriu as definições tem
 *  de ver alguma coisa, senão o painel abre vazio e parece avariado. */
export function lerLigados(modulo: string, todos: Mosaico[]): string[] {
  try {
    const cru = JSON.parse(localStorage.getItem(chave(modulo)) || 'null');
    if (Array.isArray(cru)) return cru;
  } catch { /* valor estragado: cai para o conjunto de fábrica */ }
  return todos.map((m) => m.id);
}

export function gravarLigados(modulo: string, ids: string[]) {
  try { localStorage.setItem(chave(modulo), JSON.stringify(ids)); } catch { /* sem espaço */ }
  window.dispatchEvent(new CustomEvent('painel-rapido', { detail: { modulo } }));
}

/**
 * A CONSULTA, num sítio só.
 *
 * O painel da barra de estado e os mosaicos do Ambiente de Trabalho mostram as
 * MESMAS contas em duas roupas diferentes — uma clara dentro do módulo, outra
 * escura no ambiente. Duas consultas ao mesmo endereço dariam dois números
 * diferentes no mesmo segundo (cada uma com o seu relógio), e quem visse os
 * dois ecrãs lado a lado deixaria de confiar em nenhum.
 *
 * A mesma `queryKey` também quer dizer uma só chamada ao servidor quando os
 * dois estão abertos — o TanStack Query parte a cache por chave.
 */
export function usePainelRapido(activo = true) {
  return useQuery({
    queryKey: ['painel-rapido'],
    queryFn: async () => (await apiClient.get('ops/center/')).data,
    refetchInterval: 20000,
    enabled: activo,
  });
}

/** Quais os mosaicos deste utilizador, e como os ligar e desligar. */
export function useMosaicosLigados(modulo: string, mosaicos: Mosaico[]) {
  const [ligados, setLigados] = useState<string[]>(() => lerLigados(modulo, mosaicos));
  useEffect(() => {
    const r = () => setLigados(lerLigados(modulo, mosaicos));
    window.addEventListener('painel-rapido', r);
    return () => window.removeEventListener('painel-rapido', r);
  }, [modulo, mosaicos]);

  const alternar = (id: string) => {
    const novos = ligados.includes(id) ? ligados.filter((x) => x !== id) : [...ligados, id];
    gravarLigados(modulo, novos);
    setLigados(novos);
  };
  return { ligados, visiveis: mosaicos.filter((m) => ligados.includes(m.id)), alternar };
}

/*
 * NÃO HÁ AQUI COMPONENTE NENHUM, E É DE PROPÓSITO.
 *
 * Houve: um painel claro que abria da barra de estado do PMS e da Configuração
 * POS. O dono viu-o e disse que o sítio era outro — o Ambiente de Trabalho, que
 * é onde se vê como está a casa ANTES de se entrar em lado nenhum. O desenho
 * mudou-se para lá (desktop/EnterpriseDesktop.tsx, PainelDoAmbiente), em escuro.
 *
 * Deixar aqui o painel claro "para o caso de" era guardar um segundo desenho
 * dos mesmos números, que ninguém abre e que deixa de acompanhar o primeiro à
 * primeira alteração. O que fica neste ficheiro é o que os DOIS precisariam: a
 * lista de mosaicos, a consulta e a escolha do utilizador.
 */
