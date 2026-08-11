import React, { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';
import { AlertTriangle, CheckCircle, RefreshCcw, X } from 'lucide-react';

// Erros AUTOMÁTICOS dos clientes (core/error_reporting.py, backend) — chegam
// aqui sozinhos, sem o cliente ligar. É a caixa de entrada dos bugs.
function tempoRelativo(iso?: string | null) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.round(h / 24);
  return `há ${d} dia(s)`;
}

const ErrorReports: React.FC = () => {
  const [reports, setReports] = useState<any[]>([]);
  const [selected, setSelected] = useState<any | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const res = await axios.get('clm/error-reports/');
      setReports(res.data?.results || res.data || []);
    } catch (err) {
      console.error('Error fetching error reports:', err);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { fetchReports(); }, []);

  const visiveis = reports.filter((r) => showResolved || !r.resolved);

  const marcarResolvido = async (r: any, resolved: boolean) => {
    setSaving(true);
    try {
      await axios.patch(`clm/error-reports/${r.id}/`, { resolved, resolved_note: note || r.resolved_note || '' });
      await fetchReports();
      setSelected((cur: any) => cur && cur.id === r.id ? { ...cur, resolved, resolved_note: note || cur.resolved_note } : cur);
    } catch {
      alert('Erro ao guardar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#f0f0f0] text-black font-sans text-[11px] select-none">
      {/* Top bar */}
      <div className="flex items-center px-2 py-1 bg-[#e0e0e0] border-b border-[#a0a0a0] gap-3">
        <span className="mr-2 text-gray-700 font-bold">Erros Automáticos</span>
        <label className="flex items-center gap-1 text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
          Mostrar resolvidos
        </label>
        <span className="text-gray-400">
          {visiveis.length} {visiveis.length === 1 ? 'erro' : 'erros'} {showResolved ? '' : 'por resolver'}
        </span>
        <button onClick={fetchReports} disabled={loading}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 border border-[#a0a0a0] bg-white hover:bg-[#e8e8e8] disabled:opacity-50">
          <RefreshCcw size={11} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {/* Grid */}
      <div className="flex-1 bg-white overflow-auto border-b border-[#a0a0a0]">
        <table className="w-full text-left border-collapse cursor-default">
          <thead>
            <tr className="bg-gradient-to-b from-[#ffffff] to-[#e0e0e0] border-b border-[#a0a0a0] text-gray-700">
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-32">Quando</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-28">Cliente</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-16 text-center">Nível</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal">Mensagem</th>
              <th className="py-1 px-2 border-r border-[#ccc] font-normal w-24">Versão</th>
              <th className="py-1 px-2 font-normal w-20 text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((r) => (
              <tr key={r.id} onClick={() => { setSelected(r); setNote(r.resolved_note || ''); }}
                className={`border-b border-[#eee] hover:bg-[#cce8ff] ${selected?.id === r.id ? 'bg-[#cce8ff]' : ''} ${!r.resolved ? '' : 'text-gray-400'}`}>
                <td className="py-1 px-2 border-r border-[#eee] whitespace-nowrap" title={r.created_at}>{tempoRelativo(r.created_at)}</td>
                <td className="py-1 px-2 border-r border-[#eee]">{r.client_code || '—'}</td>
                <td className="py-1 px-2 border-r border-[#eee] text-center">
                  <span className={`inline-flex items-center gap-1 font-bold ${r.level === 'ERROR' || r.level === 'CRITICAL' ? 'text-red-600' : 'text-amber-600'}`}>
                    {!r.resolved && <AlertTriangle size={10} />} {r.level}
                  </span>
                </td>
                <td className="py-1 px-2 border-r border-[#eee] truncate max-w-[1px]">{r.message}</td>
                <td className="py-1 px-2 border-r border-[#eee]">{r.app_version || '—'}</td>
                <td className="py-1 px-2 text-center">
                  {r.resolved ? <span className="text-green-600 inline-flex items-center gap-1"><CheckCircle size={11} /> resolvido</span>
                    : <span className="text-gray-400">por resolver</span>}
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && !loading && (
              <tr><td colSpan={6} className="py-8 text-center text-gray-400">
                {showResolved ? 'Nenhum erro registado.' : 'Nenhum erro por resolver — sem novidades é boa notícia.'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Detalhe */}
      {selected && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center">
          <div className="bg-[#f0f0f0] border border-[#a0a0a0] w-[640px] max-h-[80vh] shadow-md flex flex-col">
            <div className="bg-[#333] text-white px-2 py-1 flex justify-between items-center">
              <div className="flex items-center">
                <AlertTriangle size={14} className="mr-2 text-amber-400" />
                <span className="font-bold text-[11px]">{selected.client_code} — {selected.level}</span>
              </div>
              <button onClick={() => setSelected(null)} className="hover:text-red-400 font-bold"><X size={14} /></button>
            </div>
            <div className="p-4 bg-[#f0f0f0] flex-1 overflow-y-auto space-y-3 text-[11px] font-sans">
              <div className="bg-white border border-[#a0a0a0] p-3 grid grid-cols-2 gap-2">
                <div><span className="text-gray-500">Quando:</span> {new Date(selected.created_at).toLocaleString('pt-PT')}</div>
                <div><span className="text-gray-500">Máquina:</span> {selected.hostname || '—'}</div>
                <div><span className="text-gray-500">Versão:</span> {selected.app_version || '—'}</div>
                <div><span className="text-gray-500">Instalação:</span> {selected.installation_name || '—'}</div>
                <div className="col-span-2"><span className="text-gray-500">Caminho:</span> {selected.path || '—'}</div>
                <div className="col-span-2"><span className="text-gray-500">Logger:</span> {selected.logger_name || '—'}</div>
              </div>
              <div className="bg-white border border-[#a0a0a0] p-3">
                <div className="font-bold text-gray-700 mb-1">Mensagem</div>
                <div className="text-gray-800">{selected.message}</div>
              </div>
              {selected.traceback && (
                <div className="bg-white border border-[#a0a0a0] p-3">
                  <div className="font-bold text-gray-700 mb-1">Traceback</div>
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all bg-[#1e1e1e] text-[#d4d4d4] p-2 max-h-[240px] overflow-y-auto">{selected.traceback}</pre>
                </div>
              )}
              <div className="bg-white border border-[#a0a0a0] p-3">
                <div className="font-bold text-gray-700 mb-1">Nota de triagem</div>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2}
                  placeholder="Ex.: corrigido em 1.1.0, ou motivo de não avançar"
                  className="w-full border border-[#999] px-2 py-1 text-[11px] font-sans" />
              </div>
            </div>
            <div className="bg-[#e0e0e0] border-t border-[#b0b0b0] p-2 flex justify-end gap-2">
              {selected.resolved ? (
                <button onClick={() => marcarResolvido(selected, false)} disabled={saving}
                  className="flex items-center gap-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white disabled:opacity-50">
                  <span className="font-bold text-gray-700">Reabrir</span>
                </button>
              ) : (
                <button onClick={() => marcarResolvido(selected, true)} disabled={saving}
                  className="flex items-center gap-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white disabled:opacity-50">
                  <CheckCircle size={12} className="text-green-600" />
                  <span className="font-bold text-green-700">{saving ? 'A guardar…' : 'Marcar resolvido'}</span>
                </button>
              )}
              <button onClick={() => setSelected(null)}
                className="flex items-center gap-1 hover:bg-[#d0d0d0] px-3 py-1 rounded border border-[#a0a0a0] bg-white">
                <X size={12} className="text-gray-600" />
                <span className="font-bold">Fechar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorReports;
