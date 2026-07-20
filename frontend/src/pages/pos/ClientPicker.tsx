import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import TouchKeyboard from './TouchKeyboard';
import { IcoCliente, IcoQuarto, IcoCalendario } from './Icons';

/**
 * QUEM VAI PAGAR — as três respostas possíveis, em três abas.
 *
 *   ENTIDADE — a empresa/pessoa do ficheiro de clientes (leva NIF, leva fatura em nome)
 *   QUARTO   — o hóspede em casa: a conta pode ir para o folio do quarto
 *   EVENTOS  — o casamento, o congresso: a conta vai para o evento, não para quem come
 *
 * Perguntar isto NO FIM, na hora de pagar, é tarde: o cliente já ouviu o total e agora
 * quer fatura com NIF — e a fatura já saiu como Consumidor Final. Um documento fiscal
 * não se corrige: anula-se por nota de crédito e emite-se outro. Por isso este ecrã
 * pode abrir LOGO ao entrar no balcão (parâmetro 9311 do backoffice).
 *
 * SALTAR é sempre possível: a maioria das vendas de balcão é mesmo Consumidor Final, e
 * obrigar a escolher alguém em todas elas parava a fila.
 */

type Aba = 'ENTIDADE' | 'QUARTO' | 'EVENTOS';

