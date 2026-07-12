import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import { ShieldCheck, ShieldAlert, KeyRound, Stamp } from 'lucide-react';
import { apiClient } from '../../api/client';

export default function AgtCertificationView() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['agt-cert'], queryFn: async () => (await apiClient.get('fiscal/certification/')).data });
  const [cert, setCert] = useState('');
  const [priv, setPriv] = useState('');
  const [pub, setPub] = useState('');
  const apply = useMutation({
    mutationFn: async () => (await apiClient.post('fiscal/certification/', {
      certificate_number: cert || undefined,
      private_key: priv || undefined, public_key: pub || undefined,
    })).data,
    onSuccess: (r: any) => { alert(r.detail); setCert(''); setPriv(''); setPub(''); qc.invalidateQueries({ queryKey: ['agt-cert'] }); },
    onError: (e: any) => alert(e?.response?.data?.detail || 'Erro'),
  });

  const certified = data?.certified;
  return (
    <ClassicWindow title="Certificação AGT" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">As credenciais são geradas pelo fornecedor (PCC) e aplicadas aqui — o carimbo aparece automaticamente nas faturas</div>}>
      <div className="p-4 space-y-3 max-w-3xl">
        {/* Estado */}
        <div className={`border p-3 flex items-center gap-3 ${certified ? 'bg-[#eafaf0] border-[#8fce9e]' : 'bg-[#fff7e6] border-[#e0c080]'}`}>
          {certified ? <ShieldCheck size={28} className="text-green-700" /> : <ShieldAlert size={28} className="text-amber-700" />}
          <div className="flex-1">
            <div className={`font-bold text-[13px] ${certified ? 'text-green-800' : 'text-amber-800'}`}>{data?.status_label || '—'}</div>
            <div className="text-[11px] text-gray-600">
              {data?.company_name} · NIF {data?.company_nif} · Ambiente: <b>{data?.environment === 'PROD' ? 'Produção' : 'Testes'}</b>
              {certified && <> · Certificado nº <b>{data?.certificate_number}</b></>}
            </div>
          </div>
        </div>

        {/* Pré-visualização da menção (o carimbo na fatura) */}
        <div className="bg-white border border-[#a0a0a0] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1e3f66] mb-1"><Stamp size={13} /> Menção estampada na fatura</div>
          <div className="font-mono text-[11px] bg-[#f5f5f5] border border-[#e0e0e0] p-2">{data?.mention_preview || '—'}</div>
          <div className="text-[10px] text-gray-500 mt-1">Sai automaticamente no rodapé de cada fatura, no QR Code e no SAF-T.</div>
        </div>

        {/* Aplicar credenciais do fornecedor */}
        <div className="bg-white border border-[#a0a0a0] p-3 space-y-2 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-[#1e3f66]"><KeyRound size={13} /> Aplicar credenciais AGT (fornecidas pelo fornecedor)</div>
          <div className="flex items-center gap-2">
            <label className="w-40 text-gray-600">Nº de certificado AGT</label>
            <input value={cert} onChange={(e) => setCert(e.target.value)} placeholder="Ex.: 147/AGT/2026" className="border border-[#a0a0a0] p-1 w-56" />
          </div>
          <div>
            <label className="text-gray-600 block mb-1">Chave privada (PEM)</label>
            <textarea value={priv} onChange={(e) => setPriv(e.target.value)} rows={4} placeholder="-----BEGIN RSA PRIVATE KEY-----" className="border border-[#a0a0a0] p-1 w-full font-mono text-[10px]" />
          </div>
          <div>
            <label className="text-gray-600 block mb-1">Chave pública (PEM)</label>
            <textarea value={pub} onChange={(e) => setPub(e.target.value)} rows={3} placeholder="-----BEGIN PUBLIC KEY-----" className="border border-[#a0a0a0] p-1 w-full font-mono text-[10px]" />
          </div>
          <ClassicButton icon={ShieldCheck} label="Aplicar certificação" onClick={() => apply.mutate()} />
          <div className="text-[10px] text-gray-500">O cliente não gera chaves — recebe-as do fornecedor (PCC → Certificação AGT). As chaves são validadas antes de serem instaladas.</div>
        </div>
      </div>
    </ClassicWindow>
  );
}
