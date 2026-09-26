import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import { Toolbar, inputStyle, Glyph } from './kit';
import { SubFamilyPicker, ItemPicker } from './Pickers';

const inp = 'border border-[#7FA9B1] px-2 py-1 text-[12px] bg-white';
const cell = 'w-full border border-[#EEF4F5] px-1.5 py-1 text-[12px] bg-white';

type Tab = 'user' | 'imp' | 'complex' | 'rate' | 'personal' | 'pos' | 'ems' | 'fnb' | 'memo' | 'sign' | 'comm';
const TABS: [Tab, string][] = [
  ['user', 'Dados do Utilizador'], ['imp', 'Impersonation'], ['complex', 'Complexos'],
  ['rate', 'Secções para Rate Codes'], ['personal', 'Dados Pessoais'], ['pos', 'Dados POS'],
  ['ems', 'Dados EMS'], ['fnb', 'Dados F&B'], ['memo', 'Memo'],
  ['sign', 'Assinatura E-mail'], ['comm', 'Comissões'],
];

function R({ label, children, w = 'w-[110px]' }: any) {
  return (
    <label className="flex items-center gap-3 text-[12px] min-w-0">
      <span className={`${w} flex-shrink-0 text-[#041F24]`}>{label}</span>
      {children}
    </label>
  );
}

/**
 * UTILIZADOR — quem entra no sistema.
 *
 * As PERMISSÕES vêm do GRUPO, não daqui: quando o dono muda o que um perfil pode
 * fazer, muda para toda a gente desse perfil de uma vez. Aqui fica o que é DA PESSOA.
 *
 * A password e o PIN entram, mas NUNCA saem: são guardados em hash e a API não os
 * devolve. Nem o dono os consegue ler.
 */
