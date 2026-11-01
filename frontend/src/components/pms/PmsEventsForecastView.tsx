import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { money } from '../posconfig/kit';

/**
 * PREVISÃO EMS — quanto se espera de eventos, e DE ONDE vem.
 *
 * Dizia só "em Março esperam-se X kwanzas". É um número que não se pode
 * accionar: para decidir onde pôr o esforço comercial é preciso saber se a
 * receita vem de casamentos ou de empresas, e se chega por venda directa ou
 * por uma agência que leva comissão.
 *
 * Os eventos passaram a ter segmento, canal e tipo quando se unificaram com o
 * motor do comercial — a informação já cá estava, só não era mostrada.
 *
 * Conta os eventos cujo estado BLOQUEIA o espaço: são os que a casa já não
 * pode vender a outro, e portanto os únicos em que a receita se pode contar.
 */
const COR = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#5A7A96'];

/** Uma das vistas por eixo (segmento, canal, tipo). */
function PorEixo({ titulo, linhas, total }: { titulo: string; linhas: any[]; total: number }) {
  if (!linhas?.length) return null;
  return (
    <div className="border flex-1 min-w-[240px]" style={{ borderColor: '#C8C8C8' }}>
      <div className="px-2 py-[2px] text-[11px] font-bold border-b"
        style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)', borderColor: '#C8C8C8' }}>
        {titulo}
      </div>
      <div>
        {linhas.map((l, i) => {
          const parte = total > 0 ? (l.revenue / total) * 100 : 0;
          return (
            <div key={l.label} className="px-2 py-[3px] border-b" style={{ borderColor: '#EDEDED' }}>
              <div className="flex items-center gap-2">
                {/* O quadrado de cor ao lado do nome: a cor identifica, o nome
                    diz o quê. Nunca só a cor — numa lista impressa a preto e
                    branco, ou para quem não as distingue, o nome continua lá. */}
                <span className="w-[9px] h-[9px] flex-shrink-0"
                  style={{ background: COR[i % COR.length] }} />
                <span className="flex-1 truncate">{l.label}</span>
                <span className="num font-bold" style={{ color: '#1A1A1A' }}>{money(l.revenue)}</span>
                <span className="w-[42px] text-right" style={{ color: '#6B7280' }}>
                  {parte.toFixed(0)}%
                </span>
              </div>
              <div className="h-[4px] mt-[2px]" style={{ background: '#EFEFEF' }}>
                <div className="h-full" style={{ width: `${parte}%`, background: COR[i % COR.length] }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PmsEventsForecastView() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery({
    queryKey: ['pms', 'events', 'forecast', months],
    queryFn: async () => (await apiClient.get('pms/events/forecast/', { params: { months } })).data,
  });
  const rows: any[] = data?.rows || [];
  const max = Math.max(1, ...rows.map((r) => r.revenue));
  const total = Number(data?.total || 0);

  return (
    <div className="h-full overflow-auto bg-white p-2 text-[11.5px]">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-semibold" style={{ color: '#5A5A5A' }}>Meses a prever:</span>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
          className="border border-[#D0D5DD] px-1.5 py-[2px]">
          {[3, 6, 12].map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
        {!isLoading && (
          <span className="ml-auto" style={{ color: '#5A5A5A' }}>
            Total previsto: <b className="num" style={{ color: '#1A1A1A' }}>{money(total)}</b>
          </span>
        )}
      </div>

      <div className="mb-2" style={{ color: '#6B7280' }}>
        Conta os eventos cujo estado <b>bloqueia o espaço</b> — a casa já não os pode vender a
        outro. Um pedido ainda em opção não entra: seria contar receita que se pode perder.
      </div>

      <div className="border" style={{ borderColor: '#C8C8C8' }}>
        <div className="grid grid-cols-[1fr_140px] font-bold px-2 py-[2px] border-b"
          style={{ background: 'linear-gradient(to bottom, #FDFDFD, #EFEFEF)', borderColor: '#C8C8C8' }}>
          <span>Mês</span><span className="text-right">Receita prevista</span>
        </div>
        {rows.map((r) => (
          <div key={r.label} className="px-2 py-[3px] border-b" style={{ borderColor: '#EDEDED' }}>
            <div className="grid grid-cols-[1fr_140px] items-center">
              <span className="font-semibold" style={{ color: '#1A1A1A' }}>{r.label}</span>
              <span className="text-right font-bold num" style={{ color: '#1A1A1A' }}>{money(r.revenue)}</span>
            </div>
            <div className="h-[4px] mt-[2px]" style={{ background: '#EFEFEF' }}>
              <div className="h-full" style={{ width: `${(r.revenue / max) * 100}%`, background: COR[0] }} />
            </div>
          </div>
        ))}
        {rows.length === 0 && !isLoading && (
          <div className="px-2 py-3 text-center text-gray-400">Sem eventos confirmados no período.</div>
        )}
      </div>

      {/* DE ONDE VEM — os três eixos que decidem onde pôr o esforço comercial.
          "(Sem segmento)" e "(Venda directa)" aparecem por inteiro em vez de
          desaparecerem: um eixo onde metade da receita não está classificada é
          uma coisa que o dono tem de VER, e não de adivinhar por as parcelas
          não somarem o total. */}
      <div className="flex gap-2 mt-2 flex-wrap">
        <PorEixo titulo="Por segmento" linhas={data?.by_segment} total={total} />
        <PorEixo titulo="Por canal" linhas={data?.by_channel} total={total} />
        <PorEixo titulo="Por tipo de evento" linhas={data?.by_type} total={total} />
      </div>
    </div>
  );
}
