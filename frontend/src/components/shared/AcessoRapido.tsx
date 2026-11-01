import { useCallback, useEffect, useState } from 'react';
import { TOKENS } from '../../config/theme';
import { Glyph, corDoIcone } from '../posconfig/kit';

/**
 * BARRA DE ACESSO RÁPIDO — o que este utilizador usa todos os dias.
 *
 * ─── PORQUE É PARTILHADA ──────────────────────────────────────────────────
 * O POS já tinha favoritos: um comando "Adicionar aos favoritos" no ribbon que
 * guardava a secção onde se estava, e uma lista no topo da árvore. Funcionava,
 * mas estava só do lado do POS e escondida dentro da árvore — para chegar a um
 * favorito era preciso o painel lateral estar aberto. O PMS não tinha nada.
 *
 * Fazer uma barra nova para o PMS seria a terceira lista de atalhos no sistema.
 * Isto é UMA: o mesmo armazenamento, a mesma barra, os dois módulos. O POS
 * continua a mostrar os seus na árvore se quiser — lê daqui, não de uma cópia.
 *
 * ─── PORQUE FICA NO BROWSER ───────────────────────────────────────────────
 * Não existe (ainda) guarda de preferências por utilizador no servidor. O
 * sistema já resolve isto no browser para a secção aberta, o último utilizador
 * e o papel de parede, e seguir a convenção é melhor do que inventar meia
 * infra-estrutura só para isto.
 *
 * O QUE NÃO SE FAZ é guardar numa chave só: num computador de recepção entram
 * três pessoas no mesmo browser, e os atalhos de uma não são os da outra. A
 * chave leva o NOME DE QUEM ESTÁ LIGADO. Mudar isto para o servidor é trocar
 * estas duas funções, e mais nada.
 */

export interface Atalho {
  /** O que abrir. É a chave de secção que os dois módulos já usam. */
  id: string;
  label: string;
  /** O mesmo ícone do comando no ribbon, para a barra e o menu casarem. */
  icon?: string;
}

function quem(): string {
  try {
    return JSON.parse(localStorage.getItem('erp_user') || '{}').username || 'anonimo';
  } catch {
    return 'anonimo';
  }
}

const chave = (modulo: string) => `acesso_rapido:${quem()}:${modulo}`;

export function lerAtalhos(modulo: string): Atalho[] {
  try {
    const cru = JSON.parse(localStorage.getItem(chave(modulo)) || 'null');
    if (Array.isArray(cru)) return cru.filter((a) => a && a.id && a.label);
  } catch { /* um valor estragado não pode impedir o módulo de abrir */ }

  // MIGRAÇÃO DOS FAVORITOS ANTIGOS DO POS (`posc_favs`, {key,label}).
  // Quem já tinha favoritos encontra-os na barra nova em vez de os perder e ter
  // de os marcar outra vez — perder a configuração de alguém numa actualização é
  // das poucas coisas que fazem desconfiar do sistema inteiro.
  if (modulo === 'pos') {
    try {
      const velhos = JSON.parse(localStorage.getItem('posc_favs') || '[]');
      if (Array.isArray(velhos) && velhos.length) {
        return velhos.filter((f: any) => f?.key).map((f: any) => ({ id: f.key, label: f.label || f.key }));
      }
    } catch { /* idem */ }
  }
  return [];
}

function gravar(modulo: string, itens: Atalho[]) {
  try {
    localStorage.setItem(chave(modulo), JSON.stringify(itens));
    // O POS lê `posc_favs` na árvore. Mantém-se escrito para os dois lados
    // mostrarem o mesmo enquanto a árvore não passar a ler daqui.
    if (modulo === 'pos') {
      localStorage.setItem('posc_favs', JSON.stringify(itens.map((a) => ({ key: a.id, label: a.label }))));
    }
  } catch { /* browser sem espaço: perde-se o atalho, não o ecrã */ }
  // AVISA AS OUTRAS PARTES DO ECRÃ. A barra e a árvore são dois componentes
  // distintos a ler o mesmo armazenamento; sem um aviso, fixar um atalho na
  // barra deixava a árvore a mostrar a lista velha até alguém recarregar.
  window.dispatchEvent(new CustomEvent('acesso-rapido', { detail: { modulo } }));
}

/** O estado dos atalhos deste módulo, já ligado às alterações de outros ecrãs. */
export function useAcessoRapido(modulo: string) {
  const [itens, setItens] = useState<Atalho[]>(() => lerAtalhos(modulo));

  useEffect(() => {
    const recarregar = () => setItens(lerAtalhos(modulo));
    window.addEventListener('acesso-rapido', recarregar);
    // `storage` dispara quando a MESMA conta tem o sistema aberto noutro
    // separador — fixar lá dentro aparece cá sem recarregar.
    window.addEventListener('storage', recarregar);
    return () => {
      window.removeEventListener('acesso-rapido', recarregar);
      window.removeEventListener('storage', recarregar);
    };
  }, [modulo]);

  const fixar = useCallback((a: Atalho) => {
    const atuais = lerAtalhos(modulo);
    if (atuais.some((x) => x.id === a.id)) return false;   // já lá estava
    gravar(modulo, [...atuais, a]);
    return true;
  }, [modulo]);

  const desafixar = useCallback((id: string) => {
    gravar(modulo, lerAtalhos(modulo).filter((x) => x.id !== id));
  }, [modulo]);

  return { itens, fixar, desafixar };
}

/**
 * A BARRA. Vive na fila dos separadores, à direita — não acrescenta altura
 * nenhuma ao sistema, que já tem faixas de moldura a mais antes do primeiro
 * dado. Ícones de 15px, como a barra de acesso rápido do Office.
 */
export function BarraAcessoRapido({ modulo, onAbrir, activo }: {
  modulo: string;
  onAbrir: (id: string) => void;
  /** A secção aberta agora, para o atalho dela se ver marcado. */
  activo?: string;
}) {
  const { itens, desafixar } = useAcessoRapido(modulo);
  if (!itens.length) return null;

  return (
    <div className="flex items-center gap-[1px] mr-2 pl-1.5 self-center"
      style={{ borderLeft: `1px solid ${TOKENS.chromeLine}` }}>
      {itens.map((a) => {
        const sel = a.id === activo;
        return (
          <button key={a.id}
            onClick={() => onAbrir(a.id)}
            // BOTÃO DIREITO TIRA. Um atalho que se fixa e não se tira é uma
            // barra que só cresce — e ao fim de um mês deixa de ser rápida.
            onContextMenu={(e) => { e.preventDefault(); desafixar(a.id); }}
            title={`${a.label} — botão direito para tirar da barra`}
            className="w-[22px] h-[21px] flex items-center justify-center flex-shrink-0"
            style={{
              background: sel ? TOKENS.selectedRow : 'transparent',
              border: `1px solid ${sel ? TOKENS.selectedRowLine : 'transparent'}`,
            }}
            onMouseEnter={(e) => {
              if (sel) return;
              e.currentTarget.style.background = TOKENS.hoverGold;
              e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
            }}
            onMouseLeave={(e) => {
              if (sel) return;
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'transparent';
            }}>
            <Glyph icon={a.icon || '📌'} size={15} tom={corDoIcone(a.icon || '📌')} />
          </button>
        );
      })}
    </div>
  );
}
