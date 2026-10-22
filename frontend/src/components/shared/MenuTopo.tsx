import { useState, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { TOKENS, RADIUS, SHADOW } from '../../config/theme';
import { Glyph } from '../posconfig/kit';

/**
 * A BARRA DE MENUS DE TOPO — uma só, usada pelo PMS e pela Configuração POS.
 *
 * Existiam duas, escritas à parte em ficheiros diferentes, a fazer exactamente
 * a mesma coisa: a barra na cor da marca, o logótipo que troca de módulo, os
 * títulos que abrem listas, a lista branca com sombra, e o clique fora que
 * fecha. Mantê-las iguais era trabalho manual — e trabalho manual esquece-se.
 * Foi assim que a seta "▾", removida do PMS, sobreviveu meses na Configuração
 * POS; e foi assim que as duas ficaram com hovers diferentes no mesmo botão.
 *
 * O que NÃO vem para aqui é o que cada módulo faz quando se escolhe um item:
 * o PMS troca de secção e avisa quando algo ainda não existe, a Configuração
 * POS tem favoritos, separadores e ecrãs próprios. Isso continua de cada lado,
 * por `renderItem` — é a parte que é mesmo diferente, e juntá-la à força daria
 * um componente cheio de condições a servir dois donos.
 */

export interface MenuTopoGrupo<T> {
  title: string;
  items: T[];
}

export function MenuTopo<T>({
  menus, logoUrl, onDesktop, renderItem, larguraLista = 260, extra,
}: {
  menus: MenuTopoGrupo<T>[];
  /** Logótipo real do cliente; sem ele, um ícone neutro — nunca uma marca nossa. */
  logoUrl?: string;
  /** Voltar ao Ambiente de Trabalho. Sem isto, o logótipo não abre nada. */
  onDesktop?: () => void;
  /** Como se desenha cada item da lista. `fechar()` fecha o menu aberto. */
  renderItem: (item: T, indice: number, fechar: () => void) => ReactNode;
  larguraLista?: number;
  /** O que fica à direita na barra (relógio, utilizador, pesquisa…). */
  extra?: ReactNode;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  const fechar = () => setMenu(null);

  return (
    <div className="flex items-center gap-1 px-3 flex-shrink-0 text-white"
      style={{ background: TOKENS.brand, height: 56 }}>

      {/* O LOGÓTIPO é o seletor de módulos. */}
      <div className="relative pr-4 mr-2">
        <button onClick={() => setMenu(menu === '__ml' ? null : '__ml')} title="Trocar de módulo"
          className={`flex items-center gap-2 px-2 py-1 leading-none transition-colors ${
            menu === '__ml' ? 'bg-white/20' : 'hover:bg-white/10'}`}
          style={{ borderRadius: RADIUS.md }}>
          {logoUrl
            ? <img src={logoUrl} alt="" className="h-9 w-9 object-contain flex-shrink-0 rounded-full" />
            : <Building2 size={20} className="flex-shrink-0" />}
        </button>
        {menu === '__ml' && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={fechar} />
            <div className="absolute left-0 top-full mt-2 z-[61] min-w-[240px] py-2 overflow-hidden"
              style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.lineSoft}`,
                       borderRadius: RADIUS.md, boxShadow: SHADOW.pop }}>
              <button onClick={() => { fechar(); onDesktop?.(); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] text-[#111827] hover:bg-[#EFF6FF] hover:text-[#1D4ED8] transition-colors">
                <Glyph icon="🖥" size={15} chip />Ambiente de Trabalho
              </button>
            </div>
          </>
        )}
      </div>

      {menus.map((m) => (
        <div key={m.title} className="relative">
          {/* SÓ TROCA DE MENU AO CLICAR.
              Havia aqui um `onMouseEnter` que trocava de menu só por o rato
              passar por cima de um título a caminho de outro sítio, sem se
              clicar em nada — o operador achava que o sistema "saltava sozinho"
              de secção. Foi tirado do PMS e ficou na Configuração POS, porque
              eram dois ficheiros. Agora é um. */}
          <button onClick={() => setMenu(menu === m.title ? null : m.title)}
            className={`px-4 py-2 text-[14px] font-medium transition-colors whitespace-nowrap ${
              menu === m.title ? 'text-white' : 'text-white/85 hover:text-white hover:bg-white/10'}`}
            style={{
              background: menu === m.title ? 'rgba(255,255,255,0.2)' : 'transparent',
              borderRadius: RADIUS.sm,
            }}>
            {/* Sem a seta "▾": com os títulos todos na barra não cabia ao lado
                do texto e caía para uma segunda linha debaixo de cada menu. Que
                um título de menu abre uma lista percebe-se por si. */}
            {m.title}
          </button>
          {menu === m.title && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={fechar} />
              <div className="absolute left-0 top-full mt-2 z-[61] py-2 overflow-hidden"
                style={{ minWidth: larguraLista, background: TOKENS.surface,
                         border: `1px solid ${TOKENS.lineSoft}`,
                         borderRadius: RADIUS.md, boxShadow: SHADOW.pop }}>
                {m.items.map((it, i) => renderItem(it, i, fechar))}
              </div>
            </>
          )}
        </div>
      ))}

      {extra}
    </div>
  );
}

/** Um item de lista — o desenho é o mesmo nos dois módulos. */
export function MenuItem({ icon, label, nota, onClick }: {
  icon?: string; label: ReactNode; nota?: ReactNode; onClick: () => void;
}) {
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-[14px] text-[#111827] hover:bg-[#EFF6FF] hover:text-[#1D4ED8] transition-colors">
      {icon !== undefined && <Glyph icon={icon} size={15} chip />}
      {label}
      {nota}
    </button>
  );
}

/** O traço que separa grupos dentro de uma lista. */
export function MenuSeparador() {
  return <div className="my-1.5 border-t border-[#F1F2F4]" />;
}
