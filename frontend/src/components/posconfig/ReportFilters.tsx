import { useState } from 'react';
import { inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-[3px] text-[12px] bg-white';

/**
 * FILTRO AVANÇADO — aplica-se ANTES de abrir o relatório, e a QUALQUER relatório.
 *
 * "De data / A data" responde a uma pergunta só. As perguntas que interessam são
 * outras, e é a estas que este painel responde:
 *
 *   · quem consultou o quê DEPOIS das 22h?        → janela horária (atravessa a meia-noite)
 *   · o que se passou ao fim de semana?           → dias da semana
 *   · só as vendas acima de 50.000                → intervalo de valor
 *   · quanto vendeu cada operador, por mês?       → agrupar e somar
 *   · as 10 maiores                               → ordenar e limitar
 *
 * O filtro corre no SERVIDOR: um mês de auditoria são dezenas de milhares de linhas,
 * e mandá-las todas para o browser bloqueia o terminal a meio do serviço.
 */

const DIAS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

export type Adv = {
  q?: string;
  compare?: string;
  hour_from?: string; hour_to?: string;
  weekdays?: number[];
  value_col?: string; min?: string; max?: string;
  group_by?: string; sort_by?: string; sort_dir?: string;
  limit?: string;
};

export default function ReportFilters({
  adv, setAdv, preset, setPreset, presets, groupOpts, compares = [],
  params = [], values = {}, setValues, armazens = [],
}: {
  adv: Adv; setAdv: (a: Adv) => void;
  preset: string; setPreset: (p: string) => void;
  presets: any[]; groupOpts: any[]; compares?: any[];
  params?: any[]; values?: any; setValues?: (v: any) => void; armazens?: any[];
}) {
  const [aberto, setAberto] = useState(true);
  const dias = adv.weekdays || [];
  const ativos = [
    adv.q && 'texto',
    (adv.hour_from !== undefined && adv.hour_from !== '' && adv.hour_to !== '') && 'horas',
    dias.length && 'dias',
    (adv.min || adv.max) && 'valor',
    adv.compare && 'comparação',
    adv.group_by && 'agrupado',
    adv.limit && 'limite',
  ].filter(Boolean).length;

  const set = (k: keyof Adv, v: any) => setAdv({ ...adv, [k]: v });

  return (
    <div className="border border-[#c8c8c8] bg-white">
      <button onClick={() => setAberto(!aberto)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-[#e4e4e4] border-b border-[#c8c8c8] text-left">
        <span className="text-[12px] font-bold text-[#333]">⚙ Filtro avançado</span>
        {ativos > 0 && (
          <span className="px-2 py-0.5 bg-[#1a73c8] text-white text-[11px] font-semibold">
            {ativos} ativo(s)
          </span>
        )}
        <span className="ml-auto text-[13px] text-[#666]">{aberto ? '−' : '+'}</span>
      </button>

      {aberto && (
        <div className="p-4 space-y-4">
          {/* PARÂMETROS DO RELATÓRIO (as datas e o que mais ele pedir) */}
          {params.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-2 pb-3 border-b border-[#eee]">
              {params.map((x: any) => (
                <div key={x.key} className="flex items-center gap-2">
                  <span className="text-[12px] text-[#333]">{x.label}:</span>
                  {x.type === 'warehouse' ? (
                    <select value={values[x.key] ?? ''}
                      onChange={(e) => setValues?.({ ...values, [x.key]: e.target.value })}
                      className={`${inp} w-[200px]`} style={inputStyle}>
                      <option value="">Todos</option>
                      {armazens.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  ) : (
                    <input
                      type={x.type === 'number' ? 'number' : x.type === 'date' ? 'date' : 'text'}
                      value={values[x.key] ?? ''}
                      disabled={x.type === 'date' && !!preset}
                      onChange={(e) => setValues?.({ ...values, [x.key]: e.target.value })}
                      className={`${inp} w-[160px] disabled:bg-[#f0f0f0] disabled:text-[#999]`}
                      style={inputStyle} />
                  )}
                </div>
              ))}
              {preset && (
                <span className="text-[11px] text-[#8a6100]">
                  As datas estão a ser dadas pelo período rápido.
                </span>
              )}
            </div>
          )}

          {/* PERÍODO RÁPIDO */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[#333] w-[130px]">Período rápido:</span>
            {presets.map((p: any) => (
              <button key={p.value}
                onClick={() => setPreset(preset === p.value ? '' : p.value)}
                className={`px-3 py-1 text-[12px] border ${preset === p.value
                  ? 'bg-[#1a73c8] text-white border-[#1a73c8] font-semibold'
                  : 'bg-white border-[#c0c0c0] hover:bg-[#f0f6ff]'}`}>
                {p.label}
              </button>
            ))}
            {preset && <span className="text-[11px] text-[#666]">(ignora as datas acima)</span>}
          </div>

          {/* COMPARAÇÃO — um número sozinho não diz nada. */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[#333] w-[130px]">Comparar com:</span>
            {compares.map((c: any) => (
              <button key={c.value}
                onClick={() => set('compare', adv.compare === c.value ? '' : c.value)}
                className={`px-3 py-1 text-[12px] border ${adv.compare === c.value
                  ? 'bg-[#5d4037] text-white border-[#5d4037] font-semibold'
                  : 'bg-white border-[#c0c0c0] hover:bg-[#f7f2f0]'}`}>
                {c.label}
              </button>
            ))}
            <span className="text-[11px] text-[#666]">
              "Vendeu 2,4M" não é informação. "2,4M, menos 12% do que na semana passada" é.
            </span>
          </div>

          {/* JANELA HORÁRIA */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[#333] w-[130px]">Só entre as horas:</span>
            <select value={adv.hour_from ?? ''} onChange={(e) => set('hour_from', e.target.value)}
              className={`${inp} w-[90px]`} style={inputStyle}>
              <option value="">—</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
              ))}
            </select>
            <span className="text-[12px]">e</span>
            <select value={adv.hour_to ?? ''} onChange={(e) => set('hour_to', e.target.value)}
              className={`${inp} w-[90px]`} style={inputStyle}>
              <option value="">—</option>
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>{String(h).padStart(2, '0')}:59</option>
              ))}
            </select>
            <span className="text-[11px] text-[#666]">
              Atravessa a meia-noite (22 → 06 é o turno da noite — é aí que as coisas estranhas acontecem).
            </span>
          </div>

          {/* DIAS DA SEMANA */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#333] w-[130px]">Dias da semana:</span>
            {DIAS.map((d, i) => (
              <button key={i}
                onClick={() => set('weekdays', dias.includes(i)
                  ? dias.filter((x) => x !== i) : [...dias, i])}
                className={`w-[46px] py-1 text-[12px] border ${dias.includes(i)
                  ? 'bg-[#1f7a34] text-white border-[#1f7a34] font-semibold'
                  : 'bg-white border-[#c0c0c0] hover:bg-[#f0fff2]'}`}>
                {d}
              </button>
            ))}
            <button onClick={() => set('weekdays', dias.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6])}
              className="ml-2 text-[11px] text-[#1a73c8] hover:underline">
              {dias.length === 7 ? 'nenhum' : 'todos'}
            </button>
          </div>

          {/* VALOR */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#333] w-[130px]">Valor entre:</span>
            <input type="number" value={adv.min ?? ''} onChange={(e) => set('min', e.target.value)}
              placeholder="mínimo" className={`${inp} w-[130px]`} style={inputStyle} />
            <span className="text-[12px]">e</span>
            <input type="number" value={adv.max ?? ''} onChange={(e) => set('max', e.target.value)}
              placeholder="máximo" className={`${inp} w-[130px]`} style={inputStyle} />
            <span className="text-[11px] text-[#666]">na coluna de dinheiro do relatório</span>
          </div>

          {/* TEXTO LIVRE */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#333] w-[130px]">Contém o texto:</span>
            <input value={adv.q ?? ''} onChange={(e) => set('q', e.target.value)}
              placeholder="nome, documento, artigo, IP…"
              className={`${inp} w-[320px]`} style={inputStyle} />
            <span className="text-[11px] text-[#666]">procura em todas as colunas</span>
          </div>

          {/* AGRUPAR / ORDENAR / LIMITAR */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] text-[#333] w-[130px]">Agrupar e somar por:</span>
            <select value={adv.group_by ?? ''} onChange={(e) => set('group_by', e.target.value)}
              className={`${inp} w-[170px]`} style={inputStyle}>
              <option value="">(não agrupar)</option>
              {groupOpts.map((g: any) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>

            <span className="text-[12px] text-[#333] ml-4">Ordenar:</span>
            <select value={adv.sort_dir ?? 'desc'} onChange={(e) => set('sort_dir', e.target.value)}
              className={`${inp} w-[130px]`} style={inputStyle}>
              <option value="desc">Maior primeiro</option>
              <option value="asc">Menor primeiro</option>
            </select>

            <span className="text-[12px] text-[#333] ml-4">Mostrar só:</span>
            <select value={adv.limit ?? ''} onChange={(e) => set('limit', e.target.value)}
              className={`${inp} w-[130px]`} style={inputStyle}>
              <option value="">Todas as linhas</option>
              {[1, 5, 10, 20, 50, 100].map((n) => (
                <option key={n} value={n}>As {n} primeiras</option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-[#eee]">
            <button onClick={() => { setAdv({}); setPreset(''); }}
              className="px-3 py-1 text-[12px] border border-[#c0392b] text-[#c0392b]">
              Limpar filtro
            </button>
            <span className="text-[11px] text-[#666]">
              O filtro corre no servidor — as somas e os totais são os das linhas que sobram.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
