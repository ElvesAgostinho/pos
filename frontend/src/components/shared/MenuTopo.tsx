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
type Modo = 'lista' | 'grande' | 'pequeno';
const ModoRibbon = createContext<Modo>('lista');

/** Está-se a desenhar um ribbon COM GRUPOS? (os separadores soltos somem) */
const ComGrupos = createContext(false);

export function MenuTopo<T>({
  menus, logoUrl, onDesktop, renderItem, extra, grupoDe,
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
  /**
   * A que GRUPO pertence este comando (o nome que aparece por baixo dele no
   * ribbon). Sem isto, o ribbon desenha-se como dantes: uma fila de botões.
   *
   * É uma função e não um campo do item porque o MenuTopo é genérico — serve o
   * PMS e a Configuração POS, que têm formatos de item diferentes. Quem chama
   * é que sabe onde está o nome do grupo.
   */
  grupoDe?: (item: T) => string | undefined;
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
                // O TRAÇO DE ACENTO NO TOPO DO SEPARADOR ABERTO.
                //
                // É a assinatura das aplicações de escritório, e faz um trabalho
                // concreto: numa fila de nove separadores todos cinzentos, o
                // aberto distingue-se só por ser um tom mais claro — pouco, num
                // ecrã de recepção com luz a bater. Dois pixéis de cor resolvem,
                // e é um dos três únicos sítios onde a cor aparece na moldura.
                borderTop: sel ? `2px solid ${TOKENS.accent}`
                               : '1px solid transparent',
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
          background: 'linear-gradient(to bottom, #FCFCFD 0%, #EDEFF2 55%, #DFE3E8 100%)',
          borderColor: '#A8AFB9', minHeight: 82,
          boxShadow: 'inset 0 1px 0 #FFFFFF',
        }}>
        <ComGrupos.Provider value={!!grupoDe}>
          {grupoDe
            ? agrupar(activo?.items || [], grupoDe).map((g, gi, todos) => (
              <Grupo key={`${g.nome}-${gi}`} nome={g.nome} ultimo={gi === todos.length - 1}>
                {/* O PRIMEIRO comando do grupo é o grande. Num grupo de cinco,
                    quatro deles são variações do primeiro — e dar a todos o
                    mesmo peso obriga a ler as cinco legendas de cada vez. */}
                <ModoRibbon.Provider value="grande">
                  {renderItem(g.items[0].item, g.items[0].i, nada)}
                </ModoRibbon.Provider>
                {g.items.length > 1 && (
                  <div className="flex flex-col justify-start min-w-0">
                    <ModoRibbon.Provider value="pequeno">
                      {g.items.slice(1).map((x) => renderItem(x.item, x.i, nada))}
                    </ModoRibbon.Provider>
                  </div>
                )}
              </Grupo>
            ))
            : (
              <ModoRibbon.Provider value="grande">
                {activo?.items.map((it, i) => renderItem(it, i, nada))}
              </ModoRibbon.Provider>
            )}
        </ComGrupos.Provider>
      </div>
    </div>
  );
}

/* ═══════════════════ OS GRUPOS DO RIBBON ═══════════════════
   Um separador com dez comandos seguidos é uma fila de dez ícones iguais: para
   encontrar um é preciso ler as dez legendas, todas as vezes. Com grupos,
   procura-se primeiro o grupo ("Quartos") e só depois o comando — que é como
   se procura em qualquer ERP de gestão, e porque é que todos eles são assim.

   Os grupos são RUNS CONTÍGUOS, e isso é deliberado: o primeiro item com um
   nome novo abre um grupo, e os seguintes com o mesmo nome entram nele. Assim
   a ordem dos comandos não muda ao ganhar grupos — quem já sabia onde estava
   uma coisa continua a encontrá-la no mesmo sítio. Se a mesma palavra voltar
   mais à frente, abre um grupo NOVO em vez de saltar comandos para trás. */

