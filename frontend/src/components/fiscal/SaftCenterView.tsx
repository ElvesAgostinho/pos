import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicGrid from '../ui/ClassicGrid';
import { FileCode2, Download, CheckCircle2, XCircle, ShieldCheck, ShieldAlert, History } from 'lucide-react';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';

// Painel com título (janela dentro da janela) — aspeto Windows, não SaaS.
function Panel({ title, children, right }: any) {
  return (
    <div className="bg-white border border-[#9aa6b6]" style={{ boxShadow: 'inset 0 1px 0 #fff, 0 1px 3px rgba(0,0,0,0.12)' }}>
      <div className="px-3 py-1.5 border-b border-[#c0c7d0] flex items-center justify-between text-[12px] font-bold text-[#25405e]"
        style={{ background: 'linear-gradient(to bottom, #f7f9fb, #e4e9ef)' }}>
        <span>{title}</span>{right}
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const btn = 'px-3 py-1.5 text-[11px] font-semibold border border-[#7f8b9b] text-[#2a3543]';
const btnStyle = {
  background: 'linear-gradient(to bottom, #fdfdfd, #eceef1 48%, #dde1e6 52%, #cfd4da)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 1px 2px rgba(0,0,0,0.18)',
};

export default function SaftCenterView() {
  const qc = useQueryClient();
  const today = new Date();
  const [start, setStart] = useState(new Date(today.getFullYear(), 0, 1).toISOString().slice(0, 10));
  const [end, setEnd] = useState(today.toISOString().slice(0, 10));
  const [check, setCheck] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['saft', 'profiles'], queryFn: async () => (await apiClient.get('fiscal/saft/profiles/')).data });
  const { data: hist } = useQuery({
    queryKey: ['saft', 'history'],
    queryFn: async () => { const d = (await apiClient.get('fiscal/saft/history/')).data; return d?.results || d || []; },
  });

  const profiles = data?.profiles || [];
  const f = data?.fiscal;

  const validate = async (key: string) => {
    setBusy(key); setCheck(null);
    try { const r = await apiClient.get(`fiscal/saft/validate/${key}/`, { params: { start, end } }); setCheck({ ...r.data, key }); }
    catch (e) { notifyError(e); } finally { setBusy(null); }
  };
  const exportar = async (key: string) => {
    setBusy(key);
    try {
      const res = await apiClient.get(`fiscal/saft/export/${key}/`, { params: { start, end }, responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `SAFT_${key.toUpperCase()}_${start}_${end}.xml`; a.click(); URL.revokeObjectURL(url);
      qc.invalidateQueries({ queryKey: ['saft', 'history'] });
    } catch (e) { notifyError(e); } finally { setBusy(null); }
  };

  return (
    <ClassicWindow title="Centro SAF-T — Exportações Fiscais" icon={<FileCode2 size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">Motor Fiscal: o PMS/Restauração/POS apenas emitem documentos — toda a lógica fiscal (SAF-T, séries, impostos, validação) vive aqui</div>}>
      <div className="p-4 space-y-3 bg-[#dfe3e8] h-full overflow-auto">

        {/* Estado fiscal */}
        <Panel title="Configuração Fiscal">
          {f ? (
            <div className="flex items-center gap-4 text-[12px]">
              <div className={`flex items-center gap-2 px-3 py-2 border ${f.certified ? 'bg-[#eafaf0] border-[#8fce9e]' : 'bg-[#fff7e6] border-[#e0c080]'}`}>
                {f.certified ? <ShieldCheck size={22} className="text-green-700" /> : <ShieldAlert size={22} className="text-amber-700" />}
                <div>
                  <div className={`font-bold ${f.certified ? 'text-green-800' : 'text-amber-800'}`}>
                    {f.certified ? `Certificado AGT nº ${f.certificate_number}` : 'Não certificado (ambiente de testes)'}
                  </div>
                  <div className="text-[11px] text-gray-600">{f.company_name} · NIF {f.company_nif} · SAF-T v{f.saft_version} · {f.environment === 'PROD' ? 'Produção' : 'Testes'}</div>
                </div>
              </div>
              <div className="flex items-end gap-2">
                <label className="flex flex-col text-[11px] text-gray-600">Período de
                  <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border border-[#a0a0a0] px-2 py-1 bg-white" /></label>
                <label className="flex flex-col text-[11px] text-gray-600">até
                  <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border border-[#a0a0a0] px-2 py-1 bg-white" /></label>
              </div>
            </div>
          ) : <div className="text-gray-400 text-[12px]">A carregar…</div>}
        </Panel>

        {/* Perfis de exportação */}
        <div className="grid grid-cols-2 gap-3">
          {profiles.map((p: any) => (
            <Panel key={p.key} title={p.label}
              right={p.required ? <span className="text-[10px] bg-[#a01818] text-white px-1.5 py-0.5 font-bold">OBRIGATÓRIO AGT</span>
                : <span className="text-[10px] text-gray-500">opcional</span>}>
              <div className="text-[11px] text-gray-700 mb-3 min-h-[32px]">{p.description}</div>
              <div className="flex gap-2">
                <button onClick={() => validate(p.key)} disabled={busy === p.key} className={btn} style={btnStyle}>
                  {busy === p.key ? 'A validar…' : 'Validar XML'}
                </button>
                <button onClick={() => exportar(p.key)} disabled={busy === p.key} className={`${btn} flex items-center gap-1`}
                  style={{ ...btnStyle, background: 'linear-gradient(to bottom, #2f5f92, #1e3f66)', color: '#fff', borderColor: '#16304a' }}>
                  <Download size={12} /> Exportar
                </button>
              </div>
              {check?.key === p.key && (
                <div className={`mt-2 p-2 border text-[11px] ${check.valid ? 'bg-[#eafaf0] border-[#8fce9e]' : 'bg-[#fdeaea] border-[#e0a0a0]'}`}>
                  <div className="flex items-center gap-1.5 font-bold">
                    {check.valid ? <CheckCircle2 size={13} className="text-green-700" /> : <XCircle size={13} className="text-red-700" />}
                    {check.valid ? 'XML válido' : 'XML com problemas'} · {check.elements} elementos · {(check.size_bytes / 1024).toFixed(1)} KB
                  </div>
                  {(check.problems || []).map((pr: string, i: number) => (
                    <div key={i} className={pr.startsWith('Aviso') ? 'text-amber-700' : 'text-red-700'}>• {pr}</div>
                  ))}
                </div>
              )}
            </Panel>
          ))}
        </div>

        {/* Histórico */}
        <Panel title="Histórico de Exportações" right={<span className="text-[11px] font-normal text-gray-500 flex items-center gap-1"><History size={12} />{(hist || []).length} registo(s)</span>}>
          <ClassicGrid rowKey="id" data={hist || []} columns={[
            { header: 'Perfil', accessor: 'profile_label', width: '20%' },
            { header: 'Período', accessor: (r: any) => `${r.start_date} → ${r.end_date}`, width: '20%' },
            { header: 'Ficheiro', accessor: 'filename', width: '26%' },
            { header: 'Tamanho', accessor: (r: any) => `${(r.size_bytes / 1024).toFixed(1)} KB`, width: '9%' },
            { header: 'Válido', accessor: (r: any) => r.is_valid ? <span className="text-green-700 font-bold">✓</span> : <span className="text-red-600 font-bold">✗</span>, width: '7%' },
            { header: 'Impressão digital (SHA-256)', accessor: (r: any) => <span className="font-mono text-[10px]">{(r.sha256 || '').slice(0, 20)}…</span>, width: '18%' },
          ]} />
        </Panel>
      </div>
    </ClassicWindow>
  );
}
