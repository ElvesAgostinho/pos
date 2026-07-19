import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import PayPanel from './PayPanel';
import SubcontaBar from './SubcontaBar';
import { aviso, confirmar } from '../../ui/dialogo';
import { IcoCruz, IcoDinheiro, IcoVisto } from './Icons';

/**
 * MOVER ARTIGOS ENTRE CONTAS — serve as duas funções, porque o motor é o mesmo:
 *
 *   FUNÇÕES PARCIAIS — dividir a conta da MESMA mesa em subcontas ("cada um paga o que
 *   comeu"). Sem isto, o empregado faz contas de cabeça no guardanapo.
 *
 *   TRANSFERÊNCIAS — passar artigos (ou a conta toda) para OUTRA mesa. É o grupo que muda
 *   de sítio, ou o prato que foi lançado na mesa errada. Sem isto, anula-se e volta a
 *   lançar-se — e o registo fica a dizer que a cozinha fez o prato duas vezes.
 *
 * Move-se a QUANTIDADE, não a linha: metade da garrafa vai para um lado, metade para o
 * outro. E o que já foi para a cozinha CONTINUA em produção depois de mudar de conta —
 * um prato que está a ser feito não volta ao princípio só porque mudou de papel.
 *
 * A fila de baixo são as SUBCONTAS da mesa. É um carrossel: uma mesa grande pode ter oito
 * subcontas, e não cabem todas no ecrã.
 */

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

