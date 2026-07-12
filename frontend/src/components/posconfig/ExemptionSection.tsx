import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import SimpleSection from './SimpleSection';
import { Toolbar, inputStyle } from './kit';

const inp = 'border border-[#8a95a3] px-2 py-1 text-[12px] bg-white';

/**
 * ISENÇÕES DE IVA — o texto legal que sai impresso na fatura e vai no SAF-T.
 *
 * A LISTA VÊ-SE SEMPRE. O que a password tranca é a EDIÇÃO: trocar o texto de uma
 * isenção muda o fundamento legal de todas as faturas que a usam — retroativamente.
 * Consultar não faz mal nenhum; mexer, faz.
 *
 * Em produção, quem nem sequer pode consultar já não chega aqui: a árvore de menus
 * só mostra os centros que o dono autorizou ao perfil.
 */
export default function ExemptionSection() {
  const [unlocked, setUnlocked] = useState(false);
  const [ask, setAsk] = useState(false);
  const [pw, setPw] = useState('');

  const check = useMutation({
    mutationFn: () => apiClient.post('pos/config/exemptions/verify_password/', { password: pw }),
    onSuccess: () => {
      setUnlocked(true); setAsk(false); setPw('');
      notifyGuide({
        title: 'Edição desbloqueada',
        message: 'Pode criar e alterar isenções. Cada alteração fica na auditoria com o seu nome.',
      });
    },
    onError: notifyError,
  });

  const fechar = () => { setAsk(false); setPw(''); };

  const banner = (
    <div className={`flex items-center gap-3 px-3 py-2 text-[12px] border-b ${unlocked
      ? 'bg-[#e8f5e9] border-[#b6d7b9] text-[#1f7a34]'
      : 'bg-[#fff7e6] border-[#e0c080] text-[#8a6100]'}`}>
      <span className="text-[14px]">{unlocked ? '🔓' : '🔒'}</span>
      {unlocked ? (
        <span>Edição <b>desbloqueada</b>. Cada alteração fica na auditoria com o seu nome.</span>
      ) : (
        <>
          <span>
            <b>Só de leitura.</b> O texto de uma isenção é fundamento legal: mudá-lo altera
            todas as faturas que a usam e o que a AGT lê no SAF-T.
          </span>
          <button onClick={() => setAsk(true)}
            className="ml-auto px-3 py-1 bg-[#2b2b2b] text-white text-[12px] hover:bg-[#444]">
            Desbloquear edição
          </button>
        </>
      )}
    </div>
  );

  return (
    <>
      <SimpleSection title="Isenção de IVA" queryKey="exemptions" endpoint="pos/config/exemptions/"
        readOnly={!unlocked} banner={banner}
        columns={[
          { key: 'code', label: 'Código', width: '14%' },
          { key: 'text', label: 'Texto', width: '38%' },
          { key: 'description', label: 'Descrição', width: '40%' },
          { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
        ]}
        fields={[
          { key: 'code', label: 'Código:', required: true, width: 'w-[200px]',
            help: 'M01, M07… — é o que vai no SAF-T.' },
          { key: 'text', label: 'Texto:', required: true, width: 'w-[640px]',
            help: 'O que sai impresso na fatura.' },
          { key: 'description', label: 'Descrição:', type: 'textarea', width: 'w-[640px]',
            help: 'A norma completa (consulta interna).' },
          { key: 'is_active', label: 'Ativo', type: 'checkbox' },
        ]} />

      {ask && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[70]" onClick={fechar}>
          <div className="bg-[#f4f4f4] border border-[#888] w-[560px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-3 py-2 text-white text-[14px] font-bold"
              style={{ background: '#3c3c3c' }}>
              <span>Password</span>
              <button onClick={fechar} className="w-5 h-5 bg-[#c0392b] text-[12px] leading-none">✕</button>
            </div>
            <div className="p-5 bg-white">
              <label className="flex items-center gap-4 text-[13px]">
                <span className="text-[#333]">Password:</span>
                <input type="password" value={pw} autoFocus onChange={(e) => setPw(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pw) check.mutate();
                    if (e.key === 'Escape') fechar();
                  }}
                  className={`${inp} flex-1`} style={inputStyle} />
              </label>
              <div className="text-[11px] text-[#666] mt-3">
                É a <b>sua</b> password — o servidor confirma-a. Serve para provar quem está a mexer
                no texto legal das faturas.
              </div>
            </div>
            <Toolbar actions={[
              { icon: '✔', label: check.isPending ? 'A confirmar…' : 'OK', color: '#1f7a34',
                disabled: !pw, onClick: () => check.mutate() },
              { icon: '✖', label: 'Cancelar', color: '#c0392b', onClick: fechar },
            ]} />
          </div>
        </div>
      )}
    </>
  );
}
