import { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';

/**
 * VERSÕES — o que os clientes veem ao "Sincronizar com o PCC".
 *
 * Publicar aqui uma versão nova (número + link do .exe + o que mudou) é o que faz
 * o Diagnóstico de CADA cliente mostrar "Atualização disponível" na próxima
 * sincronização. A descarga fica automática para o cliente; correr o instalador
 * por cima continua a ser manual — nunca aplicar sozinho em cima de um serviço
 * do Windows a correr.
 */
export default function Versoes() {
  const [releases, setReleases] = useState<any[]>([]);
  const [version, setVersion] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchReleases = async () => {
    try {
      const r = await axios.get('clm/releases/');
      setReleases(r.data?.results || r.data || []);
    } catch (err) {
      console.error('Error fetching releases:', err);
    }
  };
  useEffect(() => { fetchReleases(); }, []);

  const publicar = async () => {
    if (!version.trim() || !downloadUrl.trim()) {
      alert('Indique a versão e o link de descarga do instalador.');
      return;
    }
    setBusy(true);
    try {
      await axios.post('clm/releases/', {
        version: version.trim(), download_url: downloadUrl.trim(), release_notes: notes,
      });
      setVersion(''); setDownloadUrl(''); setNotes('');
      await fetchReleases();
    } catch (err: any) {
      alert(err?.response?.data?.version?.[0] || err?.response?.data?.detail || 'Erro ao publicar.');
    } finally {
      setBusy(false);
    }
  };

  const apagar = async (id: number) => {
    if (!confirm('Apagar esta versão? Deixa de ser a que os clientes veem ao sincronizar.')) return;
    try {
      await axios.delete(`clm/releases/${id}/`);
      await fetchReleases();
    } catch {
      alert('Erro ao apagar.');
    }
  };

  const atual = releases[0]; // ordenado por -created_at no backend

  return (
    <div className="flex-1 flex flex-col h-full bg-[#e6e6e6] text-[12px]">
      <div className="flex items-center px-2 py-1 bg-[#e0e0e0] border-b border-[#a0a0a0]">
        <span className="font-bold text-gray-700">Versões publicadas</span>
      </div>

      <div className="p-4 space-y-4 overflow-auto">
        {atual && (
          <div className="bg-white border border-[#a0a0a0] p-3 max-w-2xl">
            <div className="text-[11px] text-gray-500 mb-1">Versão que os clientes recebem AGORA ao sincronizar:</div>
            <div className="font-bold text-[15px]">v{atual.version}</div>
          </div>
        )}

        <div className="bg-white border border-[#a0a0a0] p-4 max-w-2xl">
          <div className="font-bold mb-3 text-gray-700">Publicar versão nova</div>
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Versão (ex.: 1.1.0)</label>
              <input value={version} onChange={(e) => setVersion(e.target.value)}
                className="w-full border border-[#999] px-2 py-1" placeholder="1.1.0" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Link de descarga do instalador (.exe)</label>
              <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)}
                className="w-full border border-[#999] px-2 py-1" placeholder="https://.../MwanaLodge-Setup-1.1.0.exe" />
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">O que mudou (aparece no aviso do cliente)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full border border-[#999] px-2 py-1" />
            </div>
            <button onClick={publicar} disabled={busy}
              className="px-4 py-1.5 bg-[#2b6cb0] text-white font-bold disabled:opacity-50">
              {busy ? 'A publicar…' : 'Publicar'}
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#a0a0a0] max-w-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-b from-[#ffffff] to-[#e0e0e0] border-b border-[#a0a0a0] text-gray-700">
                <th className="py-1 px-2 border-r border-[#ccc] font-normal">Versão</th>
                <th className="py-1 px-2 border-r border-[#ccc] font-normal">Publicada em</th>
                <th className="py-1 px-2 border-r border-[#ccc] font-normal">Por</th>
                <th className="py-1 px-2 font-normal w-16"></th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr key={r.id} className="border-b border-[#eee] hover:bg-[#f5f5f5]">
                  <td className="py-1 px-2 border-r border-[#eee] font-bold">v{r.version}</td>
                  <td className="py-1 px-2 border-r border-[#eee]">{new Date(r.created_at).toLocaleString('pt-PT')}</td>
                  <td className="py-1 px-2 border-r border-[#eee]">{r.created_by || '—'}</td>
                  <td className="py-1 px-2 text-center">
                    <button onClick={() => apagar(r.id)} className="text-red-600 hover:underline">Apagar</button>
                  </td>
                </tr>
              ))}
              {releases.length === 0 && (
                <tr><td colSpan={4} className="py-4 px-2 text-center text-gray-400">Nenhuma versão publicada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
