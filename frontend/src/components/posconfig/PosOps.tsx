import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, money } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

/**
 * UTILITÁRIOS DO POS — Fecho do Dia, SAF-T, Diagnóstico e Contas Correntes.
 *
 * Todos DO POS. O POS é independente: não abre o Night Audit do hotel nem o SAF-T
 * do PMS. Um restaurante que não tem hotel também fecha o dia e também entrega
 * SAF-T — e não pode ficar refém de um módulo que não comprou.
 */

// ─────────────────────────────────────────────────────────── Fecho do Dia
export function PosDayClose() {
  const qc = useQueryClient();
  const { data: d } = useQuery({
    queryKey: ['posops', 'day-close'],
    queryFn: async () => (await apiClient.get('pos/ops/day-close/')).data,
    refetchInterval: 10000,          // tempo real: o estado dos terminais muda sozinho
  });

  const fechar = useMutation({
    mutationFn: () => apiClient.post('pos/ops/day-close/', {}),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['posops'] });
      notifyGuide({ title: 'Dia fechado', message: r.data.detail });
    },
    onError: notifyError,
  });

  if (!d) return <div className="flex-1 flex items-center justify-center text-[#999]">A carregar…</div>;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="px-4 py-3 bg-[#f7f7f7] border-b border-[#d0d0d0]">
        <div className="flex items-start gap-6">
          <div className="text-[34px]">🌙</div>
          <div>
            <div className="text-[18px] font-bold text-[#333]">Fecho do dia — POS</div>
            <div className="text-[12px] text-[#666] mt-1">
              Fecha os terminais e as caixas do dia de vendas. Não é o Night Audit do hotel:
              este é o do <b>ponto de venda</b>.
            </div>
            <div className="text-[12px] text-[#333] mt-2">
              Vendas de hoje: <b>{d.sales_today.count}</b> conta(s) · <b>{money(d.sales_today.total)} Kz</b>
            </div>
          </div>
          <div className="ml-auto text-right">
            {/* Um botão cinzento e mudo parece avariado. Se está bloqueado, tem de DIZER
                porquê — e o motivo aqui é sempre o mesmo: há contas por cobrar. */}
            <button onClick={() => fechar.mutate()} disabled={!d.can_close || fechar.isPending}
              title={d.blocker || 'Fecha as caixas e o dia de vendas do POS'}
              className="px-6 py-3 bg-[#1f7a34] text-white text-[14px] font-bold disabled:bg-[#b8b8b8] disabled:cursor-not-allowed">
              {fechar.isPending ? 'A fechar…' : d.can_close ? '▶ Fechar o dia' : '🔒 Fechar o dia'}
            </button>
            {d.blocker && (
              <div className="text-[11px] text-[#a01818] mt-2 max-w-[280px] bg-[#fdecea] border border-[#e6b0aa] px-2 py-1">
                {d.blocker}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Terminais */}
        <div className="w-[42%] border-r border-[#e0e0e0] overflow-auto">
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold border-b border-[#d0d0d0]">
            Terminais — Estado
          </div>
          {d.terminals.map((t: any) => (
            <div key={t.id} className="border-b border-[#eee]">
              <div className="px-3 py-2 text-[14px] font-bold text-center"
                style={{ background: t.open ? '#f28b82' : '#b7e08a', color: '#1a1a1a' }}>
                {t.code} — {t.name} ({t.open ? 'Aberto' : 'Fechado'})
              </div>
              <div className="flex justify-between px-3 py-1.5 text-[12px]">
                <span className="text-[#666]">Ponto de venda</span>
                <span>{t.outlet || '—'}</span>
              </div>
            </div>
          ))}
          {d.terminals.length === 0 && (
            <div className="text-center text-[#999] py-8 text-[12px]">Sem terminais.</div>
          )}

          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold border-y border-[#d0d0d0] mt-2">
            Caixas abertas ({d.open_cash_sessions.length})
          </div>
          {d.open_cash_sessions.map((s: any) => (
            <div key={s.id} className="flex justify-between px-3 py-1.5 text-[12px] border-b border-[#eee]">
              <span>{s.outlet} · {s.operator}</span>
              <span className="text-[#666]">fundo {money(s.opening_float)}</span>
            </div>
          ))}
        </div>

        {/* Contas abertas — o que impede o fecho */}
        <div className="flex-1 overflow-auto">
          <div className="px-3 py-1.5 bg-[#e9e9e9] text-[12px] font-bold border-b border-[#d0d0d0]">
            Contas por cobrar ({d.open_tickets.length})
          </div>
          {d.open_tickets.length === 0 ? (
            <div className="text-center text-[#1f7a34] py-10 text-[13px] font-bold">
              ✔ Nada por cobrar. O dia pode fechar.
            </div>
          ) : (
            <>
              <div className="px-3 py-2 text-[11px] text-[#8a6100] bg-[#fff7e6] border-b border-[#e0c080]">
                Fechar o dia com contas abertas é dar comida sem receber. Cobre-as ou anule-as primeiro.
              </div>
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="bg-[#f4f4f4]">
                  {['Conta', 'Onde', 'Operador', 'Total'].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border-b border-[#d0d0d0]">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {d.open_tickets.map((t: any) => (
                    <tr key={t.id} className="border-b border-[#eee]">
                      <td className="px-2 py-1 font-mono">{t.ticket}</td>
                      <td className="px-2 py-1">{t.where}</td>
                      <td className="px-2 py-1">{t.operator}</td>
                      <td className="px-2 py-1 text-right font-bold">{money(t.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── SAF-T do POS
export function PosSaft() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [mes, setMes] = useState<string>(String(new Date().getMonth() + 1));

  const { data: d } = useQuery({
    queryKey: ['posops', 'saft'],
    queryFn: async () => (await apiClient.get('pos/ops/saft/')).data,
  });

  const criar = useMutation({
    mutationFn: async () => {
      const r = await apiClient.post('pos/ops/saft/', { year: ano, month: mes || undefined },
        { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([r.data], { type: 'application/xml' }));
      a.download = `SAFT_POS_${ano}${mes ? String(mes).padStart(2, '0') : ''}.xml`;
      a.click();
      return r;
    },
    onSuccess: () => notifyGuide({
      title: 'Ficheiro criado',
      message: 'O SAF-T do POS foi descarregado. É o que se entrega à AGT.',
    }),
    onError: notifyError,
  });

  return (
    <div className="flex-1 overflow-auto bg-white p-6">
      <div className="flex items-center gap-3 mb-6">
        <span className="w-10 h-10 bg-[#1a73c8] text-white flex items-center justify-center text-[18px] font-black">AGT</span>
        <div>
          <div className="text-[20px] font-bold text-[#666]">Administração Geral Tributária — Ficheiro SAF-T</div>
          <div className="text-[13px] text-[#333] mt-1">Versão do ficheiro: <b>{d?.version || '1.01_01'}</b></div>
        </div>
      </div>

      <div className="max-w-[700px] space-y-3 text-[13px]">
        <div className="flex gap-6">
          <span className="w-[110px] text-[#666] font-semibold">Empresa</span>
          <b>{d?.company || '—'}</b>
        </div>
        <div className="flex gap-6">
          <span className="w-[110px] text-[#666] font-semibold">NIF</span>
          <b>{d?.tax_id || '—'}</b>
        </div>
        <div className="flex gap-6 items-center">
          <span className="w-[110px] text-[#666] font-semibold">Aplicação</span>
          <span className={`${inp} w-[240px] bg-[#f0f0f0]`} style={inputStyle}>POS</span>
        </div>
        <div className="flex gap-6 items-center">
          <span className="w-[110px] text-[#666] font-semibold">Tipo</span>
          <select value={mes ? 'M' : 'A'} onChange={(e) => setMes(e.target.value === 'M' ? String(new Date().getMonth() + 1) : '')}
            className={`${inp} w-[240px]`} style={inputStyle}>
            <option value="M">Mensal</option>
            <option value="A">Anual</option>
          </select>
        </div>
        <div className="flex gap-6 items-center">
          <span className="w-[110px] text-[#666] font-semibold">{mes ? 'Mês' : 'Ano'}</span>
          <div className="flex gap-2">
            {mes && (
              <select value={mes} onChange={(e) => setMes(e.target.value)}
                className={`${inp} w-[150px]`} style={inputStyle}>
                {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho',
                  'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
            )}
            <input type="number" value={ano} onChange={(e) => setAno(Number(e.target.value))}
              className={`${inp} w-[100px]`} style={inputStyle} />
          </div>
        </div>

        <div className="text-[12px] text-[#666] pt-3 border-t border-[#eee]">
          Documentos do POS na base: <b>{d?.documents ?? 0}</b>
          {d?.first && <> · de {d.first} a {d.last}</>}
        </div>

        <button onClick={() => criar.mutate()} disabled={criar.isPending || !d?.documents}
          className="mt-4 px-6 py-3 bg-[#3d8bd6] text-white text-[14px] font-semibold hover:bg-[#2f77bd] disabled:bg-[#b8b8b8]">
          {criar.isPending ? 'A criar…' : '▶ Criar ficheiro'}
        </button>
        {!d?.documents && (
          <div className="text-[11px] text-[#8a6100]">
            Sem documentos do POS no período — um SAF-T vazio não se entrega.
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────── Diagnóstico
export function PosDiagnostics() {
  const { data: d } = useQuery({
    queryKey: ['posops', 'diag'],
    queryFn: async () => (await apiClient.get('pos/ops/diagnostics/')).data,
    refetchInterval: 5000,           // tempo real
  });
  const qc = useQueryClient();

  const reenviar = useMutation({
    mutationFn: () => apiClient.post('pos/print-jobs/retry_failed/', {}),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['posops'] });
      notifyGuide({ title: 'Comandas reenviadas', message: r.data.detail });
    },
    onError: notifyError,
  });

  // ENVIAR OS LOGS AO SUPORTE — o cliente pede assistência com um botão: o retrato
  // do sistema (alertas + auditoria + acessos) segue por e-mail para a empresa de
  // suporte (parâmetro 8510). O SMTP configura-se em Parâmetros › E-mail (SMTP).
  const enviarLogs = useMutation({
    mutationFn: () => {
      const nota = window.prompt('Descreva o problema (vai junto com os logs):') || '';
      return apiClient.post('pos/ops/diagnostics/send-logs/', { note: nota });
    },
    onSuccess: (r: any) => notifyGuide({ title: 'Logs enviados', message: r.data.detail }),
    onError: notifyError,
  });

  if (!d) return <div className="flex-1 flex items-center justify-center text-[#999]">A carregar…</div>;

  const Card = ({ title, ok, children }: any) => (
    <div className="border border-[#d5d5d5] bg-white">
      <div className={`px-3 py-1.5 text-[12px] font-bold ${ok === false
        ? 'bg-[#fdecea] text-[#a01818]' : 'bg-[#dbe7f3] text-[#1a4f8a]'}`}>
        {title}
      </div>
      <div className="p-3 text-[12px] space-y-1">{children}</div>
    </div>
  );
  const L = ({ k, v }: any) => (
    <div className="flex justify-between gap-4">
      <span className="text-[#666]">{k}</span><span className="font-semibold text-right">{v}</span>
    </div>
  );

  return (
    <div className="flex-1 overflow-auto bg-[#f7f7f7] p-4">
      <div className="text-[16px] font-bold text-[#333] mb-3">
        Diagnóstico do POS
        <span className="ml-3 text-[11px] font-normal text-[#666]">
          atualiza sozinho · {new Date(d.server_time).toLocaleTimeString('pt-PT')}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 max-w-[1000px]">
        <Card title="Base de dados" ok={d.database.ok}>
          <L k="Estado" v={d.database.ok ? '● Ligada' : '● SEM LIGAÇÃO'} />
          <L k="Motor" v={d.database.engine} />
          <L k="Resposta" v={`${d.database.ms} ms`} />
        </Card>

        <Card title="Fiscal (AGT)" ok={d.fiscal.certified}>
          <L k="Certificado" v={d.fiscal.certificate || '— NÃO CERTIFICADO —'} />
          <L k="Ambiente" v={d.fiscal.environment} />
          <L k="Documentos emitidos" v={d.fiscal.documents} />
          <L k="Séries ativas" v={d.fiscal.series} />
        </Card>

        <Card title="Impressão / Cozinha" ok={!d.print.failed && !d.print.warning}>
          <L k="Na fila" v={d.print.queued} />
          <L k="Falhadas" v={d.print.failed} />
          {d.print.warning && (
            <div className="text-[11px] text-[#a01818] bg-[#fdecea] border border-[#e6b0aa] px-2 py-1 mt-1">
              {d.print.warning}
            </div>
          )}
          {d.print.failed > 0 && (
            <button onClick={() => reenviar.mutate()}
              className="mt-2 px-3 py-1.5 bg-[#2b2b2b] text-white text-[12px]">
              Reenviar {d.print.failed} comanda(s) falhada(s)
            </button>
          )}
        </Card>

        <Card title="Operação">
          <L k="Terminais ativos" v={d.terminals} />
          <L k="Caixas abertas" v={d.open_cash} />
          <L k="Contas abertas" v={d.open_tickets} />
        </Card>

        <Card title="Licença">
          <div className="flex flex-wrap gap-1">
            {d.license.modules.map((m: string) => (
              <span key={m} className="px-2 py-0.5 bg-[#e8f5e9] text-[#1f7a34] text-[11px] font-semibold">{m}</span>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
