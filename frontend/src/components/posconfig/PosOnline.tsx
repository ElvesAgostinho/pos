import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { money, Glyph } from './kit';
import { TOKENS } from '../../config/theme';

/**
 * INFORMAÇÃO ONLINE — o que está a acontecer AGORA.
 *
 * Não é um relatório (esse olha para trás). É o pulso do serviço: quanto já se vendeu
 * hoje, que contas estão abertas e há quanto tempo, que mesas estão ocupadas, e se a
 * cozinha tem comandas paradas. Atualiza-se sozinho.
 */
export default function PosOnline() {
  const { data: d } = useQuery({
    queryKey: ['pos-online'],
    queryFn: async () => (await apiClient.get('pos/reports/online/')).data,
    refetchInterval: 8000,
  });

  if (!d) return <div className="flex-1 flex items-center justify-center text-[#999]">A carregar…</div>;

  const Card = ({ label, value, sub, color }: any) => (
    <div className="bg-white px-4 py-3 flex-1" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.12), inset 0 0 0 1px ' + TOKENS.lineSoft }}>
      <div className="text-[11px] text-[#666] uppercase tracking-wide">{label}</div>
      <div className="text-[26px] font-bold leading-tight" style={{ color: color || '#222' }}>{value}</div>
      {sub && <div className="text-[11px] text-[#888]">{sub}</div>}
    </div>
  );
  const panelStyle = { boxShadow: '0 1px 3px rgba(0,0,0,0.12), inset 0 0 0 1px ' + TOKENS.lineSoft };
  const panelHeader = 'px-3 py-1.5 text-[12px] font-bold border-b';
  const panelHeaderStyle = { background: 'linear-gradient(to bottom, #f7f9fb 0%, #e6eaee 100%)', borderColor: TOKENS.line, color: TOKENS.textOnLight };

  const mesas = d.tables || {};
  const ocupadas = mesas.OCCUPIED || 0;
  const livres = mesas.FREE || 0;

  return (
    <div className="flex-1 overflow-auto bg-[#f0f0f0] p-4">
      <div className="flex items-center mb-3">
        <span className="text-[16px] font-bold text-[#333]">Informação Online</span>
        <span className="ml-3 text-[11px] text-[#666]">
          em tempo real · {new Date(d.now).toLocaleTimeString('pt-PT')}
        </span>
      </div>

      <div className="flex gap-3 mb-3">
        <Card label="Vendas de hoje" value={`${money(d.today.total)} Kz`}
          sub={`${d.today.tickets} conta(s) fechadas`} color="#1f7a34" />
        <Card label="Ticket médio" value={`${money(d.today.avg)} Kz`} />
        <Card label="Contas abertas" value={d.open_tickets.length}
          sub="por cobrar" color={d.open_tickets.length ? '#a01818' : '#222'} />
        <Card label="Mesas ocupadas" value={`${ocupadas}`} sub={`${livres} livre(s)`} />
        <Card label="Cozinha" value={d.kitchen_queue}
          sub="comandas na fila" color={d.kitchen_queue > 5 ? '#a01818' : '#222'} />
        <Card label="Caixas abertas" value={d.open_cash} />
      </div>

      <div className="flex gap-3">
        <div className="flex-1 bg-white" style={panelStyle}>
          <div className={panelHeader} style={panelHeaderStyle}>
            Contas abertas — quem está a ser servido agora
          </div>
          <table className="w-full text-[12px]">
            <thead><tr className="bg-[#f4f4f4]">
              {['Conta', 'Onde', 'Operador', 'Há', 'Total'].map((h) => (
                <th key={h} className="text-left font-normal px-2 py-1 border-b border-[#e0e0e0]">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {d.open_tickets.map((t: any) => (
                <tr key={t.ticket} className="border-b border-[#f0f0f0]">
                  <td className="px-2 py-1 font-mono">{t.ticket}</td>
                  <td className="px-2 py-1">{t.where}</td>
                  <td className="px-2 py-1">{t.operator}</td>
                  <td className="px-2 py-1 flex items-center gap-1" style={{ color: t.minutes > 90 ? '#a01818' : '#666' }}>
                    {t.minutes} min{t.minutes > 90 && <Glyph icon="⚠" size={12} />}
                  </td>
                  <td className="px-2 py-1 text-right font-bold">{money(t.total)}</td>
                </tr>
              ))}
              {d.open_tickets.length === 0 && (
                <tr><td colSpan={5} className="text-center text-[#1f7a34] py-6 font-semibold">
                  <span className="inline-flex items-center gap-1.5"><Glyph icon="✔" size={14} /> Nada por cobrar.</span>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="w-[34%] space-y-3">
          <div className="bg-white" style={panelStyle}>
            <div className={panelHeader} style={panelHeaderStyle}>
              Mais vendidos hoje
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                {d.top_items.map((x: any) => (
                  <tr key={x.name} className="border-b border-[#f0f0f0]">
                    <td className="px-2 py-1">{x.name}</td>
                    <td className="px-2 py-1 text-right text-[#666]">{Number(x.qty)}x</td>
                    <td className="px-2 py-1 text-right font-bold">{money(x.total)}</td>
                  </tr>
                ))}
                {d.top_items.length === 0 && (
                  <tr><td className="text-center text-[#999] py-5">Ainda não se vendeu nada hoje.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-white" style={panelStyle}>
            <div className={panelHeader} style={panelHeaderStyle}>
              Vendas por ponto de venda
            </div>
            <table className="w-full text-[12px]">
              <tbody>
                {d.by_outlet.map((x: any) => (
                  <tr key={x.outlet} className="border-b border-[#f0f0f0]">
                    <td className="px-2 py-1">{x.outlet}</td>
                    <td className="px-2 py-1 text-right text-[#666]">{x.tickets}</td>
                    <td className="px-2 py-1 text-right font-bold">{money(x.total)}</td>
                  </tr>
                ))}
                {d.by_outlet.length === 0 && (
                  <tr><td className="text-center text-[#999] py-5">Sem vendas hoje.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
