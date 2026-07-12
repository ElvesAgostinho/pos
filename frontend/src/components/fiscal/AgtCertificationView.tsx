import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import { ShieldCheck, ShieldAlert, Stamp, Lock, KeyRound } from 'lucide-react';
import { apiClient } from '../../api/client';

/**
 * ESTADO DA CERTIFICAÇÃO AGT — só de leitura, e é assim de propósito.
 *
 * O certificado da AGT é atribuído ao SOFTWARE (ao fabricante), não ao contribuinte:
 * um só número serve todos os clientes. A chave que assina os documentos é a chave DO
 * PROGRAMA. Se o cliente a pudesse ver ou trocar, poderia assinar faturas fora do
 * sistema — e a certificação deixava de valer. Por isso o número e a chave são
 * instalados pelo fornecedor e NÃO são alteráveis a partir daqui (nem pela API).
 */
export default function AgtCertificationView() {
  const { data } = useQuery({
    queryKey: ['agt-cert'],
    queryFn: async () => (await apiClient.get('fiscal/certification/')).data,
  });
  const certified = data?.certified;

  return (
    <ClassicWindow title="Certificação AGT" icon={<ShieldCheck size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">A certificação pertence ao software (fabricante) — instalada pelo fornecedor, não alterável no sistema do cliente</div>}>
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

        {/* Menção estampada na fatura */}
        <div className="bg-white border border-[#a0a0a0] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#1e3f66] mb-1"><Stamp size={13} /> Menção estampada na fatura</div>
          <div className="font-mono text-[11px] bg-[#f5f5f5] border border-[#e0e0e0] p-2">{data?.mention_preview || '—'}</div>
          <div className="text-[10px] text-gray-500 mt-1">Sai automaticamente no rodapé de cada fatura, no QR Code e no SAF-T.</div>
        </div>

        {/* Motor de assinatura */}
        <div className="bg-white border border-[#a0a0a0] p-3 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-[#1e3f66] mb-2"><KeyRound size={13} /> Motor de assinatura</div>
          <div className="grid grid-cols-2 gap-2">
            <div>Chave de assinatura instalada: <b className={data?.has_keys ? 'text-green-700' : 'text-red-600'}>{data?.has_keys ? 'sim' : 'não'}</b></div>
            <div>Versão da chave: <b>{data?.key_version ?? '—'}</b></div>
            <div>Algoritmo: <b>RSA-SHA1</b> (norma AGT)</div>
            <div>Encadeamento de documentos: <b className="text-green-700">ativo</b></div>
          </div>
        </div>

        {/* Porque é que isto não se edita aqui */}
        <div className="bg-[#eef2f7] border border-[#9aa6b6] p-3 text-[11px] flex items-start gap-2">
          <Lock size={16} className="text-[#25405e] flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[#25405e]">Porque é que não pode alterar isto</div>
            <div className="text-gray-700 mt-1">
              O certificado da AGT é atribuído ao <b>programa</b>, não à empresa: um só número serve todos os
              clientes deste software. A chave que assina as suas faturas é a chave do programa e <b>nunca esteve
              nas suas mãos</b> — nem nas de um funcionário seu. É precisamente isso que dá validade fiscal aos
              seus documentos.
              <br />
              O número e a chave são instalados pelo fornecedor no licenciamento. Se precisar de os atualizar
              (renovação ou rotação de chave), contacte o fornecedor.
            </div>
          </div>
        </div>
      </div>
    </ClassicWindow>
  );
}