interface ItemComIndice<T> { item: T; i: number }
interface GrupoDeItens<T> { nome: string; items: ItemComIndice<T>[] }

function agrupar<T>(items: T[], grupoDe: (item: T) => string | undefined): GrupoDeItens<T>[] {
  const grupos: GrupoDeItens<T>[] = [];
  items.forEach((item, i) => {
    const nome = grupoDe(item) || '';
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.nome === nome) ultimo.items.push({ item, i });
    else grupos.push({ nome, items: [{ item, i }] });
  });
  return grupos;
}

/** Uma secção do ribbon: os comandos em cima, o nome do grupo por baixo. */
function Grupo({ nome, ultimo, children }: { nome: string; ultimo: boolean; children: ReactNode }) {
  return (
    <div className="flex items-stretch flex-shrink-0">
      <div className="flex flex-col px-1">
        <div className="flex items-start gap-0 flex-1">{children}</div>
        {/* O NOME DO GRUPO, em cinzento e pequeno. Tem de ser discreto: é uma
            legenda, não um comando, e quem já sabe onde está o que quer não
            volta a lê-la. */}
        {nome && (
          <div className="text-center text-[9.5px] pt-[2px] leading-none"
            style={{ color: '#8A8A8A' }}>{nome}</div>
        )}
      </div>
      {/* A DIVISÓRIA entre grupos, que não chega ao fundo: pára acima do nome,
          para os nomes não ficarem dentro de caixas. */}
      {!ultimo && (
        <div className="self-stretch w-px my-[2px] mb-[14px] flex-shrink-0"
          style={{ background: TOKENS.chromeLine }} />
      )}
    </div>
  );
}

/** Um comando. Botão de ribbon na barra de topo; linha numa lista. */
export function MenuItem({ icon, label, nota, onClick }: {
  icon?: string; label: ReactNode; nota?: ReactNode; onClick: () => void;
}) {
  const modo = useContext(ModoRibbon);

  // PEQUENO — uma linha do grupo: ícone de 15px e a legenda à direita. É a
  // forma dos comandos secundários em qualquer ribbon, e serve para o grupo
  // caber em altura em vez de se esticar em largura.
  if (modo === 'pequeno') {
    return (
      <button onClick={onClick} title={typeof label === 'string' ? label : undefined}
        className="flex items-center gap-1.5 h-[23px] px-1.5 text-left min-w-0 max-w-[180px]"
        style={{ border: '1px solid transparent' }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = TOKENS.hoverGold;
          e.currentTarget.style.borderColor = TOKENS.hoverGoldLine;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = 'transparent';
          e.currentTarget.style.borderColor = 'transparent';
        }}>
        {icon !== undefined && (
          <span className="w-[18px] flex-shrink-0 flex items-center justify-center">
            <Glyph icon={icon} size={17} tom={corDoIcone(icon)} />
          </span>
        )}
        <span className="text-[11px] truncate" style={{ color: TOKENS.textOnLight }}>{label}</span>
        {nota}
      </button>
    );
  }

  if (modo === 'grande') {
    return (
      <button onClick={onClick} title={typeof label === 'string' ? label : undefined}
        className="flex flex-col items-center justify-start w-[86px] flex-shrink-0 pt-1.5 pb-1 px-1 gap-1"
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
        {icon !== undefined && <Glyph icon={icon} size={30} tom={corDoIcone(icon)} />}
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
  const modo = useContext(ModoRibbon);
  const comGrupos = useContext(ComGrupos);
  // COM GRUPOS, o separador solto desaparece: os grupos já trazem as suas
  // divisórias, e duas seguidas lêem-se como um grupo vazio pelo meio.
  if (comGrupos) return null;
  if (modo !== 'lista') {
    return <div className="w-px self-stretch mx-1 flex-shrink-0" style={{ background: TOKENS.chromeLine }} />;
  }
  return <div className="my-1 border-t" style={{ borderColor: TOKENS.lineSoft }} />;
}