export default function ClientPicker({ onPick, onClose, podeSaltar = true,
  abaInicial = 'ENTIDADE', soAba, titulo: tituloProp }: {
  onPick: (escolha: {
    customer_name?: string; company_name?: string; entity?: number; room?: string;
  }) => void;
  onClose: () => void;
  podeSaltar?: boolean;
  /** com que aba abre */
  abaInicial?: Aba;
  /**
   * Trava numa aba só. "Lançar no quarto de…" não tem nada que oferecer o ficheiro de
   * entidades: o que se procura ali é um QUARTO, e mostrar as outras abas era convidar
   * o empregado a escolher a coisa errada com a conta a fechar.
   */
  soAba?: Aba;
  titulo?: string;
}) {
  const [aba, setAba] = useState<Aba>(soAba || abaInicial);
  const [texto, setTexto] = useState('');
  const busca = texto.trim();

  const entidades = useQuery({
    queryKey: ['pos-pick-entidades', busca],
    queryFn: async () => {
      const r = await apiClient.get('pos/marketing/entities/', { params: busca ? { q: busca } : {} });
      return (r.data?.results || r.data || []) as any[];
    },
    enabled: aba === 'ENTIDADE',
  });

  const quartos = useQuery({
    queryKey: ['pos-pick-quartos'],
    queryFn: async () => {
      // A lista de check-ins vem do motor de hóspedes do terminal. Sem hotel ligado
      // devolve vazio — a aba fica lá, honesta, em vez de desaparecer.
      try {
        const r = await apiClient.get('pos/terminal/guests/');
        return (r.data?.results || r.data || []) as any[];
      } catch { return []; }
    },
    enabled: aba === 'QUARTO',
  });

  const eventos = useQuery({
    queryKey: ['pos-pick-eventos'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/events/requests/');
        return (r.data?.results || r.data || []) as any[];
      } catch { return []; }
    },
    enabled: aba === 'EVENTOS',
  });

  // O SERVIDOR nem sempre devolve uma lista: `pos/terminal/guests/` responde com um
  // objeto quando não há hotel ligado. Sem esta garantia, o `.filter` devolvia algo que
  // não é lista e o ecrã rebentava com "filtrar(...).map is not a function" — logo ao
  // tocar no ícone do hóspede.
  const filtrar = (linhas: any, campos: string[]): any[] => {
    const lista: any[] = Array.isArray(linhas) ? linhas
      : Array.isArray(linhas?.results) ? linhas.results : [];
    if (!busca) return lista;
    const t = busca.toLowerCase();
    return lista.filter((l) => campos.some((c) => String(l?.[c] ?? '').toLowerCase().includes(t)));
  };

  const ABAS: { k: Aba; icon: any; titulo: string }[] = [
    { k: 'ENTIDADE', icon: <IcoCliente size={30} />, titulo: 'Entidade' },
    { k: 'QUARTO', icon: <IcoQuarto size={30} />, titulo: 'Quarto' },
    { k: 'EVENTOS', icon: <IcoCalendario size={30} />, titulo: 'Eventos' },
  ];
  const titulo = tituloProp || ABAS.find((a) => a.k === aba)!.titulo;
  // Travado numa aba, as outras nao se desenham — nao ha para onde enganar-se.
  const abasVisiveis = soAba ? ABAS.filter((a) => a.k === soAba) : ABAS;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-6 z-50" onClick={onClose}>
      <div className="w-[1180px] max-w-[96vw] bg-[#1f1f1f] border-2 border-black shadow-2xl flex flex-col
        max-h-[92vh]" onClick={(e) => e.stopPropagation()}>

        {/* ─── cabeçalho com as três abas ─── */}
        <div className="h-[70px] flex items-stretch bg-[#3a3a3a] flex-shrink-0">
          <div className="flex-1 flex items-center justify-center">
            <span className="text-white text-[24px] font-bold">{titulo}</span>
          </div>
          {abasVisiveis.map((a) => (
            <button key={a.k} onClick={() => { setAba(a.k); setTexto(''); }}
              title={a.titulo}
              className={`w-[180px] flex items-center justify-center border-l border-black
                ${aba === a.k ? 'bg-[#b39100] text-white' : 'bg-[#2b2b2b] text-white/70'}`}>
              {a.icon}
            </button>
          ))}
        </div>

        {/* ─── a lista ─── */}
        <div className="flex-1 overflow-auto pos-arrasta min-h-[220px]">
          {aba === 'ENTIDADE' && (
            <Tabela cols={['Nr.', 'Nr. contrib.', 'Nome', 'Cidade', 'E-mail']}
              vazio={entidades.isLoading ? 'A procurar…' : 'Sem entidades. Escreva para procurar.'}
              linhas={filtrar(entidades.data || [], ['name', 'tax_id', 'city', 'email'])
                .map((e: any) => ({
                  chave: e.id,
                  cels: [e.number ?? e.id, e.tax_id || '—', e.name, e.city || '—', e.email || '—'],
                  escolher: () => onPick({ entity: e.id, customer_name: e.name }),
                }))} />
          )}
          {aba === 'QUARTO' && (
            <Tabela cols={['Quarto', 'Conta', 'Hóspede', 'Check-Out', 'Package', 'Saldo']}
              vazio={quartos.isLoading ? 'A ler os check-ins…'
                : 'Sem hóspedes em casa (ou sem hotel ligado a este terminal).'}
              linhas={filtrar(quartos.data || [], ['guest', 'room'])
                .map((g: any, i: number) => ({
                  chave: g.id ?? i,
                  // "Package" é o REGIME da reserva (MP, PC, tudo incluído). Vem da tarifa
                  // do tipo de quarto, no PMS — não se inventa aqui.
                  cels: [g.room || '—', g.folio ?? '—', g.guest, g.checkout || '—',
                    g.board || '—', g.balance ?? '0.00'],
                  escolher: () => onPick({
                    customer_name: g.guest, room: g.room,
                    company_name: g.room ? `Quarto ${g.room}` : undefined,
                  }),
                }))} />
          )}
          {aba === 'EVENTOS' && (
            <Tabela cols={['Evento', 'Entidade', 'Datas', 'Total']}
              vazio={eventos.isLoading ? 'A ler os eventos…' : 'Sem eventos abertos.'}
              linhas={filtrar(eventos.data || [], ['name', 'entity_name'])
                .map((ev: any) => ({
                  chave: ev.id,
                  cels: [ev.name || ev.title || `Evento ${ev.id}`, ev.entity_name || '—',
                    [ev.start_date, ev.end_date].filter(Boolean).join(' → ') || '—',
                    ev.total ?? '0.00'],
                  escolher: () => onPick({
                    customer_name: ev.entity_name || ev.name,
                    company_name: ev.name || undefined,
                  }),
                }))} />
          )}
        </div>

        {/* ─── procura com teclado tátil ─── */}
        <div className="p-2 bg-[#1a1a1a] flex-shrink-0">
          <TouchKeyboard valor={texto} setValor={setTexto} onOk={() => { /* a lista filtra sozinha */ }} />
        </div>

        <div className="grid grid-cols-2 gap-2 p-2 bg-black flex-shrink-0">
          {/* CONSUMIDOR FINAL: a venda de balcão normal. Sem este botão, cada café
              obrigava a procurar alguém no ficheiro — e a fila parava. */}
          <button onClick={podeSaltar ? () => onPick({}) : undefined} disabled={!podeSaltar}
            title={podeSaltar ? 'Seguir como Consumidor Final' : 'Este setor exige identificar o cliente'}
            className="h-[64px] bg-[#2b2b2b] rounded text-[#2ecc40] text-[20px] font-bold
              disabled:opacity-25">Consumidor Final</button>
          <button onClick={onClose}
            className="h-[64px] bg-[#2b2b2b] rounded text-[#e02020] text-[20px] font-bold">Fechar</button>
        </div>
      </div>
    </div>
  );
}

function Tabela({ cols, linhas, vazio }: {
  cols: string[];
  linhas: { chave: any; cels: any[]; escolher: () => void }[];
  vazio: string;
}) {
  const grid = { gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` };
  return (
    <>
      <div className="grid bg-[#2b2b2b] text-white text-[15px] font-bold px-3 py-2.5 sticky top-0" style={grid}>
        {cols.map((c) => <span key={c} className="truncate">{c}</span>)}
      </div>
      {linhas.length === 0 && <div className="p-8 text-white/55 text-[15px] text-center">{vazio}</div>}
      {linhas.map((l) => (
        <button key={l.chave} onClick={l.escolher}
          className="w-full grid px-3 py-3 text-white text-[16px] border-b border-black/40
            hover:bg-white/10 text-left" style={grid}>
          {l.cels.map((c, i) => <span key={i} className="truncate">{c ?? '—'}</span>)}
        </button>
      ))}
    </>
  );
}
