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

  if (!d) return <div className="flex-1 flex items-center justify-center text-[#999]">A verificar o sistema…</div>;

  const CORES: Record<string, [string, string, string, string]> = {
    // fundo, borda, texto, etiqueta
    CRITICO: ['#fdecea', '#d9a5a0', '#8c1d18', 'CRÍTICO'],
    AVISO: ['#fff7e6', '#e0c080', '#8a6100', 'AVISO'],
    INFO: ['#eaf2fb', '#a9c4de', '#1a4f8a', 'INFORMAÇÃO'],
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-[#f0f0f0]">
      {/* Cabeçalho — o resumo que se lê em três segundos */}
      <div className="flex items-stretch gap-px bg-[#d0d0d0] border-b border-[#c0c0c0]">
        {[
          ['Críticos', d.critical, '#8c1d18', 'dinheiro a sair, ou a lei a ser quebrada'],
          ['Avisos', d.warning, '#8a6100', 'vai custar dinheiro se ninguém mexer'],
          ['Verificações', d.checked, '#1a4f8a', 'regras corridas neste momento'],
        ].map(([label, valor, cor, sub]: any) => (
          <div key={label} className="flex-1 bg-white px-4 py-3">
            <div className="text-[11px] text-[#666] uppercase tracking-wide">{label}</div>
            <div className="text-[28px] font-bold leading-tight" style={{ color: valor ? cor : '#333' }}>
              {valor}
            </div>
            <div className="text-[11px] text-[#888]">{sub}</div>
          </div>
        ))}
        <div className="w-[240px] bg-white px-4 py-3 text-right">
          <div className="text-[11px] text-[#666] uppercase tracking-wide">Última verificação</div>
          <div className="text-[14px] font-semibold">{new Date(d.at).toLocaleTimeString('pt-PT')}</div>
          <div className="text-[11px] text-[#888]">atualiza sozinho</div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {d.alerts.length === 0 ? (
          <div className="border border-[#c8c8c8] bg-white p-10 text-center">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#1f7a34] text-white flex items-center justify-center font-bold">
              <Glyph icon="✔" size={22} />
            </div>
            <div className="text-[16px] font-bold text-[#1f7a34] mt-3">Nada a assinalar</div>
            <div className="text-[12px] text-[#666] mt-1">
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
                    <span className="text-[14px] font-bold text-[#222]">{a.title}</span>
                    {a.amount && (
                      <span className="ml-auto text-[15px] font-bold" style={{ color: txt }}>
                        {money(a.amount)} Kz
                      </span>
                    )}
                  </div>

                  <div className="p-3 text-[12px] space-y-2">
                    <div className="text-[#333]">{a.detail}</div>

                    <div className="flex gap-6">
                      <div className="flex-1">
                        <div className="text-[11px] font-bold text-[#666] uppercase tracking-wide mb-0.5">
                          Porque é que isto importa
                        </div>
                        <div className="text-[#555] leading-5">{a.why}</div>
                      </div>
                      <div className="flex-1">
                        <div className="text-[11px] font-bold text-[#666] uppercase tracking-wide mb-0.5">
                          O que fazer
                        </div>
                        <div className="text-[#555] leading-5">{a.action}</div>
                      </div>
                    </div>

                    {a.screen && onOpen && (
                      <button onClick={() => onOpen(a.screen)}
                        className="mt-1 px-4 py-1.5 bg-[#242428] text-white text-[12px] hover:bg-[#18181B]">
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
          <div className="mt-4 max-w-[1100px] border border-[#d0d0d0] bg-white p-3 text-[11px] text-[#8a6100]">
            <b>Verificações que não correram:</b> {d.errors.join(' · ')}
          </div>
        )}
      </div>

      <Toolbar actions={[]} right={
        <span className="text-[11px] text-[#666]">
          {d.checked} regras: anulações por operador, logins falhados, descontos, contas e caixas
          abertas, impressão, stock negativo, margem negativa, quebras, faturas vencidas e fiscal.
        </span>
      } />
    </div>
  );
}
