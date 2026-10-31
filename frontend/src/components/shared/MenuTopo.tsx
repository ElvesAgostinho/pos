import { createContext, useContext, useState, type ReactNode } from 'react';
import { Building2 } from 'lucide-react';
import { TOKENS, RADIUS, SHADOW } from '../../config/theme';
import { Glyph, corDoIcone } from '../posconfig/kit';

/**
 * A MOLDURA DE TOPO — uma só, usada pelo PMS e pela Configuração POS.
 *
 * Existiam duas, escritas à parte em ficheiros diferentes, a fazer exactamente
 * a mesma coisa. Mantê-las iguais era trabalho manual — e trabalho manual
 * esquece-se: foi assim que a seta "▾", removida do PMS, sobreviveu meses na
 * Configuração POS. Agora é uma.
 *
 * ─── O QUE MUDOU, E PORQUÊ ────────────────────────────────────────────────
 * Era uma barra azul com títulos que abriam listas suspensas. Passou a ser o
 * que é em qualquer ERP de gestão: uma fila de SEPARADORES e, por baixo, o
 * RIBBON com os comandos desse separador à vista, agrupados.
 *
 * A diferença não é de gosto. Com listas suspensas, saber o que o sistema faz
 * obriga a abrir nove menus um a um e a fechá-los; e cada comando custa dois
 * cliques, sempre, todos os dias. Com o ribbon, os comandos do separador aberto
 * estão à vista — aprende-se a olhar, e usa-se com um clique. É o que o dono
 * pediu ao mandar clonar os ecrãs, e é por isso que esses ERP são assim.
 *
 * O que NÃO vem para aqui é o que cada módulo FAZ quando se escolhe um item:
 * isso continua de cada lado, por `renderItem`. É a parte que é mesmo diferente,
 * e juntá-la à força daria um componente cheio de condições a servir dois donos.
 */

export interface MenuTopoGrupo<T> {
  title: string;
  items: T[];
}

/**
 * Diz ao `MenuItem` em que registo se está a desenhar.
 *
 * O mesmo item aparece em dois sítios com formas opostas: no ribbon é um botão
 * alto, ícone grande em cima e legenda por baixo; numa lista é uma linha de
 * largura inteira. Quem chama o `MenuTopo` escreve o item UMA vez (`renderItem`)
 * e não tem de saber onde vai parar — é o que evita duas versões do mesmo menu
 * a divergirem, que é precisamente o defeito que este ficheiro veio resolver.
 */
const ModoRibbon = createContext(false);

