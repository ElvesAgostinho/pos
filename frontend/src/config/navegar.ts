/**
 * TROCAR DE MÓDULO.
 *
 * Isto vivia dentro do App.tsx. Saiu para aqui quando a tira de módulos da
 * extrema esquerda do shell passou a precisar da mesma função: se o shell a
 * fosse buscar ao App, ficavam dois ficheiros a importar-se um ao outro — e um
 * ciclo de importações é daqueles defeitos que não dá erro nenhum enquanto não
 * dá, e aí dá num sítio que não tem nada a ver.
 *
 * A troca de módulo não é uma navegação de rota: o backoffice inteiro vive numa
 * só rota (/backoffice/*) e o que muda é o estado lá dentro. Por isso deixa-se
 * o pedido escrito e recarrega-se — a aplicação arranca já no módulo pedido, em
 * vez de obrigar a passar pelo Ambiente de Trabalho a cada salto.
 */
const PEDIDO = 'ui_nav';

export const irParaModulo = (module: string, screen: string) => {
  localStorage.setItem(PEDIDO, JSON.stringify({ module, screen }));
  window.location.reload();
};

export function lerPedido(): { screen: string; module: string } | null {
  try {
    const raw = localStorage.getItem(PEDIDO);
    if (!raw) return null;
    localStorage.removeItem(PEDIDO);   // é um pedido, não uma preferência
    const p = JSON.parse(raw);
    return p?.module && p?.screen ? p : null;
  } catch {
    return null;
  }
}
