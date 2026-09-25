import { useState } from 'react';

/** Gráficos pequenos, à mão (sem biblioteca — mesmo padrão do resto do
    sistema), só com a família azul-petróleo (nunca uma cor por série: aqui
    é sempre UMA série por gráfico, a cor não precisa de distinguir nada). */

const PETROL = '#0B4F5C';
const PETROL_SOFT = 'rgba(11,79,92,0.14)';

export function MiniLineChart({ data, labelKey, valueKey, height = 120, formatValue }: {
  data: any[]; labelKey: string; valueKey: string; height?: number;
  formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const width = 640;
  const padL = 8, padR = 8, padT = 10, padB = 20;
  const values = data.map((d) => Number(d[valueKey]) || 0);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const x = (i: number) => padL + (data.length > 1 ? (i / (data.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => padT + innerH - ((v - min) / range) * innerH;

  if (data.length === 0) return <div className="text-center text-gray-400 py-6 text-[11px]">Sem dados no período.</div>;

  const linePath = values.map((v, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(v)}`).join(' ');
  const areaPath = `${linePath} L ${x(values.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} onMouseLeave={() => setHover(null)}>
      <path d={areaPath} fill={PETROL_SOFT} stroke="none" />
      <path d={linePath} fill="none" stroke={PETROL} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {values.map((v, i) => (
        <g key={i}>
          <rect x={x(i) - innerW / data.length / 2} y={0} width={innerW / data.length} height={height} fill="transparent"
            onMouseEnter={() => setHover(i)} />
          {(hover === i || data.length <= 10) && <circle cx={x(i)} cy={y(v)} r={hover === i ? 3.5 : 2} fill={PETROL} />}
        </g>
      ))}
      {hover != null && (
        <g>
          <line x1={x(hover)} y1={padT} x2={x(hover)} y2={padT + innerH} stroke={PETROL} strokeWidth={1} strokeDasharray="2,2" opacity={0.4} />
          <text x={x(hover)} y={height - 4} textAnchor="middle" fontSize="9" fill="#5C8891">{data[hover][labelKey]}</text>
          <text x={x(hover)} y={y(values[hover]) - 6} textAnchor="middle" fontSize="10" fontWeight="bold" fill="#062A31">
            {formatValue ? formatValue(values[hover]) : values[hover]}
          </text>
        </g>
      )}
    </svg>
  );
}

export function MiniBarChart({ data, labelKey, valueKey, formatValue }: {
  data: { [k: string]: any }[]; labelKey: string; valueKey: string; formatValue?: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  if (data.length === 0) return <div className="text-center text-gray-400 py-6 text-[11px]">Sem dados no período.</div>;
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const v = Number(d[valueKey]) || 0;
        const pct = (v / max) * 100;
        return (
          <div key={i} className="flex items-center gap-2 text-[11px]" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <div className="w-[110px] truncate text-[#5C7A80]" title={d[labelKey]}>{d[labelKey]}</div>
            <div className="flex-1 bg-[#EEF4F5] h-4 relative">
              <div className="h-4" style={{ width: `${pct}%`, background: hover === i ? '#062A31' : PETROL }} />
            </div>
            <div className="w-[80px] text-right font-semibold text-[#062A31]">{formatValue ? formatValue(v) : v}</div>
          </div>
        );
      })}
    </div>
  );
}
