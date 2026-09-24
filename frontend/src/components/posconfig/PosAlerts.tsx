import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { Toolbar, money, Glyph } from './kit';

/**
 * CENTRO DE ALERTAS — o sistema procura os problemas; o dono não tem de os procurar.
 *
 * Ninguém abre o relatório de anulações todos os dias. Ninguém repara que um operador
 * anula cinco vezes mais do que os colegas, ou que o whisky está a ser vendido abaixo
 * do custo desde que o fornecedor subiu o preço. O sistema repara.
 *
 * Cada alerta diz três coisas: O QUE se passa, PORQUE é grave, e O QUE fazer a seguir.
 * Um alerta que não diz o que fazer é ruído — e ruído ensina-se a ignorar.
 */
export default function PosAlerts({ onOpen }: { onOpen?: (s: string) => void }) {
  const { data: d } = useQuery({
    queryKey: ['pos-alerts'],
    queryFn: async () => (await apiClient.get('pos/reports/alerts/')).data,
    refetchInterval: 30000,
  });

  if (!d) return <div className="flex-1 flex items-center justify-center text-[#7FA9B1]">A verificar o sistema…</div>;

  const CORES: Record<string, [string, string, string, string]> = {
    // fundo, borda, texto, etiqueta
    CRITICO: ['#F7FAFA', '#B0392B', '#8C2B1F', 'CRÍTICO'],
    AVISO: ['#F7FAFA', '#CFE3E6', '#062A31', 'AVISO'],
    INFO: ['#F7FAFA', '#CFE3E6', '#062A31', 'INFORMAÇÃO'],
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#F7FAFA]">
      {/* Cabeçalho — o resumo que se lê em três segundos */}
      <div className="flex items-stretch gap-px bg-[#EEF4F5] border-b border-[#CFE3E6]">
        {[
          ['Críticos', d.critical, '#8C2B1F', 'dinheiro a sair, ou a lei a ser quebrada'],
          ['Avisos', d.warning, '#062A31', 'vai custar dinheiro se ninguém mexer'],
          ['Verificações', d.checked, '#062A31', 'regras corridas neste momento'],
        ].map(([label, valor, cor, sub]: any) => (
          <div key={label} className="flex-1 bg-white px-4 py-3">
            <div className="text-[11px] text-[#5C8891] uppercase tracking-wide">{label}</div>
            <div className="text-[28px] font-bold leading-tight" style={{ color: valor ? cor : '#041F24' }}>
              {valor}
            </div>
            <div className="text-[11px] text-[#5C8891]">{sub}</div>
          </div>
        ))}
        <div className="w-[240px] bg-white px-4 py-3 text-right">
          <div className="text-[11px] text-[#5C8891] uppercase tracking-wide">Última verificação</div>
          <div className="text-[14px] font-semibold">{new Date(d.at).toLocaleTimeString('pt-PT')}</div>
          <div className="text-[11px] text-[#5C8891]">atualiza sozinho</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {d.alerts.length === 0 ? (
          <div className="border border-[#CFE3E6] bg-white p-10 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#062A31] text-white flex items-center justify-center font-bold">
              <Glyph icon="✔" size={22} />
            </div>
            <div className="text-[16px] font-bold text-[#062A31] mt-3">Nada a assinalar</div>
            <div className="text-[12px] text-[#5C8891] mt-1">
              As {d.checked} verificações passaram: sem anulações fora do normal, sem contas
              esquecidas, sem margens negativas, sem stock a faltar.
            </div>
          </div>
        ) : (
          <div className="space-y-3 max-w-[1100px]">
            {d.alerts.map((a: any, i: number) => {
              const [bg, borda, txt, etiqueta] = CORES[a.severity] || CORES.INFO;
              return (
                <div key={i} className="border bg-white" style={{ borderColor: borda }}>
                  <div className="flex items-center gap-3 px-3 py-2 border-b"
                    style={{ background: bg, borderColor: borda }}>
                    <span className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[14px] font-bold flex-shrink-0"
                      style={{ background: txt }}>
                      {a.severity === 'CRITICO' ? '!' : a.severity === 'AVISO' ? '▲' : 'i'}
                    </span>
                    <span className="text-[11px] font-bold tracking-wide" style={{ color: txt }}>
                      {etiqueta}
                    </span>
                    <span className="text-[14px] font-bold text-[#041F24]">{a.title}</span>
                    {a.amount && (
                      <span className="ml-auto text-[15px] font-bold" style={{ color: txt }}>
                        {money(a.amount)} Kz
                      </span>
                    )}
                  </div>

                  <div className="p-3 text-[12px] space-y-2">
                    <div className="text-[#041F24]">{a.detail}</div>

                    <div className="flex gap-6">
                      <div className="flex-1">
                        <div className="text-[11px] font-bold text-[#5C8891] uppercase tracking-wide mb-0.5">
                          Porque é que isto importa
                        </div>
                        <div className="text-[#062A31] leading-5">{a.why}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[11px] font-bold text-[#5C8891] uppercase tracking-wide mb-0.5">
                          O que fazer
                        </div>
                        <div className="text-[#062A31] leading-5">{a.action}</div>
                      </div>
                    </div>

                    {a.screen && onOpen && (
                      <button onClick={() => onOpen(a.screen)}
                        className="mt-1 px-4 py-1.5 bg-[#041F24] text-white text-[12px] hover:bg-[#062A31]">
                        Ir tratar disto
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {d.errors?.length > 0 && (
          <div className="mt-4 max-w-[1100px] border border-[#EEF4F5] bg-white p-3 text-[11px] text-[#062A31]">
            <b>Verificações que não correram:</b> {d.errors.join(' · ')}
          </div>
        )}
      </div>

      <Toolbar actions={[]} right={
        <span className="text-[11px] text-[#5C8891]">
          {d.checked} regras: anulações por operador, logins falhados, descontos, contas e caixas
          abertas, impressão, stock negativo, margem negativa, quebras, faturas vencidas e fiscal.
        </span>
      } />
    </div>
  );
}
