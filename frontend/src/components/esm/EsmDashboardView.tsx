import React from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { useEsmDashboard } from '../../hooks/useEsm';
import { AlertTriangle, RefreshCw, Award } from 'lucide-react';

const scoreColor = (score: number) =>
  score >= 80 ? 'text-green-700' : score >= 50 ? 'text-yellow-600' : 'text-red-600';

const StatCard = ({ title, value, subtitle }: { title: string; value: React.ReactNode; subtitle?: string }) => (
  <div className="bg-[#f0f0f0] border-2 border-white border-b-[#a0a0a0] border-r-[#a0a0a0] p-4 flex flex-col justify-between">
    <div className="mb-2">
      <h3 className="text-xs font-bold text-black mb-1">{title}</h3>
      <div className="text-2xl font-bold text-[#1e3f66]">{value}</div>
    </div>
    {subtitle && <div className="text-[10px] text-gray-600 font-medium">{subtitle}</div>}
  </div>
);

const Panel = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-[#f0f0f0] border-2 border-white border-b-[#a0a0a0] border-r-[#a0a0a0] p-4">
    <h3 className="text-xs font-bold text-black mb-3 border-b border-[#a0a0a0] pb-1">{title}</h3>
    {children}
  </div>
);

export default function EsmDashboardView() {
  const { data, isLoading, refetch, isFetching } = useEsmDashboard();

  return (
    <ClassicWindow title="Dashboard ESM — Gestão de Fornecedores">
      <div className="bg-[#e6e6e6] min-h-full font-sans p-4 overflow-y-auto">
        <div className="flex justify-between items-center mb-4 border-b border-[#a0a0a0] pb-2">
          <div>
            <h1 className="text-lg font-bold text-black">Enterprise Supplier Management</h1>
            <p className="text-xs text-gray-600 mt-1">Visão 360º da base de fornecedores e do seu desempenho.</p>
          </div>
          <ClassicButton icon={RefreshCw} label="Atualizar" onClick={() => refetch()} disabled={isFetching} />
        </div>

        {isLoading ? (
          <div className="text-center text-gray-500 py-10">A carregar indicadores…</div>
        ) : (
          <>
            {/* KPIs principais */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-4">
              <StatCard title="Total" value={data?.total_suppliers ?? 0} subtitle="Fornecedores" />
              <StatCard title="Ativos" value={data?.active ?? 0} subtitle="Em operação" />
              <StatCard title="Em Avaliação" value={data?.evaluation ?? 0} subtitle="Onboarding / QA" />
              <StatCard title="Bloqueados" value={data?.blocked ?? 0} subtitle="Sem transações" />
              <StatCard title="Locais" value={data?.local ?? 0} subtitle="Mercado interno" />
              <StatCard title="Internacionais" value={data?.international ?? 0} subtitle="Importação" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              {/* Top fornecedores por performance */}
              <Panel title="Top Fornecedores (Índice de Desempenho)">
                {(data?.top_suppliers?.length ?? 0) === 0 ? (
                  <div className="text-[11px] text-gray-500 py-4 text-center">Sem dados de desempenho ainda.</div>
                ) : (
                  <div className="space-y-2">
                    {data!.top_suppliers.map((s) => (
                      <div key={s.id} className="flex items-center justify-between bg-white border border-[#c0c0c0] px-2 py-1.5">
                        <div className="flex items-center gap-2 min-w-0">
                          <Award size={14} className="text-[#1e3f66] flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-gray-800 truncate">{s.commercial_name}</div>
                            <div className="text-[10px] text-gray-500">[{s.code}] · Pontualidade {Number(s.punctuality).toFixed(0)}%</div>
                          </div>
                        </div>
                        <div className={`text-lg font-bold ${scoreColor(s.overall_score)}`}>{s.overall_score}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Documentos a expirar */}
              <Panel title={`Certificados / Documentos a Expirar (30 dias)`}>
                {(data?.expired_documents ?? 0) > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-red-700 font-bold mb-2">
                    <AlertTriangle size={13} /> {data!.expired_documents} documento(s) já expirado(s)!
                  </div>
                )}
                {(data?.expiring_documents?.length ?? 0) === 0 ? (
                  <div className="text-[11px] text-gray-500 py-4 text-center">Nada a expirar nos próximos 30 dias.</div>
                ) : (
                  <div className="space-y-1">
                    {data!.expiring_documents.map((d) => (
                      <div key={d.id} className="flex items-center justify-between bg-white border border-[#c0c0c0] px-2 py-1 text-[11px]">
                        <div className="min-w-0">
                          <div className="font-bold text-gray-800 truncate">{d.title}</div>
                          <div className="text-[10px] text-gray-500 truncate">{d.supplier_name} · {d.document_type}</div>
                        </div>
                        <span className="text-yellow-700 font-bold ml-2 flex-shrink-0">{d.expiration_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              {/* Contratos a terminar */}
              <Panel title="Contratos a Terminar (30 dias)">
                {(data?.expiring_contracts?.length ?? 0) === 0 ? (
                  <div className="text-[11px] text-gray-500 py-4 text-center">Nenhum contrato a terminar em breve.</div>
                ) : (
                  <div className="space-y-1">
                    {data!.expiring_contracts.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-white border border-[#c0c0c0] px-2 py-1 text-[11px]">
                        <div className="min-w-0">
                          <div className="font-bold text-gray-800 truncate">{c.reference}</div>
                          <div className="text-[10px] text-gray-500 truncate">{c.supplier_name}</div>
                        </div>
                        <span className="text-yellow-700 font-bold ml-2 flex-shrink-0">{c.end_date}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>
            </div>
          </>
        )}
      </div>
    </ClassicWindow>
  );
}
