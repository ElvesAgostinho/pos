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
        <div className={`border p-3 flex items-center gap-3 ${certified ? 'bg-[#F7FAFA] border-[#CFE3E6]' : 'bg-[#F7FAFA] border-[#CFE3E6]'}`}>
          {certified ? <ShieldCheck size={28} className="text-[#0B4F5C]" /> : <ShieldAlert size={28} className="text-[#0B4F5C]" />}
          <div className="flex-1">
            <div className={`font-bold text-[13px] ${certified ? 'text-[#06333C]' : 'text-[#06333C]'}`}>{data?.status_label || '—'}</div>
            <div className="text-[11px] text-gray-600">
              {data?.company_name} · NIF {data?.company_nif} · Ambiente: <b>{data?.environment === 'PROD' ? 'Produção' : 'Testes'}</b>
              {certified && <> · Certificado nº <b>{data?.certificate_number}</b></>}
            </div>
          </div>
        </div>

        {/* Menção estampada na fatura */}
        <div className="bg-white border border-[#7FA9B1] p-3">
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-[#5C8891] mb-1"><Stamp size={13} /> Menção estampada na fatura</div>
          <div className="font-mono text-[11px] bg-[#F7FAFA] border border-[#EEF4F5] p-2">{data?.mention_preview || '—'}</div>
          <div className="text-[10px] text-gray-500 mt-1">Sai automaticamente no rodapé de cada fatura, no QR Code e no SAF-T.</div>
        </div>

        {/* Motor de assinatura */}
        <div className="bg-white border border-[#7FA9B1] p-3 text-[11px]">
          <div className="flex items-center gap-1.5 font-bold text-[#5C8891] mb-2"><KeyRound size={13} /> Motor de assinatura</div>
          <div className="grid grid-cols-2 gap-2">
            <div>Chave de assinatura instalada: <b className={data?.has_keys ? 'text-[#0B4F5C]' : 'text-[#8C2B1F]'}>{data?.has_keys ? 'sim' : 'não'}</b></div>
            <div>Versão da chave: <b>{data?.key_version ?? '—'}</b></div>
            <div>Algoritmo: <b>RSA-SHA1</b> (norma AGT)</div>
            <div>Encadeamento de documentos: <b className="text-[#0B4F5C]">ativo</b></div>
          </div>
        </div>

        {/* Porque é que isto não se edita aqui */}
        <div className="bg-[#F7FAFA] border border-[#7FA9B1] p-3 text-[11px] flex items-start gap-2">
          <Lock size={16} className="text-[#0B4F5C] flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-[#0B4F5C]">Porque é que não pode alterar isto</div>
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
