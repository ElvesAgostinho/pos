import { useQuery, useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import { aviso } from '../../ui/dialogo';

/**
 * As janelas pequenas do PAINEL DA ENGRENAGEM.
 *
 * Nenhuma inventa dados: todas leem o que o motor já tem. Uma janela que mostra um número
 * calculado no terminal é uma janela que discorda do fecho de caixa — e quando os dois
 * números não batem, ninguém sabe qual acreditar.
 */

const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

/** MESAS ABERTAS — quem está sentado e com quanto, sem ir ao mapa. */
export function OpenTablesWindow({ onClose, onAbrir }: {
  onClose: () => void; onAbrir?: (ticketId: number) => void;
}) {
  const { data: contas = [], isLoading } = useQuery({
    queryKey: ['pos-open-tickets'],
    queryFn: async () => {
      const r = await apiClient.get('pos/tickets/', { params: { status: 'OPEN,SUSPENDED' } });
      return ((r.data?.results || r.data || []) as any[])
        .filter((t) => t.status === 'OPEN' || t.status === 'SUSPENDED');
    },
    refetchInterval: 8000,
  });

  return (
    <Window title="Mesas Abertas" width={860} onClose={onClose}>
      <div className="max-h-[60vh] overflow-auto pos-arrasta">
        <div className="grid grid-cols-[110px_1fr_130px_120px_120px] bg-[#2b2b2b] text-white
          text-[14px] font-bold px-3 py-2 sticky top-0">
          <span>Mesa</span><span>Conta</span><span>Estado</span>
          <span className="text-right">Clientes</span><span className="text-right">Total</span>
        </div>
        {isLoading && <div className="p-6 text-white/60">A ler as contas…</div>}
        {!isLoading && contas.length === 0 && (
          <div className="p-6 text-white/60">Nenhuma mesa aberta neste momento.</div>
        )}
        {contas.map((t: any) => (
          <button key={t.id} onClick={() => onAbrir?.(t.id)}
            className="w-full grid grid-cols-[110px_1fr_130px_120px_120px] px-3 py-2.5 text-white
              text-[15px] border-b border-black/30 hover:bg-white/10 text-left">
            <span className="font-bold text-[#f0c000]">{t.table_label || 'Balcão'}</span>
            <span className="truncate">{t.ticket_number}{t.customer_name ? ` · ${t.customer_name}` : ''}</span>
            <span className={t.status === 'SUSPENDED' ? 'text-[#f0c000]' : 'text-white/70'}>
              {t.status === 'SUSPENDED' ? 'Suspensa' : 'Aberta'}
            </span>
            <span className="text-right">{t.guests || '—'}</span>
            <span className="text-right font-bold">{money(t.grand_total)}</span>
          </button>
        ))}
      </div>
    </Window>
  );
}

/** IMPRESSORAS E APARELHOS — o que está configurado, e um teste que sai mesmo. */
export function HardwareWindow({ outlet, onClose }: { outlet?: number; onClose: () => void }) {
  const { data: aparelhos = [], isLoading } = useQuery({
    queryKey: ['pos-hardware'],
    queryFn: async () => {
      const r = await apiClient.get('pos/config/hardware/');
      return (r.data?.results || r.data || []) as any[];
    },
  });

  // O TESTE entra na MESMA fila que as comandas (PrintJob). Um teste que imprimisse por
  // outro caminho dizia "funciona" e depois a comanda não saía.
  const testar = useMutation({
    mutationFn: (ap: any) => apiClient.post('pos/print-jobs/', {
      job_type: 'RECEIPT', target: ap.name, outlet: outlet ?? null,
      title: `Teste de impressão — ${ap.name}`,
      content: `TESTE DE IMPRESSAO\n${ap.name}\n${new Date().toLocaleString('pt-PT')}\n\nSe leu isto, a impressora responde.\n`,
    }),
    onSuccess: () => aviso('Teste enviado para a fila de impressão.'),
    onError: (e: any) => aviso(e?.response?.data?.detail || 'Não foi possível enviar o teste.'),
  });

  return (
    <Window title="Impressoras e Aparelhos" width={820} onClose={onClose}>
      <div className="max-h-[60vh] overflow-auto pos-arrasta">
        <div className="grid grid-cols-[1fr_150px_1fr_130px] bg-[#2b2b2b] text-white text-[14px] font-bold px-3 py-2">
          <span>Aparelho</span><span>Tipo</span><span>Ligação</span><span className="text-right">Teste</span>
        </div>
        {isLoading && <div className="p-6 text-white/60">A ler os aparelhos…</div>}
        {!isLoading && aparelhos.length === 0 && (
          <div className="p-6 text-white/60">
            Sem aparelhos configurados. Configure em <b>Configuração POS › Hardware</b>.
          </div>
        )}
        {aparelhos.map((a: any) => (
          <div key={a.id} className="grid grid-cols-[1fr_150px_1fr_130px] px-3 py-2.5 text-white
            text-[15px] border-b border-black/30 items-center">
            <span className="truncate">{a.name}</span>
            <span className="text-white/70">{a.device_type_display || a.device_type || '—'}</span>
            <span className="text-white/70 truncate">{a.connection || a.address || a.port || '—'}</span>
            <span className="text-right">
              <button onClick={() => testar.mutate(a)} disabled={testar.isPending}
                className="px-3 py-1.5 bg-[#2b2b2b] rounded text-[13px] hover:bg-[#3a3a3a]">Testar</button>
            </span>
          </div>
        ))}
      </div>
    </Window>
  );
}

/** DETALHE DA CAIXA — a sessão aberta e cada movimento que lá entrou. */
export function CashDetailWindow({ sessao, onClose }: { sessao: any; onClose: () => void }) {
  const { data: s } = useQuery({
    queryKey: ['pos-cash-session', sessao?.id],
    queryFn: async () => (await apiClient.get(`pos/cash-sessions/${sessao.id}/`)).data,
    enabled: !!sessao?.id,
  });
  const movs: any[] = s?.movements || [];

  return (
    <Window title={`Detalhe da Caixa — sessão CX-${sessao?.id}`} width={780} onClose={onClose}>
      <div className="p-3 grid grid-cols-2 gap-2 text-white text-[15px]">
        <Linha k="Operador" v={s?.operator_name || '—'} />
        <Linha k="Ponto de venda" v={s?.outlet_name || '—'} />
        <Linha k="Aberta em" v={s?.opened_at ? new Date(s.opened_at).toLocaleString('pt-PT') : '—'} />
        <Linha k="Fundo de maneio" v={`${money(s?.opening_float)} Kz`} />
        <Linha k="Dinheiro esperado" v={`${money(s?.expected_cash ?? s?.expected_amount)} Kz`} />
        <Linha k="Estado" v={s?.status_display || s?.status || '—'} />
      </div>
      <div className="max-h-[42vh] overflow-auto pos-arrasta border-t border-black/40">
        <div className="grid grid-cols-[160px_1fr_140px] bg-[#2b2b2b] text-white text-[14px] font-bold px-3 py-2">
          <span>Hora</span><span>Movimento</span><span className="text-right">Valor</span>
        </div>
        {movs.length === 0 && <div className="p-5 text-white/60">Sem movimentos registados.</div>}
        {movs.map((m: any, i: number) => (
          <div key={m.id ?? i} className="grid grid-cols-[160px_1fr_140px] px-3 py-2 text-white
            text-[14px] border-b border-black/30">
            <span className="text-white/70">
              {m.created_at ? new Date(m.created_at).toLocaleTimeString('pt-PT') : '—'}
            </span>
            <span className="truncate">{m.description || m.kind_display || m.kind || '—'}</span>
            <span className="text-right">{money(m.amount)}</span>
          </div>
        ))}
      </div>
    </Window>
  );
}

const Linha = ({ k, v }: { k: string; v: any }) => (
  <div className="flex justify-between bg-[#2b2b2b] px-3 py-2 rounded">
    <span className="text-white/60">{k}</span><span className="font-bold">{v}</span>
  </div>
);

/**
 * RESUMO DE VENDAS — corre um relatório REAL do catálogo (o mesmo do backoffice).
 * Não recalcula nada aqui: o terminal e o escritório têm de dizer o mesmo número.
 */
export function SalesSummaryWindow({ onClose }: { onClose: () => void }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pos-resumo-vendas', hoje],
    queryFn: async () => (await apiClient.post('pos/reports/run/', {
      code: 'rec_familia', params: { from: hoje, to: hoje },
    })).data,
  });
  // O motor devolve as colunas como TUPLOS [chave, título, formato?] — o mesmo formato
  // que o backoffice desenha. Ler {value,label} dava uma tabela sem cabeçalhos e sem
  // células: o relatório aparecia vazio como se não houvesse vendas.
  const cols: { key: string; label: string; fmt?: string }[] =
    (data?.columns || []).map((c: any) => Array.isArray(c)
      ? { key: c[0], label: c[1], fmt: c[2] }
      : { key: c.value, label: c.label, fmt: c.format });
  const rows: any[] = data?.rows || [];
  const totais = data?.totals;

  return (
    <Window title={`Resumo de Vendas — ${new Date().toLocaleDateString('pt-PT')}`} width={880} onClose={onClose}>
      <div className="max-h-[62vh] overflow-auto pos-arrasta">
        {isLoading && <div className="p-6 text-white/60">A somar as vendas…</div>}
        {isError && <div className="p-6 text-[#ff8a80]">Não foi possível correr o resumo.</div>}
        {!isLoading && !isError && (
          <>
            <div className="flex bg-[#2b2b2b] text-white text-[14px] font-bold px-3 py-2 sticky top-0">
              {cols.map((c) => (
                <span key={c.key} className={`flex-1 truncate ${c.fmt === 'money' ? 'text-right' : ''}`}>
                  {c.label}
                </span>
              ))}
            </div>
            {rows.length === 0 && <div className="p-6 text-white/60">Ainda não há vendas hoje.</div>}
            {rows.map((r: any, i: number) => (
              <div key={i} className="flex px-3 py-2 text-white text-[15px] border-b border-black/30">
                {cols.map((c) => (
                  <span key={c.key} className={`flex-1 truncate ${c.fmt === 'money' ? 'text-right' : ''}`}>
                    {c.fmt === 'money' ? money(r[c.key]) : (r[c.key] ?? '—')}
                  </span>
                ))}
              </div>
            ))}
            {totais && (
              <div className="flex px-3 py-3 bg-[#2b2b2b] text-white text-[16px] font-bold border-t-2 border-black">
                {cols.map((c, i) => (
                  <span key={c.key} className={`flex-1 truncate ${c.fmt === 'money' ? 'text-right' : ''}`}>
                    {i === 0 ? 'TOTAL' : (c.fmt === 'money' ? money(totais[c.key]) : (totais[c.key] ?? ''))}
                  </span>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Window>
  );
}