export default function MoveLines({ modo, ticket, setor, modoTransfer, onClose }: {
  modo: 'SPLIT' | 'TRANSFER';
  ticket: any;                 // a conta de onde se parte
  setor: any;
  // (Parâmetro 8124) "Transferências de mesas": Total só deixa mudar a conta INTEIRA
  // de mesa — artigo a artigo é para as parciais. Parcial deixa escolher as linhas.
  modoTransfer?: string;
  onClose: () => void;
}) {
  const soTudo = modo === 'TRANSFER' && modoTransfer === 'Total';
  const qc = useQueryClient();
  const [esqId, setEsqId] = useState<number>(ticket.id);
  const [dirId, setDirId] = useState<number | null>(null);
  const [selEsq, setSelEsq] = useState<number[]>([]);
  const [selDir, setSelDir] = useState<number[]>([]);
  const [qtd, setQtd] = useState(1);
  const [aPagar, setAPagar] = useState<any | null>(null);
  const [escolherMesa, setEscolherMesa] = useState(false);

  const contaQ = (id: number | null) => useQuery({
    queryKey: ['ml-ticket', id],
    queryFn: async () => (await apiClient.get(`pos/tickets/${id}/`)).data,
    enabled: !!id,
  });
  const { data: esq } = contaQ(esqId);
  const { data: dir } = contaQ(dirId);

  // As contas abertas — para as subcontas (mesma mesa) e para as transferências (outras mesas).
  const { data: abertas = [] } = useQuery({
    queryKey: ['ml-open'],
    queryFn: async () => {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN' } });
      return ((r.data?.results || r.data || []) as any[]).filter((t) => t.status === 'OPEN');
    },
  });
  const { data: mesas = [] } = useQuery({
    queryKey: ['ml-tables', setor?.id],
    queryFn: async () => {
      // As mesas do setor vêm do servidor — as mesmas da planta do backoffice.
      const r = await apiClient.get('pos/tables/', { params: { sector: setor.id } });
      return (r.data?.results || r.data || []) as any[];
    },
  });

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ['ml-ticket'] });
    await qc.invalidateQueries({ queryKey: ['ml-open'] });
    await qc.invalidateQueries({ queryKey: ['pos-open-tickets'] });
    setSelEsq([]); setSelDir([]);
  };

  const mover = async (paraDireita: boolean, tudo: boolean) => {
    const de = paraDireita ? esq : dir;
    const deId = paraDireita ? esqId : dirId;
    const paraId = paraDireita ? dirId : esqId;
    const seleccao = paraDireita ? selEsq : selDir;
    if (!de || !deId) return;

    // Nas TRANSFERÊNCIAS é preciso saber para onde. Nas parciais, a subconta nasce sozinha.
    if (modo === 'TRANSFER' && !paraId) {
      setEscolherMesa(true);
      return;
    }

    const linhas = (de.lines || []).filter((l: any) => (tudo ? true : seleccao.includes(l.id)));
    if (!linhas.length) return aviso('Escolha os artigos a passar.');

    // (8197) Dividir MUITA quantidade de uma vez merece uma segunda pergunta — em
    // geral é um dedo a mais no teclado, não uma mesa de 40 pessoas.
    try {
      const limite = Number(JSON.parse(localStorage.getItem('pos_cfg') || '{}').split_warn_qty || 10);
      const totalQtd = linhas.reduce((s: number, l: any) =>
        s + (tudo ? Number(l.quantity) : Math.min(qtd, Number(l.quantity))), 0);
      if (limite > 0 && totalQtd > limite
          && !await confirmar(`Vai mover ${totalQtd} unidades de uma vez (aviso a partir de ${limite}).\n\nContinuar?`)) {
        return;
      }
    } catch { /* sem configuração ainda */ }

    try {
      const r = await apiClient.post(`pos/tickets/${deId}/split/`, {
        lines: linhas.map((l: any) => ({
          line: l.id,
          quantity: tudo ? l.quantity : Math.min(qtd, Number(l.quantity)),
        })),
        ...(paraId ? { to: paraId } : {}),
      });
      if (!paraId && paraDireita) setDirId(r.data.target.id);   // subconta acabada de nascer
      await refrescar();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível mover os artigos.');
    }
  };

  // JUNTAR AS CONTAS — o inverso de separar: a conta da direita entra na da esquerda
  // (linhas e pagamentos), e a de origem anula-se. É o `merge` do motor de tickets.
  const juntar = async () => {
    if (!esqId || !dirId) return aviso('Escolha as duas contas a juntar.');
    if (!await confirmar('Juntar a conta da direita à da esquerda?\n\nAs linhas e os pagamentos passam todos; a conta da direita deixa de existir.')) return;
    try {
      await apiClient.post(`pos/tickets/${esqId}/merge/`, { source: dirId });
      setDirId(null);
      await refrescar();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível juntar as contas.');
    }
  };

  // CONTA CONJUNTA — a mesa inteira volta a ser UMA conta: todas as subcontas entram
  // na da esquerda ("afinal paga tudo o senhor"). É o mesmo `merge`, pessoa a pessoa.
  const contaConjunta = async () => {
    if (!esqId) return;
    try {
      const r = await apiClient.get(`pos/tickets/${esqId}/siblings/`);
      const irmas = (r.data || []) as any[];
      if (!irmas.length) return aviso('A mesa já só tem uma conta.');
      if (!await confirmar(`Conta conjunta: juntar ${irmas.length} subconta(s) nesta?\n\nA mesa fica com UMA conta única — paga-se tudo junto.`)) return;
      for (const t of irmas) {
        await apiClient.post(`pos/tickets/${esqId}/merge/`, { source: t.id });
      }
      setDirId(null);
      await refrescar();
    } catch (e: any) {
      aviso(e?.response?.data?.detail || 'Não foi possível juntar a mesa.');
    }
  };

  // ── uma conta (painel) ────────────────────────────────────────────────────
  const Painel = ({ conta, id: _id, setId, sel, setSel, lado }: any) => {
    return (
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-[44px] bg-[#3a3a3a] flex items-center px-3 gap-2">
          <span className="text-white text-[19px] font-bold truncate">
            Mesa no: {conta?.table_label || '—'} ({conta?.lines?.length || 0})
          </span>
          {modo === 'TRANSFER' && lado === 'DIR' && (
            <button onClick={() => setEscolherMesa(true)}
              className="ml-auto h-[38px] px-3 bg-[#0f8b8d] text-white text-[14px] font-bold rounded">
              escolher mesa
            </button>
          )}
        </div>

        <div className="grid grid-cols-[70px_1fr_120px] bg-[#2b2b2b] text-white text-[16px] font-bold px-2 py-2">
          <span>Qtd</span><span>Descrição</span><span className="text-right">Total</span>
        </div>

        <div className="flex-1 bg-[#8a8a8a]/30 overflow-auto border-2 border-[#c9a400]">
          {(conta?.lines || []).map((l: any) => (
            <button key={l.id}
              onClick={() => setSel(sel.includes(l.id)
                ? sel.filter((x: number) => x !== l.id) : [...sel, l.id])}
              className={`w-full grid grid-cols-[70px_1fr_120px] px-2 py-2 text-left text-white
                text-[15px] border-b border-black/20 ${sel.includes(l.id) ? 'bg-[#0f8b8d]' : ''}`}>
              <span>{Number(l.quantity)}</span>
              <span className="truncate">
                {l.description}
                {['FIRED', 'PREPARING', 'READY'].includes(l.kds_status) && (
                  <span className="ml-1 text-[11px] text-[#f0c000]">• na cozinha</span>
                )}
              </span>
              <span className="text-right">{money(l.line_total)}</span>
            </button>
          ))}
          {!conta && (
            <div className="text-white/50 text-center py-10">
              {modo === 'TRANSFER' ? 'Escolha a mesa de destino.' : 'Ainda não há subconta.'}
            </div>
          )}
        </div>

        {/* AS PESSOAS DA MESA — o mesmo carrossel da venda: tocar num número troca a
            subconta (consulta-se qualquer conta da mesa); um número vazio ACRESCENTA
            uma pessoa. Nas PARCIAIS o painel direito, mesmo vazio, mostra as pessoas
            da MESMA mesa — é assim que se escolhe para QUEM vai o artigo. */}
        <SubcontaBar conta={conta}
          mesa={modo === 'SPLIT' ? esq?.table : conta?.table}
          outlet={modo === 'SPLIT' ? esq?.outlet : conta?.outlet}
          onSwitch={(nid) => { setId(nid); setSel([]); }} />

        <div className="h-[52px] bg-[#8a8a8a] flex items-center justify-end px-3">
          <span className="text-white text-[28px] font-bold">{money(conta?.grand_total)}</span>
        </div>
      </div>
    );
  };

  return (
    <Window width={1460} onClose={onClose}
      title={modo === 'SPLIT'
        ? `Funções Parciais: ${esq?.table_label || ''}`
        : 'Transferências'}>
      <div className="flex flex-col" style={{ height: '66vh' }}>

        <div className="flex-1 flex overflow-hidden">
          <Painel conta={esq} id={esqId} setId={setEsqId} sel={selEsq} setSel={setSelEsq} lado="ESQ" />

          <div className="w-[110px] bg-[#1f1f1f] flex flex-col items-center justify-center gap-2 px-2">
            <button onClick={() => mover(true, true)}
              className="w-full h-[52px] bg-[#3a3a3a] text-white text-[20px] rounded" title="Passar tudo">»»</button>
            <button onClick={() => mover(true, false)} disabled={soTudo}
              className="w-full h-[52px] bg-[#3a3a3a] text-white text-[20px] rounded disabled:opacity-30"
              title={soTudo ? 'Transferência apenas TOTAL (parâmetro do backoffice)' : 'Passar o escolhido'}>»</button>
            <button onClick={() => mover(false, false)} disabled={!dirId || soTudo}
              className="w-full h-[52px] bg-[#3a3a3a] text-white text-[20px] rounded disabled:opacity-30" title="Trazer o escolhido">«</button>
            <button onClick={() => mover(false, true)} disabled={!dirId}
              className="w-full h-[52px] bg-[#3a3a3a] text-white text-[20px] rounded disabled:opacity-30" title="Trazer tudo">««</button>
            <button onClick={juntar} disabled={!dirId}
              className="w-full h-[52px] bg-[#0f8b8d] text-white text-[13px] font-bold rounded disabled:opacity-30"
              title="Juntar: a conta da direita entra na da esquerda">Juntar</button>
            {modo === 'SPLIT' && (
              <button onClick={contaConjunta}
                className="w-full h-[52px] bg-[#8a6100] text-white text-[12px] font-bold rounded leading-tight"
                title="Toda a mesa numa só conta — paga-se tudo junto">Conta{'\n'}Conjunta</button>
            )}

            <div className="flex flex-col gap-1 w-full mt-2">
              <button onClick={() => setQtd(qtd + 1)}
                className="h-[46px] bg-white text-black text-[22px] font-bold rounded-full">+</button>
              <div className="h-[36px] bg-black text-white text-[18px] font-bold flex items-center justify-center rounded">
                {qtd}
              </div>
              <button onClick={() => setQtd(Math.max(1, qtd - 1))}
                className="h-[46px] bg-white text-black text-[22px] font-bold rounded-full">−</button>
            </div>
          </div>

          <Painel conta={dir} id={dirId} setId={setDirId} sel={selDir} setSel={setSelDir} lado="DIR" />
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 bg-black">
          <button onClick={onClose}
            className="h-[56px] bg-[#1f1f1f] text-[#2ecc40] text-[26px]"><IcoVisto size={24} /></button>
          <button onClick={onClose}
            className="h-[56px] bg-[#1f1f1f] text-[#e02020] text-[26px]"><IcoCruz size={24} /></button>
        </div>

        {modo === 'SPLIT' && dir && (
          <button onClick={() => setAPagar(dir)}
            className="h-[56px] bg-[#0f8b8d] text-white text-[18px] font-bold">
            <IcoDinheiro size={20} /> Cobrar esta subconta ({money(dir.grand_total)} Kz)
          </button>
        )}
      </div>

      {/* escolher a mesa de destino (transferências) */}
      {escolherMesa && (
        <div className="absolute inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="w-[700px] max-h-[80%] bg-[#2b2b2b] border-4 border-black overflow-hidden flex flex-col">
            <div className="h-[54px] bg-[#0f8b8d] text-white flex items-center justify-center text-[20px] font-bold">
              Mesa de destino
            </div>
            <div className="flex-1 overflow-auto grid grid-cols-4 gap-2 p-3">
              {mesas.map((m: any) => {
                const conta = abertas.find((t: any) => t.table === m.id);
                return (
                  <button key={m.id}
                    onClick={async () => {
                      if (conta) { setDirId(conta.id); setEscolherMesa(false); return; }
                      // Mesa livre: abre-se uma conta nova para receber os artigos.
                      try {
                        const r = await apiClient.post('pos/tickets/', {
                          outlet: m.outlet, table: m.id, guests: 1,
                          guest_type: esq?.guest_type || 'PASSANTE',
                          operator_name: esq?.operator_name || 'Operador',
                        });
                        setDirId(r.data.id);
                        setEscolherMesa(false);
                        refrescar();
                      } catch (e: any) {
                        aviso(e?.response?.data?.detail || 'Não foi possível abrir a conta.');
                      }
                    }}
                    className={`h-[80px] rounded font-bold text-white text-[17px]
                      ${conta ? 'bg-[#8a0f0f]' : 'bg-[#0f8b8d]'}`}>
                    {m.table_number}
                    <span className="block text-[12px] font-normal opacity-80">
                      {conta ? `${money(conta.grand_total)} Kz` : 'livre'}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setEscolherMesa(false)}
              className="h-[56px] bg-[#c0140f] text-white font-bold">Fechar</button>
          </div>
        </div>
      )}

      {aPagar && (
        <PayPanel ticket={aPagar}
          onClose={() => setAPagar(null)}
          onPaid={() => { setAPagar(null); setDirId(null); refrescar(); }} />
      )}
    </Window>
  );
}
