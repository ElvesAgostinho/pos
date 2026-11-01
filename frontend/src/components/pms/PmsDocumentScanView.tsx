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

  // A PESQUISA É FEITA PELO SERVIDOR, e não aqui.
  //
  // Antes descarregava-se o cadastro INTEIRO e filtrava-se no browser. Com as
  // sete fichas de uma instalação nova ninguém nota; com as de um hotel ao fim
  // de dois anos são megabytes a cada letra escrita, e quem está na recepção
  // fica à espera com o hóspede à frente. Agora vai o que se escreveu e volta
  // só o que interessa (`?search=`, ver mdm/views.py::CustomerViewSet).
  const q = search.trim();
  const { data } = useQuery({
    queryKey: ['mdm', 'customers', 'docscan', q],
    queryFn: async () => (await apiClient.get('mdm/customers/', { params: { search: q } })).data,
    enabled: q.length >= 2,
  });
  const encontrados: any[] = Array.isArray(data) ? data : data?.results || [];
  const results: any[] = q.length < 2 ? [] : encontrados.slice(0, 20);

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

  const inp = 'border border-[#D0D5DD] px-1.5 py-[2px]';

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex-1 overflow-auto p-2 space-y-2 text-[11.5px]">
        <label className="flex flex-col max-w-[400px]">Procurar hóspede (nome, e-mail, nº documento)
          <input value={search} onChange={(e) => setSearch(e.target.value)} className={inp} placeholder="Escreva pelo menos 2 letras…" />
        </label>
        {results.length > 0 && !selected && (
          <div className="border border-[#C8C8C8] max-w-[400px] max-h-[180px] overflow-auto bg-white">
            {results.map((c: any) => (
              <button key={c.id} onClick={() => pick(c)} className="w-full text-left px-2 py-[3px] hover:bg-[#FDF4D9] border-b border-[#EDEDED] last:border-b-0">
                {c.name} {c.id_number && <span className="text-gray-500">· {c.id_number}</span>}
              </button>
            ))}
          </div>
        )}

        {selected && (
          <div className="border border-[#C8C8C8] p-2 max-w-[500px] space-y-2">
            <div className="flex items-center justify-between">
              <div className="font-bold text-[#111827]">{selected.name}</div>
              <button onClick={() => { setSelected(null); setSearch(''); }} className="text-[#6B7280] underline">trocar hóspede</button>
            </div>
            <div className="w-full h-40 bg-[#EEF1F5] border border-[#E6E8EC] flex items-center justify-center overflow-hidden">
              {selected.photo_url ? <img src={selected.photo_url} alt="documento" className="max-w-full max-h-full object-contain" /> : <span className="text-gray-400">Sem foto de documento</span>}
            </div>
            <label className="inline-flex items-center gap-1.5 px-2 h-[22px] border border-[#D0D5DD] bg-white text-[11.5px] cursor-pointer hover:bg-[#FDF4D9]">
              {uploading ? 'A carregar…' : 'Carregar foto do documento…'}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => upload(e.target.files?.[0])} />
            </label>
            <div className="flex gap-2">
              <label className="flex-1 flex flex-col">Tipo de documento<input value={docType} onChange={(e) => setDocType(e.target.value)} className={inp} placeholder="BI / Passaporte" /></label>
              <label className="flex-1 flex flex-col">Nº documento<input value={docNumber} onChange={(e) => setDocNumber(e.target.value)} className={inp} /></label>
            </div>
          </div>
        )}
        {/* ESTE TEXTO JÁ DIZIA "sem leitor/scanner automático disponível nesta
            instalação" — e era a primeira coisa que se lia ao abrir o ecrã. Lido
            assim, parece que o ecrã está avariado ou por acabar, e ninguém chega
            a experimentar o que ele faz. O ecrã funciona: procura-se o hóspede,
            carrega-se a foto do documento e grava-se o número.
            Uma instrução diz o que FAZER; uma desculpa diz o que falta. */}
        {!selected && (
          <div style={{ color: '#5A5A5A', maxWidth: 520 }}>
            {q.length < 2
              ? 'Escreva pelo menos duas letras do nome, do e-mail ou do número do documento para encontrar o hóspede.'
              : results.length === 0
                ? 'Nenhum hóspede encontrado com esse texto. Experimente parte do nome ou o número do documento.'
                : 'Escolha o hóspede na lista para lhe juntar a foto do documento.'}
            <div className="mt-1" style={{ color: '#8A8A8A' }}>
              Esta instalação não tem leitor automático de documentos ligado; a foto carrega-se à mão.
            </div>
          </div>
        )}
      </div>
      <Toolbar actions={[
        { label: 'Gravar Nº de Documento', icon: '💾', onClick: saveNumber, disabled: !selected },
      ]} />
    </div>
  );
}