export default function UserEditor({ row, onClose }: { row: any; onClose: () => void }) {
  const qc = useQueryClient();
  const isNew = !row?.id;
  const [tab, setTab] = useState<Tab>('user');
  const [d, setD] = useState<any>({
    language: 'pt-PT', country: 'Angola', all_complexes: true, all_sectors: true,
    is_active: true, number: 0, commissions: [], sector_ids: [], cash_registers: {}, ...row,
  });
  const [pwModal, setPwModal] = useState<'main' | 'pos' | null>(null);
  const [pw, setPw] = useState('');
  const [picker, setPicker] = useState<'sub' | 'item' | null>(null);

  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'ugroups'], queryFn: async () => (await apiClient.get('pos/config/user-groups/')).data });
  const { data: sectors = [] } = useQuery({ queryKey: ['posc', 'sectors'], queryFn: async () => (await apiClient.get('pos/config/sectors/')).data });
  // (8176 = "Operador") o teclado DESTE utilizador — só tem efeito quando o
  // parâmetro "Configuração de teclado por" está em Operador.
  const { data: keyboards = [] } = useQuery({ queryKey: ['posc', 'keyboards'], queryFn: async () => {
    const r = await apiClient.get('pos/config/keyboards/');
    return (r.data?.results || r.data || []) as any[];
  } });

  const save = useMutation({
    mutationFn: () => isNew
      ? apiClient.post('pos/config/users/', d)
      : apiClient.patch(`pos/config/users/${row.id}/`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['posc'] });
      notifyGuide({ title: 'Utilizador gravado', message: 'As permissões vêm do grupo — não é preciso configurá-las aqui.' });
      onClose();
    },
    onError: notifyError,
  });

  const set = (k: string, v: any) => setD((o: any) => ({ ...o, [k]: v }));
  const comms: any[] = d.commissions || [];
  const setComm = (i: number, k: string, v: any) => set('commissions', comms.map((c, j) => j === i ? { ...c, [k]: v } : c));
  const addComms = (rows: any[], kind: 'sub' | 'item') => {
    set('commissions', [...comms, ...rows.map((t) => ({
      [kind === 'sub' ? 'subfamily' : 'item']: t.id,
      code: t.code, target: t.name,
      commission_type: 'PERCENT', value: 0,
    }))]);
    setPicker(null);
  };
  const applyPw = () => {
    if (pw.length < 4) { notifyGuide({ title: 'Password curta', message: 'Use pelo menos 4 caracteres.' }); return; }
    set(pwModal === 'pos' ? 'pin' : 'password', pw);
    setPw(''); setPwModal(null);
    notifyGuide({
      title: pwModal === 'pos' ? 'PIN do terminal definido' : 'Password definida',
      message: 'Carregue em Gravar para aplicar. É guardada em hash — nem o dono a consegue ler.',
    });
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-white">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#F7FAFA] border-b border-[#EEF4F5]">
        <span className="text-[13px] font-bold text-[#041F24]">{isNew ? 'Novo' : `A editar ${d.first_name || ''} ${d.last_name || ''}`}</span>
        <button onClick={onClose} className="text-[16px] text-[#5C8891] hover:text-black leading-none">×</button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {/* Dados de Login + Atribuir Caixa */}
        <div className="grid grid-cols-[1fr_300px] gap-4 mb-3">
          <fieldset className="px-3 pb-3 pt-1" style={{ border: '1px solid #CFE3E6', borderRadius: '10px', boxShadow: '0 1px 2px rgba(6,42,49,0.06), 0 2px 8px rgba(6,42,49,0.06)' }}>
            <legend className="px-1 text-[12px] font-semibold text-[#041F24]">Dados de Login</legend>
            <div className="grid grid-cols-[1fr_240px] gap-4">
              <div className="space-y-2">
                <R label="Código:">
                  <input value={d.code || ''} disabled={!isNew} onChange={(e) => set('code', e.target.value.toUpperCase())}
                    className={`${inp} flex-1 disabled:bg-[#F7FAFA]`} style={inputStyle} />
                </R>
                <R label="Grupo:">
                  <select value={d.group || ''} onChange={(e) => set('group', Number(e.target.value) || null)} className={`${inp} flex-1`} style={inputStyle}>
                    <option value="">Nenhum</option>
                    {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </R>
                <R label="Bloqueado:">
                  <input type="checkbox" checked={!!d.is_blocked} onChange={(e) => set('is_blocked', e.target.checked)} className="w-4 h-4" />
                </R>
              </div>
              <div className="space-y-2">
                <button onClick={() => setPwModal('main')}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-[#062A31] text-white text-[13px] font-bold">
                  <Glyph icon="🔑" size={14} /> Password
                </button>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!d.must_change_password} onChange={(e) => set('must_change_password', e.target.checked)} className="w-4 h-4" />
                  Deve alterar a password no próximo login
                </label>
                {d.password_changed_at && (
                  <div className="text-[11px] text-[#5C8891]">
                    Última alteração: {new Date(d.password_changed_at).toLocaleString('pt-PT')}
                  </div>
                )}
              </div>
            </div>
          </fieldset>

          <fieldset className="px-3 pb-3 pt-1" style={{ border: '1px solid #CFE3E6', borderRadius: '10px', boxShadow: '0 1px 2px rgba(6,42,49,0.06), 0 2px 8px rgba(6,42,49,0.06)' }}>
            <legend className="px-1 text-[12px] font-semibold text-[#041F24]">Atribuir Caixa</legend>
            {['Caixa', 'IFC'].map((c) => (
              <label key={c} className="flex items-center gap-3 py-1.5 border-b border-[#F7FAFA] text-[12px]">
                <input type="checkbox" checked={!!(d.cash_registers || {})[c]}
                  onChange={(e) => set('cash_registers', { ...(d.cash_registers || {}), [c]: e.target.checked })} className="w-4 h-4" />
                {c}
              </label>
            ))}
            <div className="text-[10px] text-[#5C8891] mt-2">Que caixas este utilizador pode abrir e fechar.</div>
          </fieldset>
        </div>

        {/* Separadores */}
        <div className="flex border-b-2 border-[#062A31] overflow-x-auto">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap border-b-[3px] ${tab === k ? 'border-[#062A31] text-[#062A31] bg-white' : 'border-transparent text-[#5C8891] hover:text-[#062A31]'}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="pt-4">
          {tab === 'user' && (
            <div className="grid grid-cols-2 gap-x-10 gap-y-2">
              <div className="space-y-2">
                <R label="Nr:"><input type="number" value={d.number ?? 0} onChange={(e) => set('number', Number(e.target.value))} className={`${inp} w-[160px]`} style={inputStyle} /></R>
                <R label="Título:"><input value={d.title || ''} onChange={(e) => set('title', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Apelido:"><input value={d.last_name || ''} onChange={(e) => set('last_name', e.target.value)}
                  className={`${inp} flex-1 ${!d.last_name ? 'border-[#B0392B]' : ''}`} style={inputStyle} /></R>
                <R label="Nome:"><input value={d.first_name || ''} onChange={(e) => set('first_name', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Língua:">
                  <select value={d.language} onChange={(e) => set('language', e.target.value)} className={`${inp} flex-1`} style={inputStyle}>
                    <option value="pt-PT">Portuguese (Portugal)</option>
                    <option value="en-US">English</option>
                    <option value="fr-FR">French</option>
                  </select>
                </R>
                <R label="Secção:">
                  <select value={d.section || ''} onChange={(e) => set('section', e.target.value)} className={`${inp} flex-1`} style={inputStyle}>
                    <option value="">—</option>
                    {groups.map((g: any) => <option key={g.id} value={g.name}>{g.name}</option>)}
                  </select>
                </R>
                <R label="Teclado:">
                  <select value={d.keyboard || ''} onChange={(e) => set('keyboard', e.target.value ? Number(e.target.value) : null)}
                    className={`${inp} flex-1`} style={inputStyle}>
                    <option value="">—</option>
                    {keyboards.map((k: any) => <option key={k.id} value={k.id}>{k.name}</option>)}
                  </select>
                </R>
              </div>
              <div className="space-y-2">
                <R label="Data de nasc.:" w="w-[120px]"><input type="date" value={d.birth_date || ''} onChange={(e) => set('birth_date', e.target.value || null)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Marcação Directa:" w="w-[120px]"><input value={d.direct_dial || ''} onChange={(e) => set('direct_dial', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Posição:" w="w-[120px]"><input value={d.position || ''} onChange={(e) => set('position', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="E-Mail:" w="w-[120px]"><input type="email" value={d.email || ''} onChange={(e) => set('email', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Data Entrada:" w="w-[120px]"><input type="date" value={d.entry_date || ''} onChange={(e) => set('entry_date', e.target.value || null)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Data Saída:" w="w-[120px]"><input type="date" value={d.exit_date || ''} onChange={(e) => set('exit_date', e.target.value || null)} className={`${inp} flex-1`} style={inputStyle} /></R>
              </div>
            </div>
          )}

          {tab === 'imp' && (
            <div className="max-w-[700px] space-y-2">
              <R label="Data Access:"><input value={d.imp_data_access || ''} onChange={(e) => set('imp_data_access', e.target.value)} placeholder="(nenhum)" className={`${inp} flex-1`} style={inputStyle} /></R>
              <R label="Reporting:"><input value={d.imp_reporting || ''} onChange={(e) => set('imp_reporting', e.target.value)} placeholder="(nenhum)" className={`${inp} flex-1`} style={inputStyle} /></R>
              <div className="text-[11px] text-[#5C8891] py-2">
                Estas configurações podem levar até 5 minutos a fazer efeito e são válidas apenas no ambiente indicado.
              </div>
              <R label="Servidor SQL:"><input value={d.imp_sql_server || ''} onChange={(e) => set('imp_sql_server', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
              <R label="Base de dados:"><input value={d.imp_database || ''} onChange={(e) => set('imp_database', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
            </div>
          )}

          {tab === 'complex' && (
            <div className="max-w-[700px]">
              <label className="flex items-center gap-3 text-[12px] mb-3">
                <span className="w-[130px] text-[#041F24]">Todos os complexos:</span>
                <input type="checkbox" checked={!!d.all_complexes} onChange={(e) => set('all_complexes', e.target.checked)} className="w-4 h-4" />
              </label>
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="bg-[#F7FAFA]">
                  <th className="w-[40px] border border-[#EEF4F5]" />
                  <th className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">Código</th>
                  <th className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">Descrição</th>
                </tr></thead>
                <tbody>
                  <tr className={d.all_complexes ? 'opacity-40' : ''}>
                    <td className="text-center border border-[#F7FAFA]">
                      <input type="checkbox" disabled={!!d.all_complexes}
                        checked={(d.complexes || []).includes('UNICO')}
                        onChange={(e) => set('complexes', e.target.checked ? ['UNICO'] : [])} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-1.5 border border-[#F7FAFA]">UNICO</td>
                    <td className="px-2 py-1.5 border border-[#F7FAFA]">Único</td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          {tab === 'rate' && (
            <table className="w-full max-w-[700px] text-[12px] border-collapse">
              <thead><tr className="bg-[#F7FAFA]">
                <th className="w-[40px] border border-[#EEF4F5]" />
                <th className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">Código</th>
                <th className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">Nome</th>
              </tr></thead>
              <tbody>
                {['S-A', 'S-B', 'S-C'].map((c, i) => (
                  <tr key={c}>
                    <td className="text-center border border-[#F7FAFA]">
                      <input type="checkbox" checked={(d.rate_sections || []).includes(c)}
                        onChange={(e) => set('rate_sections', e.target.checked
                          ? [...(d.rate_sections || []), c]
                          : (d.rate_sections || []).filter((x: string) => x !== c))} className="w-4 h-4" />
                    </td>
                    <td className="px-2 py-1.5 border border-[#F7FAFA]">{c}</td>
                    <td className="px-2 py-1.5 border border-[#F7FAFA]">Secção {String.fromCharCode(65 + i)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {tab === 'personal' && (
            <div className="grid grid-cols-2 gap-x-10 gap-y-2 max-w-[1000px]">
              <div className="space-y-2">
                <R label="Rua:"><input value={d.street || ''} onChange={(e) => set('street', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Cidade:"><input value={d.city || ''} onChange={(e) => set('city', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Telefone:"><input value={d.phone || ''} onChange={(e) => set('phone', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Telemóvel:"><input value={d.mobile || ''} onChange={(e) => set('mobile', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
              </div>
              <div className="space-y-2">
                <R label="Código postal:" w="w-[110px]"><input value={d.postal_code || ''} onChange={(e) => set('postal_code', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="País:" w="w-[110px]"><input value={d.country || ''} onChange={(e) => set('country', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="Fax:" w="w-[110px]"><input value={d.fax || ''} onChange={(e) => set('fax', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
                <R label="E-Mail:" w="w-[110px]"><input value={d.personal_email || ''} onChange={(e) => set('personal_email', e.target.value)} className={`${inp} flex-1`} style={inputStyle} /></R>
              </div>
            </div>
          )}

          {tab === 'pos' && (
            <div className="grid grid-cols-2 gap-x-10 gap-y-3 max-w-[1000px]">
              <div className="space-y-2">
                <R label="POS Front Office:" w="w-[120px]">
                  <select value={d.pos_group || ''} onChange={(e) => set('pos_group', Number(e.target.value) || null)} className={`${inp} flex-1`} style={inputStyle}>
                    <option value="">—</option>
                    {groups.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
                  </select>
                </R>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!d.all_sectors} onChange={(e) => set('all_sectors', e.target.checked)} className="w-4 h-4" />
                  Todos os setores
                </label>
                <div className={`border border-[#EEF4F5] max-h-[130px] overflow-auto ${d.all_sectors ? 'opacity-40 pointer-events-none' : ''}`}>
                  {sectors.map((s: any) => (
                    <label key={s.id} className="flex items-center gap-2 px-2 py-1 text-[12px] border-b border-[#F7FAFA]">
                      <input type="checkbox" checked={(d.sector_ids || []).includes(s.id)}
                        onChange={(e) => set('sector_ids', e.target.checked
                          ? [...(d.sector_ids || []), s.id]
                          : (d.sector_ids || []).filter((x: number) => x !== s.id))} className="w-4 h-4" />
                      {s.code} · {s.name}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!d.internal_consumption} onChange={(e) => set('internal_consumption', e.target.checked)} className="w-4 h-4" />
                  Consumo interno
                </label>
                <R label="Desconto:" w="w-[80px]">
                  <input value={d.discount_profile || ''} onChange={(e) => set('discount_profile', e.target.value)} placeholder="(nenhum)" className={`${inp} flex-1`} style={inputStyle} />
                </R>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!d.use_cost_price} onChange={(e) => set('use_cost_price', e.target.checked)} className="w-4 h-4" />
                  Utilizar preço de custo
                </label>
                <button onClick={() => setPwModal('pos')}
                  className="w-[250px] flex items-center justify-center gap-2 py-2.5 bg-[#062A31] text-white text-[13px] font-bold">
                  <Glyph icon="🔑" size={14} /> PIN do Terminal (POS)
                </button>
                <label className="flex items-center gap-2 text-[12px]">
                  <input type="checkbox" checked={!!d.pos_must_change_pin} onChange={(e) => set('pos_must_change_pin', e.target.checked)} className="w-4 h-4" />
                  Deve alterar o PIN no próximo login
                </label>
              </div>
            </div>
          )}

          {tab === 'ems' && (
            <div className="max-w-[700px] space-y-2">
              <label className="flex items-center gap-2 text-[12px]">
                <input type="checkbox" checked={!!d.is_event_manager} onChange={(e) => set('is_event_manager', e.target.checked)} className="w-4 h-4" />
                Gestor de Eventos
              </label>
              <R label="Grupo de E-mail:" w="w-[120px]">
                <select value={d.email_group || ''} onChange={(e) => set('email_group', e.target.value)} className={`${inp} flex-1`} style={inputStyle}>
                  <option value="">—</option>
                  {groups.map((g: any) => <option key={g.id} value={g.code}>{g.code} · {g.name}</option>)}
                </select>
              </R>
            </div>
          )}

          {tab === 'fnb' && (
            <label className="flex items-center gap-2 text-[12px]">
              <input type="checkbox" checked={!!d.is_fnb_user} onChange={(e) => set('is_fnb_user', e.target.checked)} className="w-4 h-4" />
              Utilizador F&B
            </label>
          )}

          {tab === 'memo' && (
            <textarea value={d.memo || ''} onChange={(e) => set('memo', e.target.value)} rows={14}
              className="w-full border border-[#7FA9B1] p-2 text-[12px]" style={inputStyle} />
          )}

          {tab === 'sign' && (
            <textarea value={d.email_signature || ''} onChange={(e) => set('email_signature', e.target.value)} rows={14}
              placeholder="Assinatura que sai nos e-mails enviados por este utilizador."
              className="w-full border border-[#7FA9B1] p-2 text-[12px]" style={inputStyle} />
          )}

          {tab === 'comm' && (
            <div>
              <table className="w-full text-[12px] border-collapse">
                <thead><tr className="bg-[#F7FAFA]">
                  {['Código', 'Descrição', 'Tipo', 'Valor', ''].map((h) => (
                    <th key={h} className="text-left font-normal px-2 py-1.5 border border-[#EEF4F5]">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {comms.map((c, i) => (
                    <tr key={i} className="border-b border-[#F7FAFA]">
                      <td className="px-2 py-1.5 border border-[#F7FAFA] font-mono">{c.code}</td>
                      <td className="px-2 py-1.5 border border-[#F7FAFA]">{c.target}</td>
                      <td className="p-0.5 border border-[#F7FAFA] w-[160px]">
                        <select value={c.commission_type} onChange={(e) => setComm(i, 'commission_type', e.target.value)} className={cell}>
                          <option value="PERCENT">Percentagem</option>
                          <option value="VALUE">Valor fixo</option>
                        </select>
                      </td>
                      <td className="p-0.5 border border-[#F7FAFA] w-[120px]">
                        <input type="number" value={c.value} onChange={(e) => setComm(i, 'value', e.target.value)} className={`${cell} text-right`} />
                      </td>
                      <td className="text-center border border-[#F7FAFA] w-[70px]">
                        <button onClick={() => set('commissions', comms.filter((_, j) => j !== i))} className="text-[#8C2B1F] font-bold text-[11px]">Apagar</button>
                      </td>
                    </tr>
                  ))}
                  {comms.length === 0 && <tr><td colSpan={5} className="text-center text-[#7FA9B1] py-8">Sem comissões.</td></tr>}
                </tbody>
              </table>
              <div className="flex items-center gap-4 mt-2 pt-2 border-t border-[#EEF4F5]">
                <button onClick={() => setPicker('sub')} className="flex items-center gap-2 text-[13px] hover:bg-[#F7FAFA] px-1 py-1">
                  <span className="w-6 h-6 rounded-full bg-[#062A31] text-white flex items-center justify-center">＋</span> Adicionar - Sub-Famílias
                </button>
                <button onClick={() => setPicker('item')} className="flex items-center gap-2 text-[13px] hover:bg-[#F7FAFA] px-1 py-1">
                  <span className="w-6 h-6 rounded-full bg-[#062A31] text-white flex items-center justify-center">＋</span> Adicionar - Artigos
                </button>
                <span className="ml-auto text-[11px] text-[#5C8891]">
                  É o que motiva a sala a vender a garrafa em vez do copo.
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popup da password */}
      {pwModal && (
        <div className="fixed inset-0 bg-black/45 flex items-center justify-center z-[70]" onClick={() => setPwModal(null)}>
          <div className="bg-white border border-[#5C8891] w-[440px] shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="px-3 py-2 text-white text-[14px] font-bold" style={{ background: '#041F24' }}>
              {pwModal === 'pos' ? 'PIN do Terminal' : 'Password'}
            </div>
            <div className="p-4 space-y-2">
              <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus
                onKeyDown={(e) => e.key === 'Enter' && applyPw()}
                placeholder={pwModal === 'pos' ? 'PIN (4+ dígitos)' : 'Nova password'}
                className={`${inp} w-full`} style={inputStyle} />
              <div className="text-[11px] text-[#5C8891]">
                É guardada em <b>hash</b> — nem o dono a consegue ler. Só se pode substituir.
              </div>
            </div>
            <Toolbar actions={[
              { icon: '✔', label: 'Definir', color: '#062A31', onClick: applyPw },
              { icon: '✖', label: 'Cancelar', color: '#B0392B', onClick: () => { setPw(''); setPwModal(null); } },
            ]} />
          </div>
        </div>
      )}

      {/* Escolher sub-famílias / artigos para comissão (multi-seleção) */}
      {picker === 'sub' && (
        <SubFamilyPicker exclude={comms.filter((c) => c.subfamily).map((c) => c.subfamily)}
          onPick={(rows) => addComms(rows, 'sub')} onClose={() => setPicker(null)} />
      )}
      {picker === 'item' && (
        <ItemPicker exclude={comms.filter((c) => c.item).map((c) => c.item)}
          onPick={(rows) => addComms(rows, 'item')} onClose={() => setPicker(null)} />
      )}

      <Toolbar actions={[
        { icon: '✔', label: save.isPending ? 'A gravar…' : 'Gravar', color: '#062A31', onClick: () => save.mutate() },
        { icon: '✖', label: 'Fechar', color: '#B0392B', onClick: onClose },
      ]} />
    </div>
  );
}
