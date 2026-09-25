import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Toolbar } from '../posconfig/kit';
import { apiClient } from '../../api/client';
import { notifyError } from '../../utils/friendlyError';
import { aviso } from '../../ui/dialogo';

/** Leitor de Documentos — sem acesso a hardware de scanner/OCR, este ecrã faz
    o que é possível a sério: tirar/carregar uma FOTO do documento (BI/
    Passaporte) e guardá-la na ficha do hóspede (mdm.Customer.photo_url, já
    existente — nenhum modelo novo). Preenche também o nº de documento se o
    operador o escrever à mão, tal como o resto do sistema já faz. */
export default function PmsDocumentScanView() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any>(null);
  const [docNumber, setDocNumber] = useState('');
  const [docType, setDocType] = useState('');
  const [uploading, setUploading] = useState(false);

  const { data } = useQuery({
    queryKey: ['mdm', 'customers', 'docscan'],
    queryFn: async () => (await apiClient.get('mdm/customers/')).data,
  });
  const all: any[] = Array.isArray(data) ? data : data?.results || [];
  const q = search.trim().toLowerCase();
  const results: any[] = q.length < 2 ? [] : all.filter((c) =>
    (c.name || '').toLowerCase().includes(q)
    || (c.id_number || '').toLowerCase().includes(q)
    || (c.email || '').toLowerCase().includes(q),
  ).slice(0, 20);

  const pick = (c: any) => { setSelected(c); setDocNumber(c.id_number || ''); setDocType(c.doc_type || ''); };

  const upload = async (file?: File) => {
    if (!file || !selected) return;
    if (file.size > 3_000_000) { aviso('Imagem demasiado grande (máx. ~3 MB).'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('folder', 'documents');
      const r = await apiClient.post('platform/upload/', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const updated = await apiClient.patch(`mdm/customers/${selected.id}/`, { photo_url: r.data.url });
      setSelected(updated.data);
      qc.invalidateQueries({ queryKey: ['mdm'] });
      aviso('Documento guardado na ficha do hóspede.');
    } catch (e) { notifyError(e); } finally { setUploading(false); }
  };

  const saveNumber = async () => {
    if (!selected) return;
    try {
      const updated = await apiClient.patch(`mdm/customers/${selected.id}/`, { id_number: docNumber, doc_type: docType });
      setSelected(updated.data);
      qc.invalidateQueries({ queryKey: ['mdm'] });
      aviso('Dados do documento gravados.');
    } catch (e) { notifyError(e); }
  };

  const inp = 'border border-[#7FA9B1] p-1';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-3 space-y-3 text-[11px]">
        <label className="flex flex-col max-w-[400px]">Procurar hóspede (nome, e-mail, nº documento)
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inp} placeholder="Escreva pelo menos 2 letras…" />
        </label>
        {results.length > 0 && !selected && (
          <div className="border border-[#7FA9B1] max-w-[400px] max-h-[160px] overflow-auto bg-white">
            {results.map((c: any) => (
              <button key={c.id} onClick={() => pick(c)} className="w-full text-left px-2 py-1.5 hover:bg-[#F7FAFA] border-b border-[#EEF4F5] last:border-b-0">
                {c.name} {c.id_number && <span className="text-gray-500">· {c.id_number}</span>}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="border border-[#CFE3E6] p-3 max-w-[500px] space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-bold text-[#062A31]">{selected.name}</div>
              <button onClick={() => { setSelected(null); setSearch(''); }} className="text-[#5C8891] underline">trocar hóspede</button>
            </div>
            <div className="w-full h-40 bg-[#EEF4F5] border border-[#7FA9B1] flex items-center justify-center overflow-hidden">
              {selected.photo_url ? <img src={selected.photo_url} alt="documento" className="max-w-full max-h-full object-contain" /> : <span className="text-gray-400">Sem foto de documento</span>}
            </div>
            <label className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F7FAFA] border border-[#7FA9B1] shadow-[inset_1px_1px_0_#FFFFFF] text-[11px] cursor-pointer hover:bg-[#EEF4F5]">
              {uploading ? 'A carregar…' : 'Carregar foto do documento…'}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 flex flex-col">Tipo de documento<input value={docType} onChange={(e) => setDocType(e.target.value)} className={inp} placeholder="BI / Passaporte" /></label>
              <label className="flex-1 flex flex-col">Nº documento<input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className={inp} /></label>
            </div>
          </div>
        )}
        {!selected && <div className="text-gray-500">Sem leitor/scanner automático disponível nesta instalação — procure o hóspede e carregue a foto do documento manualmente.</div>}
      </div>
      <Toolbar actions={[
        { label: 'Gravar Nº de Documento', icon: '💾', color: '#062A31', onClick: saveNumber, disabled: !selected },
      ]} />
    </div>
  );
}