export function MenuTopo<T>({
  menus, logoUrl, onDesktop, renderItem, extra,
}: {
  menus: MenuTopoGrupo<T>[];
  /** Logótipo real do cliente; sem ele, um ícone neutro — nunca uma marca nossa. */
  logoUrl?: string;
  /** Voltar ao Ambiente de Trabalho. Sem isto, o logótipo não abre nada. */
  onDesktop?: () => void;
  /** Como se desenha cada item. `fechar()` existe por compatibilidade: no
   *  ribbon não há nada para fechar, e é uma função que não faz nada. */
  renderItem: (item: T, indice: number, fechar: () => void) => ReactNode;
  /** Largura da antiga lista suspensa. Já não é usada — fica aceite para os
   *  dois módulos continuarem a compilar sem se lhes mexer. */
  larguraLista?: number;
  /** O que fica à direita na barra (relógio, utilizador, pesquisa…). */
  extra?: ReactNode;
}) {
  const [aba, setAba] = useState('');
  const [modulos, setModulos] = useState(false);
  // O separador aberto. Guarda-se o NOME e não o índice: a lista de menus muda
  // com a licença e com as permissões, e um índice guardado passa a apontar
  // para outro menu quando um deles desaparece.
  const activo = menus.find((m) => m.title === aba) || menus[0];
  const nada = () => {};

  return (
    <div className="flex-shrink-0 select-none" style={{ color: TOKENS.textOnLight }}>

      {/* ─── FILA DE SEPARADORES ─────────────────────────────────────────── */}
      <div className="flex items-end gap-0 px-1 pt-[2px] h-[26px] border-b"
        style={{ background: TOKENS.tabBar, borderColor: TOKENS.chromeLine }}>

        {/* O LOGÓTIPO é o seletor de módulos. */}
        <div className="relative mr-1.5 self-center">
          <button onClick={() => setModulos((o) => !o)} title="Trocar de módulo"
            className="flex items-center justify-center w-[21px] h-[21px] hover:bg-black/10">
            {logoUrl
              ? <img src={logoUrl} alt="" className="h-[19px] w-[19px] object-contain flex-shrink-0" />
              : <Building2 size={15} />}
          </button>
          {modulos && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setModulos(false)} />
              <div className="absolute left-0 top-full mt-1 z-[61] min-w-[220px] py-1 overflow-hidden"
                style={{ background: TOKENS.surface, border: `1px solid ${TOKENS.chromeLine}`,
                         borderRadius: RADIUS.lg, boxShadow: SHADOW.pop }}>
                <button onClick={() => { setModulos(false); onDesktop?.(); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[#DBEAFE]"
                  style={{ color: TOKENS.textOnLight }}>
                  <Glyph icon="🖥" size={14} />Ambiente de Trabalho
                </button>
              </div>
            </>
          )}
        </div>

        {menus.map((m) => {
          const sel = m.title === activo?.title;
          return (
            <button key={m.title} onClick={() => setAba(m.title)}
              className="h-[24px] px-3 text-[12px] whitespace-nowrap"
              style={{
                // O SEPARADOR ABERTO LIGA-SE AO RIBBON DE BAIXO: o mesmo fundo
                // e sem linha inferior, para os dois lerem como uma peça só. Sem
                // isto são dois rectângulos encostados e não se percebe que o de
                // cima manda no de baixo.
                background: sel ? TOKENS.chrome : 'transparent',
                borderTop: `1px solid ${sel ? TOKENS.chromeLine : 'transparent'}`,
                borderLeft: `1px solid ${sel ? TOKENS.chromeLine : 'transparent'}`,
                borderRight: `1px solid ${sel ? TOKENS.chromeLine : 'transparent'}`,
                marginBottom: sel ? '-1px' : 0,
                fontWeight: sel ? 700 : 400,
                color: TOKENS.textOnLight,
              }}>
              {m.title}
            </button>
          );
        })}

        <div className="flex-1" />
        {extra}
      </div>

      {/* ─── RIBBON: os comandos do separador aberto ─────────────────────── */}
      <div className="flex items-stretch gap-0 px-1 py-1 overflow-x-auto border-b"
        style={{
          background: 'linear-gradient(to bottom, #FDFDFD 0%, #F0F0F0 92%, #E8E8E8 100%)',
          borderColor: TOKENS.chromeLine, minHeight: 62,
        }}>
        <ModoRibbon.Provider value={true}>
          {activo?.items.map((it, i) => renderItem(it, i, nada))}
        </ModoRibbon.Provider>
      </div>
    </div>
  );
}

/** Um comando. Botão de ribbon na barra de topo; linha numa lista. */
export function MenuItem({ icon, label, nota, onClick }: {
  icon?: string; label: ReactNode; nota?: ReactNode; onClick: () => void;
}) {
  const ribbon = useContext(ModoRibbon);

  if (ribbon) {
    return (
      <button onClick={onClick} title={typeof label === 'string' ? label : undefined}
        className="flex flex-col items-center justify-start w-[80px] flex-shrink-0 pt-1.5 pb-1 px-1 gap-1"
        style={{ border: '1px solid transparent' }}
        onMouseEnter={(e) => {
          // Moldura e fundo âmbar, e não uma mancha cinzenta: é o que diz qual
          // dos vinte botões está debaixo do rato.
          e.currentTarget.style.background = TOKENS.hoverGold;
          e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }}>
        {icon !== undefined && <Glyph icon={icon} size={22} tom={corDoIcone(icon)} />}
        {/* QUEBRA NOS ESPACOS, NUNCA DENTRO DE UMA PALAVRA. Com `break-words`
            lia-se "Disponibilida/de" e "Blocos (disponibilid/ade)" — uma palavra
            partida ao meio custa mais a ler do que uma etiqueta cortada. Duas
            linhas no maximo; o nome inteiro fica no `title`, para quem precise. */}
        <span className="text-[10px] leading-[1.15] text-center w-full overflow-hidden"
          style={{
            color: TOKENS.textOnLight,
            wordBreak: 'normal', overflowWrap: 'normal',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>{label}</span>
        {nota}
      </button>
    );
  }

  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[12px] hover:bg-[#DBEAFE]"
      style={{ color: TOKENS.textOnLight }}>
      {icon !== undefined && <Glyph icon={icon} size={14} tom={corDoIcone(icon)} />}
      {label}
      {nota}
    </button>
  );
}

/** A separação entre grupos: uma divisória vertical no ribbon, um traço na lista. */
export function MenuSeparador() {
  const ribbon = useContext(ModoRibbon);
  if (ribbon) {
    return <div className="w-px self-stretch mx-1 flex-shrink-0" style={{ background: TOKENS.chromeLine }} />;
  }
  return <div className="my-1 border-t" style={{ borderColor: TOKENS.lineSoft }} />;
}
