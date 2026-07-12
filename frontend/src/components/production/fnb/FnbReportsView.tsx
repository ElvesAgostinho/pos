import ClassicWindow from '../../ui/ClassicWindow';
import { BarChart3 } from 'lucide-react';
import { useFnbReports } from '../../../hooks/useFnb';

const AOA = (n: any) => new Intl.NumberFormat('pt-AO', { maximumFractionDigits: 0 }).format(Number(n) || 0) + ' Kz';

function Panel({ title, children }: any) {
  return (
    <div className="bg-white border border-[#a0a0a0]">
      <div className="bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-1.5 text-[11px] font-bold text-gray-700">{title}</div>
      <div className="p-2">{children}</div>
    </div>
  );
}
function Row({ cols, tone }: { cols: string[]; tone?: string }) {
  return (
    <div className={`flex justify-between text-[11px] py-0.5 border-b border-[#eee] ${tone || ''}`}>
      {cols.map((c, i) => <span key={i} className={i === 0 ? 'truncate flex-1' : 'text-right w-24'}>{c}</span>)}
    </div>
  );
}

export default function FnbReportsView() {
  const { data: d, isLoading } = useFnbReports();

  return (
    <ClassicWindow
      title="Relatórios de Produção F&B"
      icon={<BarChart3 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Menu engineering · Desperdício · Custo de receitas · Qualidade</div>}
    >
      <div className="p-3 grid grid-cols-2 gap-3">
        {isLoading || !d ? (
          <div className="col-span-2 text-center text-gray-400 py-8 text-[12px]">A carregar…</div>
        ) : (
          <>
            <Panel title="★ Pratos de maior margem">
              {d.high_margin?.length ? d.high_margin.map((x: any, i: number) => (
                <Row key={i} cols={[x.name, `${x.margin}%`]} tone="text-green-700" />
              )) : <div className="text-gray-400 text-[11px] py-2">Sem pratos com artigo/custo ligado.</div>}
            </Panel>

            <Panel title="⚠ Pratos de menor margem">
              {d.low_margin?.length ? d.low_margin.map((x: any, i: number) => (
                <Row key={i} cols={[x.name, `${x.margin}%`]} tone="text-amber-700" />
              )) : <div className="text-gray-400 text-[11px] py-2">Sem dados.</div>}
            </Panel>

            <Panel title={`Desperdício por motivo (mês) — ${AOA(d.waste_month_total)}`}>
              {d.waste_by_reason?.length ? d.waste_by_reason.map((x: any, i: number) => (
                <Row key={i} cols={[`${x.reason_label} (${x.n})`, AOA(x.cost)]} />
              )) : <div className="text-gray-400 text-[11px] py-2">Sem desperdício registado no mês.</div>}
            </Panel>

            <Panel title="Receitas mais caras (custo teórico)">
              {d.top_recipes?.length ? d.top_recipes.map((x: any, i: number) => (
                <Row key={i} cols={[x.name, AOA(x.theoretical_cost)]} />
              )) : <div className="text-gray-400 text-[11px] py-2">Sem receitas.</div>}
            </Panel>

            <Panel title="Qualidade (30 dias)">
              {d.quality?.length ? d.quality.map((x: any, i: number) => (
                <Row key={i} cols={[x.result_label, String(x.n)]} />
              )) : <div className="text-gray-400 text-[11px] py-2">Sem inspeções.</div>}
            </Panel>
          </>
        )}
      </div>
    </ClassicWindow>
  );
}
