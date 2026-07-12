import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { notifyError, notifyGuide } from '../../utils/friendlyError';
import ArticleEditor from './ArticleEditor';
import SimpleSection from './SimpleSection';
import SubFamilyEditor from './SubFamilyEditor';
import MessageEditor from './MessageEditor';
import Maintenance from './Maintenance';
import BarcodePrint from './BarcodePrint';
import GroupEditor from './GroupEditor';
import CompanyEditor from './CompanyEditor';
import TerminalEditor from './TerminalEditor';
import SectorEditor from './SectorEditor';
import Parameters from './Parameters';
import KeyboardEditor from './KeyboardEditor';
import TimeBandEditor from './TimeBandEditor';
import ScheduleEditor from './ScheduleEditor';
import UserGroupEditor from './UserGroupEditor';
import UserEditor from './UserEditor';
import HRResourceEditor from './HRResourceEditor';
import CurrencyEditor from './CurrencyEditor';
import DiscountEditor from './DiscountEditor';
import TaxEditor from './TaxEditor';
import ExemptionSection from './ExemptionSection';
import PaymentMethodEditor from './PaymentMethodEditor';
import DocumentEditor from './DocumentEditor';
import PmsInterface from './PmsInterface';
import StockErp from './StockErp';
import UomEditor from './UomEditor';
import HappyHourEditor from './HappyHourEditor';
import PrinterSection from './PrinterSection';
import KdsMonitorEditor from './KdsMonitorEditor';
import CardTypeEditor from './CardTypeEditor';
import MemberCardEditor from './MemberCardEditor';
import EmailTemplateEditor from './EmailTemplateEditor';
import SelectionCodesSection from './SelectionCodesSection';
import { SECTIONS, Toolbar, Field, Sel, money, GridCheck } from './kit';
import { irParaModulo } from '../../App';

/**
 * Os menus do topo. Cada entrada abre um ECRÃ REAL do sistema:
 *  · `section` — muda de secção aqui dentro;
 *  · `view`    — abre outro centro do ERP (o shell trata da navegação);
 *  · `url`     — abre o terminal tátil, que corre fora da shell.
 */
const MENUS: any[] = [
  {
    title: 'F&B', items: [
      { icon: '🛒', label: 'Compras', view: 'proc_po' },
      { icon: '📄', label: 'Documentos Internos', view: 'doc_center' },
      { icon: '📋', label: 'Inventário', view: 'wh_inventory' },
      { icon: '📦', label: 'Existências Stock', view: 'wh_stock' },
      { icon: '💸', label: 'Contas a pagar', view: 'fin_ledger' },
      { sep: true },
      { icon: '📑', label: 'Artigos', section: 'articles' },
    ],
  },
  {
    title: 'Reporting', items: [
      { icon: '🖨', label: 'Relatórios', view: 'rep_pos' },
      { icon: '📈', label: 'Informação Online', view: 'ops_dashboard' },
      { icon: '🔎', label: 'Pesquisar Documentos', view: 'doc_center' },
    ],
  },
  {
    title: 'Utilitários', items: [
      { icon: '🖥', label: 'POS Front Office', url: '/pos/terminal' },
      { sep: true },
      { icon: '🌙', label: 'Fecho do Dia', view: 'pms_nightaudit' },
      { icon: '💰', label: 'Contas Correntes', view: 'fin_cash' },
      { icon: '🧾', label: 'SAFT-AO', view: 'fis_saft' },
      { icon: '🔧', label: 'Configuração POS', section: 'articles' },
      { sep: true },
      { icon: '⚙', label: 'Diagnóstico', view: 'sys_diagnostics' },
      { icon: '♥', label: 'Adicionar aos favoritos…', fav: true },
    ],
  },
];

/**
 * CONFIGURAÇÃO POS — o backoffice do ponto de venda.
 *
 * Estrutura (igual aos sistemas hoteleiros de referência):
 *   · à esquerda, as SECÇÕES da configuração (Artigos, Grupos, Famílias…);
 *   · em cima, os FILTROS (grupo, família, sub-família, tipo, estado, módulo, texto livre);
 *   · ao centro, a GRELHA com paginação;
 *   · em baixo, a BARRA DE FERRAMENTAS (Adicionar, Editar, Apagar, Copiar, Imprimir,
 *     Exportar, Importar, Fechar).
 *
 * Tudo é CRUD real contra a base de dados — nada é decorativo.
 */
export default function PosConfigView({ onDesktop, onOpen }: {
  onBack?: () => void; onDesktop?: () => void; onOpen?: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [section, setSection] = useState('articles');
  const [menu, setMenu] = useState<string | null>(null);
  // FAVORITOS — as secções que este utilizador usa todos os dias (ficam no browser dele).
  const [favs, setFavs] = useState<any[]>(() => JSON.parse(localStorage.getItem('posc_favs') || '[]'));
  const [open, setOpen] = useState<Record<string, boolean>>({ artigos: true });
  const [editing, setEditing] = useState<number | 'new' | null>(null);
  const [sel, setSel] = useState<number | null>(null);

  // Filtros do topo
  const [f, setF] = useState<any>({ group: '', family: '', subfamily: '', item_type: '', state: '', module: '', q: '' });
  const [applied, setApplied] = useState<any>({});
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const { data: groups = [] } = useQuery({ queryKey: ['posc', 'groups'], queryFn: async () => (await apiClient.get('inventory/pos/groups/')).data });
  const { data: families = [] } = useQuery({
    queryKey: ['posc', 'families', f.group],
    queryFn: async () => (await apiClient.get('inventory/pos/families/', { params: { group: f.group || undefined } })).data,
  });
  const { data: subfamilies = [] } = useQuery({
    queryKey: ['posc', 'subs', f.family, f.group],
    queryFn: async () => (await apiClient.get('inventory/pos/subfamilies/', { params: { family: f.family || undefined, group: f.group || undefined } })).data,
  });
  const { data: articles = [] } = useQuery({
    queryKey: ['posc', 'articles', applied],
    queryFn: async () => {
      const params: any = {};
      Object.entries(applied).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await apiClient.get('inventory/pos/articles/', { params });
      return r.data?.results || r.data || [];
    },
  });

  const inval = () => qc.invalidateQueries({ queryKey: ['posc'] });
  const del = useMutation({
    mutationFn: (id: number) => apiClient.delete(`inventory/pos/articles/${id}/`),
    onSuccess: () => { setSel(null); inval(); notifyGuide({ title: 'Artigo apagado', message: 'O artigo foi removido do catálogo. A eliminação ficou registada na auditoria.' }); },
    onError: notifyError,
  });
  // "Ativo" na grelha: liga/desliga o artigo no servidor. Um artigo inativo é
  // recusado na venda (o POS não deixa lançá-lo), mas continua no histórico.
  const setActive = useMutation({
    mutationFn: ({ id, v }: { id: number; v: boolean }) =>
      apiClient.patch(`inventory/pos/articles/${id}/`, { is_active: v }),
    onSuccess: () => inval(),
    onError: notifyError,
  });
  const copy = useMutation({
    mutationFn: (id: number) => apiClient.post(`inventory/pos/articles/${id}/duplicate/`),
    onSuccess: (r: any) => { inval(); setEditing(r.data.id); notifyGuide({ title: 'Artigo copiado', message: `Criado "${r.data.name}" com o código ${r.data.code}. Ajuste o que for preciso e grave.` }); },
    onError: notifyError,
  });

  const rows: any[] = articles;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const view = rows.slice((page - 1) * pageSize, page * pageSize);
  const selRow = rows.find((r) => r.id === sel);

  const search = () => { setApplied({ ...f }); setPage(1); };
  const exportExcel = () => {
    const cols = ['code', 'name', 'subfamily_name', 'sale_price', 'tax_percentage', 'stock_qty', 'printers_label', 'units_label'];
    const head = ['Código', 'Descrição', 'Sub Família', 'Preço', 'IVA', 'Stock', 'Impressoras', 'Unidades'];
    const csv = [head.join(';'), ...rows.map((r) => cols.map((c) => String(r[c] ?? '')).join(';'))].join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'artigos_pos.csv'; a.click();
  };

  return (
    <div className="h-full flex flex-col" style={{ background: '#f0f0f0', fontFamily: "'Segoe UI', Tahoma, sans-serif" }}>
      {/* ---------- BARRA DE MENUS (topo escuro) ---------- */}
      <div className="flex items-center gap-1 px-3 flex-shrink-0 text-white" style={{ background: '#2b2b2b', height: 56 }}>
        {/* ML — é aqui que se troca de módulo (como o logótipo do original). */}
        <div className="relative pr-4 mr-2">
          <button onClick={() => setMenu(menu === '__ml' ? null : '__ml')}
            title="Trocar de módulo"
            className={`flex items-center gap-2 px-2 py-1 leading-none ${menu === '__ml' ? 'bg-white/15' : 'hover:bg-white/10'}`}>
            <span className="text-[30px] font-black tracking-tight select-none"
              style={{
                // "3D": relevo por sombras, sem imagem nenhuma.
                background: 'linear-gradient(180deg,#ffd75e 0%,#c9a400 55%,#8a6f00 100%)',
                WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
                textShadow: '0 1px 0 rgba(255,255,255,.35), 0 3px 6px rgba(0,0,0,.55)',
                filter: 'drop-shadow(0 2px 1px rgba(0,0,0,.6))',
              }}>
              ML
            </span>
            <span className="text-[10px] text-[#9a9a9a] pb-1">Mwana Lodge ▾</span>
          </button>

          {menu === '__ml' && (
            <>
              <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
              <div className="absolute left-0 top-full z-[61] min-w-[230px] py-1 shadow-2xl"
                style={{ background: '#2b2b2b', border: '1px solid #444' }}>
                <div className="px-4 py-1.5 text-[10px] uppercase tracking-widest text-[#888]">Módulos</div>
                {[['pms', 'PMS — Hotel', 'pms_dashboard'],
                  ['restauracao', 'Restauração', 'hoc_dashboard']].map(([k, l, ecra]) => (
                  <button key={k}
                    onClick={() => irParaModulo(k, ecra)}
                    className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#3d6ea5]">
                    <span className="w-5 text-center opacity-80">📁</span>{l}
                  </button>
                ))}
                <div className="my-1 border-t border-[#444]" />
                <button onClick={() => { setMenu(null); onDesktop?.(); }}
                  className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#3d6ea5]">
                  <span className="w-5 text-center opacity-80">🖥</span>Ambiente de Trabalho
                </button>
              </div>
            </>
          )}
        </div>
        {MENUS.map((m) => (
          <div key={m.title} className="relative">
            <button onClick={() => setMenu(menu === m.title ? null : m.title)}
              onMouseEnter={() => menu && setMenu(m.title)}
              className={`px-4 py-2 text-[15px] font-semibold hover:bg-white/10 ${menu === m.title ? 'bg-white/10' : ''}`}>
              {m.title} ▾
            </button>
            {menu === m.title && (
              <>
                {/* clicar fora fecha */}
                <div className="fixed inset-0 z-[60]" onClick={() => setMenu(null)} />
                <div className="absolute left-0 top-full z-[61] min-w-[250px] py-1 shadow-2xl"
                  style={{ background: '#2b2b2b', border: '1px solid #444' }}>
                  {m.items.map((it: any, i: number) => it.sep ? (
                    <div key={i} className="my-1 border-t border-[#444]" />
                  ) : (
                    <button key={i}
                      onClick={() => {
                        setMenu(null);
                        if (it.fav) {
                          // FAVORITOS — guarda a secção onde o utilizador está agora.
                          // É o atalho de quem passa o dia no mesmo ecrã.
                          const atual = SECTIONS.flatMap((g) => g.items).find((x) => x.key === section);
                          const guardados = JSON.parse(localStorage.getItem('posc_favs') || '[]');
                          if (!guardados.some((f: any) => f.key === section)) {
                            // Lista NOVA (não a mesma): senão o React não redesenha a barra.
                            const novos = [...guardados, { key: section, label: atual?.label || section }];
                            localStorage.setItem('posc_favs', JSON.stringify(novos));
                            setFavs(novos);
                          }
                          notifyGuide({
                            title: 'Adicionado aos favoritos',
                            message: `"${atual?.label || section}" fica agora no topo da lista de secções.`,
                          });
                        }
                        else if (it.section) setSection(it.section);
                        else if (it.view && onOpen) onOpen(it.view);
                        else if (it.url) window.open(it.url, '_blank');
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2 text-left text-[14px] text-white hover:bg-[#3d6ea5]">
                      <span className="w-5 text-center opacity-80">{it.icon}</span>
                      {it.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-4 text-[13px]">
          <span className="text-[#e05555] font-semibold">{new Date().toLocaleDateString('pt-PT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span className="opacity-30">|</span>
          <span className="font-bold">{JSON.parse(localStorage.getItem('erp_user') || '{}').username || 'operador'}</span>
        </div>
      </div>

      {/* Título da janela */}
      <div className="flex items-center gap-2 px-3 py-2 text-white text-[15px] font-bold flex-shrink-0"
        style={{ background: '#3c3c3c' }}>
        <span className="text-[#c9a400]">🔧</span> Configuração POS
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* ---------- SECÇÕES ---------- */}
        <div className="w-[236px] flex-shrink-0 border-r border-[#c0c0c0] bg-white overflow-auto">
          {favs.length > 0 && (
            <div>
              <div className="px-3 py-2 text-[13px] font-semibold text-[#8a6100] bg-[#fff7e6] border-b border-[#e0c080]">
                ♥ Favoritos
              </div>
              {favs.map((f) => (
                <div key={f.key}
                  className={`group flex items-center pl-6 pr-2 py-1.5 text-[13px] border-b border-[#f0f0f0] cursor-pointer ${section === f.key ? 'bg-[#dbe7f3] text-[#1a4f8a] font-bold' : 'text-[#333] hover:bg-[#f5f9ff]'}`}>
                  <span className="flex-1" onClick={() => { setSection(f.key); setEditing(null); }}>{f.label}</span>
                  <button title="Tirar dos favoritos"
                    onClick={() => {
                      const novos = favs.filter((x) => x.key !== f.key);
                      localStorage.setItem('posc_favs', JSON.stringify(novos));
                      setFavs(novos);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-[#c0392b] font-bold px-1">×</button>
                </div>
              ))}
            </div>
          )}
          {SECTIONS.map((grp) => (
            <div key={grp.key}>
              <button onClick={() => setOpen((o) => ({ ...o, [grp.key]: !o[grp.key] }))}
                className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-semibold text-[#333] border-b border-[#e0e0e0] hover:bg-[#f5f5f5]">
                <span>{grp.title}</span>
                <span className="text-[16px] leading-none text-[#888]">{open[grp.key] ? '−' : '+'}</span>
              </button>
              {open[grp.key] && grp.items.map((it) => (
                <button key={it.key} onClick={() => { setSection(it.key); setSel(null); }}
                  className={`w-full flex items-center gap-2 pl-4 pr-3 py-1.5 text-[13px] text-left border-b border-[#f0f0f0] ${section === it.key ? 'bg-[#dce9f7] font-bold text-[#0b4a8f]' : 'text-[#444] hover:bg-[#f7f7f7]'}`}>
                  {(it as any).icon
                    ? <span className="w-5 text-center text-[14px]">{(it as any).icon}</span>
                    : <span className="w-5 flex justify-center"><span className="w-1.5 h-1.5 rounded-full bg-[#666]" /></span>}
                  {it.label}
                </button>
              ))}
            </div>
          ))}
        </div>

        {/* ---------- CONTEÚDO ---------- */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {section === 'groups' ? (
            <SimpleSection title="Grupo" queryKey="groups" endpoint="inventory/pos/groups/"
              columns={[{ key: 'code', label: 'Código', width: '30%' }, { key: 'name', label: 'Nome' }]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[280px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
                { key: 'accounting_account', label: 'Conta de Contabilidade:', width: 'w-[140px]',
                  help: 'Conta de proveitos do PGC-AO onde caem as vendas deste grupo.' },
              ]} />
          ) : section === 'families' ? (
            <SimpleSection title="Família" queryKey="families" endpoint="inventory/pos/families/"
              columns={[{ key: 'code', label: 'Código', width: '20%' }, { key: 'name', label: 'Nome', width: '40%' },
                        { key: 'group_name', label: 'Grupo' }]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[280px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
                { key: 'group', label: 'Grupo:', type: 'select', required: true,
                  options: groups.map((g: any) => ({ value: g.id, label: g.name })) },
                { key: 'accounting_account', label: 'Conta de Contabilidade:', width: 'w-[140px]' },
              ]} />
          ) : section === 'subfamilies' ? (
            <SimpleSection title="Sub-Família" queryKey="subs" endpoint="inventory/pos/subfamilies/"
              columns={[{ key: 'code', label: 'Código', width: '18%' }, { key: 'name', label: 'Nome', width: '32%' },
                        { key: 'family_name', label: 'Família', width: '25%' }, { key: 'group_name', label: 'Grupo' }]}
              fields={[]}
              renderEditor={(row, close) => <SubFamilyEditor row={row} families={families} onClose={close} />} />
          ) : section === 'allergens' ? (
            <SimpleSection title="Alergénio" queryKey="allergens" endpoint="production/allergens/"
              columns={[
                { key: 'photo_url', label: '', width: '52px',
                  render: (r: any) => r.photo_url
                    ? <img src={r.photo_url} alt="" className="w-7 h-7 object-contain" />
                    : <span className="w-7 h-7 rounded-full bg-[#c0392b] text-white text-[10px] font-bold flex items-center justify-center">{r.code}</span> },
                { key: 'code', label: 'Código', width: '18%' },
                { key: 'name', label: 'Descrição' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[720px]' },
                { key: 'is_active', label: 'Ativo:', type: 'checkbox' },
                { key: 'photo_url', label: 'Foto (URL):', width: 'w-[720px]',
                  help: 'A cozinha reconhece o símbolo mais depressa do que lê o texto.' },
              ]} />
          ) : section === 'messages' ? (
            <SimpleSection title="Mensagem" queryKey="messages" endpoint="production/pos-messages/"
              columns={[
                { key: 'code', label: 'Código', width: '40%' },
                { key: 'sort_order', label: 'Ordem', width: '15%' },
                { key: 'is_message', label: 'Mensagem', width: '15%', toggle: true },
                { key: 'is_comment', label: 'Comentário', width: '15%', toggle: true },
                { key: 'options', label: 'Modelos',
                  render: (r: any) => (r.options || []).length },
              ]}
              fields={[]}
              renderEditor={(row, close) => <MessageEditor row={row} onClose={close} />} />
          ) : section === 'maintenance' ? (
            <Maintenance />
          ) : section === 'barcode_print' ? (
            <BarcodePrint />
          ) : section === 'report_defs' ? (
            <SimpleSection title="Definição de Relatório" queryKey="repdefs" endpoint="inventory/pos/report-definitions/"
              columns={[
                { key: 'code', label: 'Código', width: '30%' },
                { key: 'name', label: 'Descrição' },
                { key: 'is_active', label: 'Ativo', width: '12%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[720px]',
                  help: 'Agrupa artigos de famílias diferentes para a análise de vendas.' },
                { key: 'is_active', label: 'Ativo:', type: 'checkbox' },
              ]} />
          ) : section === 'p_group' ? (
            <SimpleSection title="Grupo" queryKey="orggroups" endpoint="org/pos/groups/"
              columns={[
                { key: 'code', label: 'Código', width: '25%' },
                { key: 'name', label: 'Descrição', width: '35%' },
                { key: 'sort_order', label: 'Ordem', width: '15%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <GroupEditor row={row} onClose={close} />} />
          ) : section === 'p_company' ? (
            <SimpleSection title="Empresa" queryKey="companies" endpoint="org/pos/companies/"
              columns={[
                { key: 'external_id', label: 'Id do hotel', width: '10%' },
                { key: 'nif', label: 'NIF', width: '14%' },
                { key: 'hotel_code', label: 'Código Hotel', width: '12%' },
                { key: 'name', label: 'Nome Hotel', width: '24%' },
                { key: 'city', label: 'Cidade', width: '14%' },
                { key: 'logo_url', label: 'Imagem do Hotel', width: '14%',
                  render: (r: any) => r.logo_url ? <img src={r.logo_url} alt="" className="h-6 object-contain" /> : '—' },
                { key: 'is_master', label: 'Master', width: '8%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <CompanyEditor row={row} onClose={close} />} />
          ) : section === 'p_modules' ? (
            <SimpleSection title="Módulo" queryKey="modules" endpoint="pos/config/modules/"
              columns={[
                { key: 'name', label: 'Nome do Módulo', width: '20%' },
                { key: 'description', label: 'Descrição', width: '26%' },
                { key: 'sort_order', label: 'Ordem', width: '8%' },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
                { key: 'show_in_menu', label: 'Mostrar no Menu', width: '12%', toggle: true },
                { key: 'show_on_desktop', label: 'Mostrar no Desktop', width: '13%', toggle: true },
                { key: 'is_widget', label: 'É Widget', width: '9%', toggle: true },
                { key: 'is_licensed', label: 'Licenciado', width: '9%', readOnlyCheck: true },
              ]}
              fields={[
                { key: 'module_id', label: 'ID:', required: true, width: 'w-[380px]' },
                { key: 'name', label: 'Nome:', required: true, width: 'w-[380px]' },
                { key: 'description', label: 'Descrição:', width: 'w-[380px]' },
                { key: 'sort_order', label: 'Ordem:', type: 'number', width: 'w-[140px]' },
                { key: 'right_id', label: 'Right Id Necessário:', type: 'number', width: 'w-[140px]',
                  help: 'Permissão exigida para ver este módulo.' },
                { key: 'text_key', label: 'Chave do Texto:', width: 'w-[240px]' },
                { key: 'menu', label: 'Menu:', width: 'w-[240px]' },
                { key: 'is_active', label: 'Ativo:', type: 'checkbox' },
                { key: 'show_in_menu', label: 'Mostrar no Menu:', type: 'checkbox' },
                { key: 'show_on_desktop', label: 'Mostrar no Desktop:', type: 'checkbox' },
                { key: 'is_iframe', label: 'É Iframe:', type: 'checkbox' },
                { key: 'is_external_window', label: 'É Janela Externa:', type: 'checkbox' },
                { key: 'is_widget', label: 'Widget:', type: 'checkbox' },
                { key: 'license_key', label: 'Módulo da licença:', width: 'w-[240px]',
                  help: '"Licenciado" não é uma caixa: vem da licença assinada. Aqui só se diz a que módulo da licença corresponde.' },
              ]} />
          ) : section === 'p_terminals' ? (
            <SimpleSection title="Terminal" queryKey="terminals" endpoint="pos/config/terminals/"
              columns={[
                { key: 'code', label: 'Código', width: '15%' },
                { key: 'name', label: 'Nome', width: '55%' },
                { key: 'terminal_type_display', label: 'Tipo', width: '20%' },
              ]}
              fields={[]}
              renderEditor={(row, close) => <TerminalEditor row={row} onClose={close} />} />
          ) : section === 'p_sectors' ? (
            <SimpleSection title="Setor" queryKey="sectors" endpoint="pos/config/sectors/"
              columns={[
                { key: 'code', label: 'Código', width: '12%' },
                { key: 'name', label: 'Nome', width: '40%' },
                { key: 'seats', label: 'Lugares', width: '12%' },
                { key: 'price_level', label: 'Tipo Preço', width: '12%' },
                { key: 'keyboard', label: 'Teclados', width: '24%', render: (r: any) => r.keyboard || '—' },
              ]}
              fields={[]}
              renderEditor={(row, close) => <SectorEditor row={row} onClose={close} />} />
          ) : section === 'p_params' ? (
            <Parameters />
          ) : section === 'p_keyboards' ? (
            <SimpleSection title="Teclado" queryKey="keyboards" endpoint="pos/config/keyboards/"
              columns={[
                { key: 'number', label: 'Código', width: '20%' },
                { key: 'name', label: 'Nome', width: '50%' },
                { key: 'keys_count', label: 'Teclas', width: '15%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <KeyboardEditor row={row} onClose={close} />} />
          ) : section === 'p_periods' ? (
            <SimpleSection title="Período" queryKey="bands" endpoint="pos/config/time-bands/"
              columns={[
                { key: 'color', label: '', width: '48px',
                  render: (r: any) => <span className="inline-block w-6 h-5" style={{ background: r.color }} /> },
                { key: 'code', label: 'Código', width: '25%' },
                { key: 'name', label: 'Descrição', width: '50%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <TimeBandEditor row={row} onClose={close} />} />
          ) : section === 'p_schedules' ? (
            <SimpleSection title="Horário" queryKey="schedules" endpoint="pos/config/schedules/"
              columns={[
                { key: 'code', label: 'Código', width: '25%' },
                { key: 'name', label: 'Descrição', width: '55%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <ScheduleEditor row={row} onClose={close} />} />
          ) : section === 'u_groups' ? (
            <SimpleSection title="Grupo de Utilizadores" queryKey="ugroups" endpoint="pos/config/user-groups/"
              columns={[
                { key: 'code', label: 'Código', width: '22%' },
                { key: 'name', label: 'Descrição', width: '34%' },
                { key: 'memo', label: 'Memo', width: '22%' },
                { key: 'rights_count', label: 'Permissões', width: '12%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <UserGroupEditor row={row} onClose={close} />} />
          ) : section === 'u_users' ? (
            <SimpleSection title="Utilizador" queryKey="posusers" endpoint="pos/config/users/"
              columns={[
                { key: 'number', label: 'Nr', width: '6%' },
                { key: 'code', label: 'Código', width: '14%' },
                { key: 'first_name', label: 'Nome', width: '14%' },
                { key: 'last_name', label: 'Apelido', width: '14%' },
                { key: 'group_name', label: 'Grupo', width: '16%' },
                { key: 'section', label: 'Secção', width: '14%' },
                { key: 'internal_consumption', label: 'Consumo interno', width: '11%', toggle: true },
                { key: 'is_blocked', label: 'Bloqueado', width: '9%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <UserEditor row={row} onClose={close} />} />
          ) : section === 'u_hr_type' ? (
            <SimpleSection title="Tipo R.H." queryKey="hrtypes" endpoint="pos/config/hr-types/"
              columns={[
                { key: 'code', label: 'Código', width: '30%' },
                { key: 'name', label: 'Descrição', width: '45%' },
                { key: 'resources_count', label: 'Pessoas', width: '12%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[640px]' },
                { key: 'notes', label: 'Observações:', type: 'textarea', width: 'w-[640px]' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'u_hr' ? (
            <SimpleSection title="Recurso Humano" queryKey="hr" endpoint="pos/config/human-resources/"
              columns={[
                { key: 'code', label: 'Código', width: '16%' },
                { key: 'full_name', label: 'Descrição', width: '30%' },
                { key: 'type_name', label: 'Tipo', width: '22%' },
                { key: 'sort_order', label: 'Ordem', width: '10%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <HRResourceEditor row={row} onClose={close} />} />
          ) : section === 'f_currencies' ? (
            <SimpleSection title="Moeda" queryKey="currencies" endpoint="pos/config/currencies/"
              columns={[
                { key: 'code', label: 'Código ISO', width: '14%' },
                { key: 'name', label: 'Descrição', width: '24%' },
                { key: 'rate_to_base', label: 'Taxa de Câmbio', width: '18%',
                  render: (r: any) => Number(r.rate_to_base) },
                { key: 'buy_rate', label: 'Taxa de Compra', width: '17%',
                  render: (r: any) => Number(r.buy_rate) },
                { key: 'sell_rate', label: 'Taxa de Venda', width: '17%',
                  render: (r: any) => Number(r.sell_rate) },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <CurrencyEditor row={row} onClose={close} />} />
          ) : section === 'f_discounts' ? (
            <SimpleSection title="Desconto" queryKey="discounts" endpoint="pos/config/discounts/" copyable
              columns={[
                { key: 'code', label: 'Código', width: '16%' },
                { key: 'name', label: 'Descrição', width: '28%' },
                { key: 'base_display', label: 'Base', width: '14%' },
                { key: 'value', label: 'Valor', width: '10%', render: (r: any) => Number(r.value).toFixed(2) },
                { key: 'valid_from', label: 'Válido de', width: '13%' },
                { key: 'valid_to', label: 'Válido até', width: '13%' },
                { key: 'is_active', label: 'Ativo', width: '6%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <DiscountEditor row={row} onClose={close} />} />
          ) : section === 'f_taxes' ? (
            <SimpleSection title="Imposto" queryKey="taxes" endpoint="pos/config/taxes/"
              columns={[
                { key: 'code', label: 'Código', width: '20%' },
                { key: 'name', label: 'Nome', width: '38%' },
                { key: 'current_rate', label: 'Em vigor hoje', width: '14%',
                  render: (r: any) => `${Number(r.current_rate)}%` },
                { key: 'is_default', label: 'Por defeito', width: '12%', toggle: true },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <TaxEditor row={row} onClose={close} />} />
          ) : section === 'f_exemptions' ? (
            <ExemptionSection />
          ) : section === 'f_payments' ? (
            <SimpleSection title="Modo de Pagamento" queryKey="paymethods" endpoint="pos/config/payment-methods/" copyable
              columns={[
                { key: 'code', label: 'Código', width: '10%' },
                { key: 'name', label: 'Descrição', width: '14%' },
                { key: 'document_display', label: 'Documento', width: '9%' },
                { key: 'currency', label: 'Moeda', width: '7%' },
                { key: 'sort_order', label: 'Ordem', width: '6%' },
                { key: 'is_active', label: 'Ativo', width: '7%', toggle: true },
                { key: 'internal_consumption', label: 'Consumo interno', width: '11%', toggle: true },
                { key: 'charge_to_room', label: 'Lançar em Quarto', width: '11%', toggle: true },
                { key: 'current_account', label: 'Conta Corrente', width: '10%', toggle: true },
                { key: 'direct_payment', label: 'Pagamento Direto', width: '10%', toggle: true },
                { key: 'opens_drawer', label: 'Abrir Gaveta', width: '9%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <PaymentMethodEditor row={row} onClose={close} />} />
          ) : section === 'f_documents' ? (
            <SimpleSection title="Série de Documento" queryKey="documents" endpoint="pos/config/documents/" copyable
              columns={[
                { key: 'code', label: 'Código', width: '14%' },
                { key: 'name', label: 'Descrição', width: '24%' },
                { key: 'type_name', label: 'Tipo', width: '22%' },
                { key: 'prefix', label: 'Nº Série', width: '14%' },
                { key: 'current_number', label: 'Número', width: '12%' },
                { key: 'is_closed', label: 'Série fechada', width: '12%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <DocumentEditor row={row} onClose={close} />} />
          ) : section === 'f_analytic' ? (
            <SimpleSection title="Conta Analítica" queryKey="analytic" endpoint="pos/config/analytic-accounts/"
              columns={[
                { key: 'code', label: 'Código', width: '30%' },
                { key: 'name', label: 'Descrição', width: '58%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]',
                  help: 'RESTAURANTE, BAR, SPA…' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'o_pms' ? (
            <PmsInterface />
          ) : section === 'o_stock_iface' ? (
            <StockErp />
          ) : section === 'o_stock_units' ? (
            <SimpleSection title="Unidade de Stock" queryKey="uoms" endpoint="pos/config/uoms/"
              columns={[
                { key: 'code', label: 'Código', width: '24%' },
                { key: 'name', label: 'Descrição', width: '44%' },
                { key: 'rounding', label: 'Arredondar', width: '14%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <UomEditor row={row} onClose={close} />} />
          ) : section === 'o_happy' ? (
            <SimpleSection title="Happy Hour" queryKey="happy" endpoint="pos/config/happy-hours/"
              columns={[
                { key: 'name', label: 'Nome', width: '52%' },
                { key: 'kind', label: 'Tipo', width: '14%',
                  render: (r: any) => r.kind === 'PRICE' ? 'Preço' : 'Desconto' },
                { key: 'active_now', label: 'Em vigor agora', width: '18%',
                  render: (r: any) => r.active_now
                    ? <span className="text-[#1f7a34] font-bold">{r.kind === 'PRICE' ? `Preço ${r.active_now}` : `-${r.active_now}%`}</span>
                    : <span className="text-[#999]">—</span> },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <HappyHourEditor row={row} onClose={close} />} />
          ) : section === 'o_reasons' ? (
            <SimpleSection title="Motivo de Anulação" queryKey="voidreasons" endpoint="pos/config/void-reasons/"
              columns={[
                { key: 'code', label: 'Código', width: '12%' },
                { key: 'key_label', label: 'Tecla', width: '34%' },
                { key: 'print_label', label: 'Impressão', width: '34%' },
                { key: 'sort_order', label: 'Ordem', width: '10%' },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[200px]' },
                { key: 'key_label', label: 'Tecla:', required: true, width: 'w-[620px]',
                  help: 'O que o empregado vê no terminal.' },
                { key: 'print_label', label: 'Impressão:', required: true, width: 'w-[620px]',
                  help: 'O que sai no talão de anulação que vai para a cozinha.' },
                { key: 'sort_order', label: 'Ordem:', type: 'number', width: 'w-[140px]' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'o_hardware' ? (
            <SimpleSection title="Hardware" queryKey="hardware" endpoint="pos/config/hardware/"
              columns={[
                { key: 'code', label: 'Código', width: '22%' },
                { key: 'name', label: 'Nome', width: '38%' },
                { key: 'type_display', label: 'Tipo', width: '20%' },
                { key: 'port', label: 'Porta', width: '12%' },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
              ]}
              fields={[
                { key: 'hw_type', label: 'Tipo de Hardware:', type: 'select', required: true, width: 'w-[300px]',
                  options: [
                    { value: 'PRINTER', label: 'Impressora' }, { value: 'DRAWER', label: 'Gaveta' },
                    { value: 'SCALE', label: 'Balança' }, { value: 'SCANNER', label: 'Leitor de códigos' },
                    { value: 'DISPLAY', label: 'Display de cliente' }, { value: 'CARD', label: 'Terminal bancário (TPA)' },
                    { value: 'KDS', label: 'Monitor de cozinha' }, { value: 'OTHER', label: 'Outro' },
                  ] },
                { key: 'code', label: 'Código:', required: true, width: 'w-[300px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
                { key: 'port', label: 'Porta:', width: 'w-[300px]', help: 'COM1 · USB · 192.168.1.50:9100' },
                { key: 'baud_rate', label: 'Baud Rate:', type: 'select', width: 'w-[300px]',
                  options: [2400, 4800, 9600, 19200, 38400, 57600, 115200].map((b) => ({ value: b, label: String(b) })),
                  help: 'A velocidade da porta série. Errada, a impressora escreve caracteres estranhos.' },
                { key: 'flow_control', label: 'Controlo de Fluxo:', type: 'select', width: 'w-[300px]',
                  options: [{ value: 'NONE', label: 'None' }, { value: 'XONXOFF', label: 'XON/XOFF' }, { value: 'RTSCTS', label: 'RTS/CTS' }] },
                { key: 'parity', label: 'Paridade:', type: 'select', width: 'w-[300px]',
                  options: [{ value: 'NONE', label: 'None' }, { value: 'EVEN', label: 'Even' }, { value: 'ODD', label: 'Odd' }] },
                { key: 'stop_bits', label: 'Stop Bits:', type: 'select', width: 'w-[300px]',
                  options: [{ value: 1, label: '1' }, { value: 2, label: '2' }] },
                { key: 'data_bits', label: 'Data Bits:', type: 'select', width: 'w-[300px]',
                  options: [{ value: 7, label: '7' }, { value: 8, label: '8' }] },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'o_printers' ? (
            <PrinterSection />
          ) : section === 'o_kds' ? (
            <SimpleSection title="Monitor de Cozinha" queryKey="kdsmonitors" endpoint="pos/config/kds-monitors/"
              columns={[
                { key: 'code', label: 'Código', width: '16%' },
                { key: 'name', label: 'Nome', width: '24%' },
                { key: 'station_display', label: 'Estação', width: '14%' },
                { key: 'kind_display', label: 'Tipo', width: '12%' },
                { key: 'buttons_label', label: 'Botões', width: '26%' },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <KdsMonitorEditor row={row} onClose={close} />} />
          ) : section === 'o_smartcash' ? (
            <SimpleSection title="Caixa Inteligente" queryKey="smartcash" endpoint="pos/config/smart-cash/"
              columns={[
                { key: 'code', label: 'Código', width: '13%' },
                { key: 'name', label: 'Descrição', width: '17%' },
                { key: 'url_operations', label: 'URL - Operações', width: '22%' },
                { key: 'url_menu', label: 'URL - Menu', width: '20%' },
                { key: 'username', label: 'Utilizador', width: '10%' },
                { key: 'type_display', label: 'Tipo', width: '10%' },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[640px]' },
                { key: 'device_type', label: 'Tipo:', type: 'select', required: true, width: 'w-[290px]',
                  options: [
                    { value: 'CASHLOGY', label: 'Cashlogy' }, { value: 'CASHDRO', label: 'CashDro' },
                    { value: 'GLORY', label: 'Glory' }, { value: 'OTHER', label: 'Outro' },
                  ] },
                { key: 'url_operations', label: 'URL - Operações:', width: 'w-[640px]',
                  help: 'Onde o POS manda pagar, dar troco e fazer sangria.' },
                { key: 'url_menu', label: 'URL - Menu:', width: 'w-[640px]' },
                { key: 'username', label: 'Utilizador:', width: 'w-[290px]' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'o_customer_types' ? (
            <SimpleSection title="Tipo de Cliente" queryKey="custtypes" endpoint="pos/config/customer-types/"
              columns={[
                { key: 'code', label: 'Código', width: '26%' },
                { key: 'name', label: 'Descrição', width: '44%' },
                { key: 'for_pos', label: 'POS', width: '10%', toggle: true },
                { key: 'for_ems', label: 'Eventos', width: '10%', toggle: true },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[640px]' },
                { key: 'for_ems', label: 'Eventos', type: 'checkbox' },
                { key: 'for_pos', label: 'POS', type: 'checkbox' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'o_custom_fields' ? (
            <SimpleSection title="Campo Personalizado" queryKey="customfields" endpoint="pos/config/custom-fields/"
              columns={[
                { key: 'code', label: 'Código', width: '18%' },
                { key: 'name', label: 'Descrição', width: '22%' },
                { key: 'type_display', label: 'Tipo', width: '12%' },
                { key: 'location_display', label: 'Localização', width: '18%' },
                { key: 'show_in_search', label: 'Mostrar na pesquisa', width: '14%', toggle: true },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[640px]' },
                { key: 'location', label: 'Localização:', type: 'select', required: true, width: 'w-[290px]',
                  options: [
                    { value: 'RESERVATION', label: 'Reserva (Detalhe)' }, { value: 'ENTITY', label: 'Entidade' },
                    { value: 'GUEST', label: 'Hóspede' }, { value: 'TICKET', label: 'Conta POS' },
                    { value: 'ITEM', label: 'Artigo' },
                  ],
                  help: 'Em que ficha é que este campo aparece.' },
                { key: 'field_type', label: 'Tipo:', type: 'select', required: true, width: 'w-[290px]',
                  options: [
                    { value: 'TEXT', label: 'Texto' }, { value: 'NUMBER', label: 'Número' },
                    { value: 'DATE', label: 'Data' }, { value: 'BOOL', label: 'Sim/Não' },
                    { value: 'LIST', label: 'Lista' },
                  ] },
                { key: 'read_permission', label: 'Permissões (Leitura):', type: 'number', width: 'w-[160px]',
                  help: 'Nº da permissão. 0 = todos podem ler.' },
                { key: 'write_permission', label: 'Permissões (Escrita):', type: 'number', width: 'w-[160px]',
                  help: '0 = todos podem escrever.' },
                { key: 'regex', label: 'Validação (Regex):', width: 'w-[440px]',
                  help: 'O servidor recusa uma expressão inválida — não fica a rebentar formulários.' },
                { key: 'size', label: 'Tamanho:', type: 'number', width: 'w-[160px]' },
                { key: 'lines', label: 'Número de linhas:', type: 'number', width: 'w-[160px]' },
                { key: 'default_value', label: 'Valor por defeito:', width: 'w-[440px]' },
                { key: 'is_list', label: 'Lista', type: 'checkbox' },
                { key: 'show_in_search', label: 'Mostrar no resultado da pesquisa', type: 'checkbox' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'c_types' ? (
            <SimpleSection title="Tipo de Cartão" queryKey="cardtypes" endpoint="pos/config/card-types/"
              columns={[
                { key: 'code', label: 'Código', width: '22%' },
                { key: 'name', label: 'Descrição', width: '40%' },
                { key: 'kind_display', label: 'Tipo', width: '24%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <CardTypeEditor row={row} onClose={close} />} />
          ) : section === 'c_members' ? (
            <SimpleSection title="Cartão de Membro" queryKey="membercards" endpoint="pos/config/member-cards/"
              columns={[
                { key: 'code', label: 'Código', width: '13%' },
                { key: 'name', label: 'Descrição', width: '20%' },
                { key: 'packages_label', label: 'Packages', width: '13%' },
                { key: 'has_credit', label: 'Crédito', width: '10%', toggle: true },
                { key: 'has_debit', label: 'Débito', width: '10%', toggle: true },
                { key: 'has_points', label: 'Pontos', width: '10%', toggle: true },
                { key: 'has_discount', label: 'Desconto', width: '10%', toggle: true },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
              ]}
              fields={[]}
              renderEditor={(row, close) => <MemberCardEditor row={row} onClose={close} />} />
          ) : section === 'm_params' ? (
            <Parameters group="Marketing" />
          ) : section === 'm_languages' ? (
            <SimpleSection title="Língua" queryKey="languages" endpoint="pos/config/languages/"
              columns={[
                { key: 'code', label: 'Código', width: '14%' },
                { key: 'name', label: 'Descrição', width: '24%' },
                { key: 'culture_code', label: 'Código de Cultura', width: '20%' },
                { key: 'is_default', label: 'Língua (Por omissão)', width: '16%', toggle: true },
                { key: 'is_mailing_default', label: 'Língua mailing (Por omissão)', width: '18%', toggle: true },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[200px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[440px]' },
                { key: 'culture_code', label: 'Código de Cultura:', required: true, width: 'w-[200px]',
                  help: 'pt-PT, en-US, fr-FR — é ele que decide como saem as datas e os números.' },
                { key: 'is_default', label: 'Língua por omissão', type: 'checkbox' },
                { key: 'is_mailing_default', label: 'Língua de mailing por omissão', type: 'checkbox' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'm_templates' ? (
            <SimpleSection title="Modelo de E-mail" queryKey="emailtpl" endpoint="pos/config/email-templates/"
              columns={[
                { key: 'code', label: 'Código', width: '18%' },
                { key: 'name', label: 'Descrição', width: '30%' },
                { key: 'source_display', label: 'Fonte de dados', width: '16%' },
                { key: 'is_sub_template', label: 'Sub-Modelo', width: '10%', toggle: true },
                { key: 'is_active', label: 'Ativo', width: '8%', toggle: true },
                { key: 'missing', label: 'Tradução em falta', width: '18%',
                  render: (r: any) => r.missing
                    ? <span className="text-[#c0392b] font-bold">{r.missing}</span>
                    : <span className="text-[#999]">—</span> },
              ]}
              fields={[]}
              renderEditor={(row, close) => <EmailTemplateEditor row={row} onClose={close} />} />
          ) : section === 'm_attachments' ? (
            <SimpleSection title="Anexo" queryKey="attachments" endpoint="pos/config/attachments/"
              columns={[
                { key: 'is_active', label: 'Ativo', width: '7%', toggle: true },
                { key: 'sort_order', label: 'Ordem', width: '8%' },
                { key: 'context_display', label: 'Contexto', width: '12%' },
                { key: 'name', label: 'Descrição', width: '25%' },
                { key: 'file_name', label: 'Nome do ficheiro', width: '20%' },
                { key: 'report_path', label: 'Relatório', width: '18%' },
                { key: 'culture', label: 'Código de Cultura', width: '10%' },
              ]}
              fields={[
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[560px]' },
                { key: 'culture', label: 'Código de Cultura:', required: true, width: 'w-[200px]' },
                { key: 'context', label: 'Contexto:', type: 'select', required: true, width: 'w-[240px]',
                  options: [
                    { value: 'Events', label: 'Eventos' }, { value: 'Reservations', label: 'Reservas' },
                    { value: 'Invoices', label: 'Faturas' }, { value: 'Pos', label: 'POS' },
                  ] },
                { key: 'sort_order', label: 'Ordem:', type: 'number', width: 'w-[140px]' },
                { key: 'file_url', label: 'Ficheiro (URL):', width: 'w-[560px]',
                  help: 'Um ficheiro fixo — ex.: as condições gerais em Word.' },
                { key: 'file_name', label: 'Nome do ficheiro:', width: 'w-[440px]' },
                { key: 'is_report', label: 'Relatório', type: 'checkbox',
                  help: 'Gerado pelo sistema com os dados daquele cliente.' },
                { key: 'report_path', label: 'Localização:', width: 'w-[440px]', help: '/Reports/Quote' },
                { key: 'detailed', label: 'Detalhado', type: 'checkbox' },
                { key: 'report_criteria', label: 'Critérios do relatório:', width: 'w-[560px]',
                  help: 'Entity=guestid,Events=eventid,Detailed=detailed' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'm_variables' ? (
            <SimpleSection title="Variável" queryKey="variables" endpoint="pos/config/variables/"
              columns={[
                { key: 'name', label: 'Descrição', width: '22%' },
                { key: 'field', label: 'Campo', width: '18%' },
                { key: 'culture', label: 'Código de Cultura', width: '12%' },
                { key: 'context_display', label: 'Contexto', width: '14%' },
                { key: 'group_name', label: 'Grupo', width: '14%' },
                { key: 'subgroup_name', label: 'Sub Grupo', width: '12%' },
                { key: 'is_table', label: 'Tabela', width: '8%', toggle: true },
              ]}
              fields={[
                { key: 'context', label: 'Contexto:', type: 'select', required: true, width: 'w-[240px]',
                  options: [
                    { value: 'Reservations', label: 'Reservas' }, { value: 'Events', label: 'Eventos' },
                    { value: 'Invoices', label: 'Faturas' }, { value: 'Pos', label: 'POS' },
                  ] },
                { key: 'culture', label: 'Código de Cultura:', required: true, width: 'w-[200px]' },
                { key: 'field', label: 'Campo:', required: true, width: 'w-[360px]', help: 'HO_HotelAddress1' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[560px]' },
                { key: 'group', label: 'Grupo:', width: 'w-[240px]' },
                { key: 'group_name', label: 'Grupo (descrição):', width: 'w-[360px]' },
                { key: 'subgroup', label: 'Sub Grupo:', width: 'w-[240px]' },
                { key: 'subgroup_name', label: 'Sub Grupo (descrição):', width: 'w-[360px]' },
                { key: 'query', label: 'Query:', type: 'textarea', width: 'w-[720px]',
                  help: 'Só SELECT — o servidor recusa tudo o que escreva ou apague dados.' },
                { key: 'date_format', label: 'Formato Data:', width: 'w-[240px]', help: 'ex: ddd dd MMM yyyy' },
                { key: 'is_table', label: 'Tabela', type: 'checkbox' },
                { key: 'table_style', label: 'Tabela - Estilo:', width: 'w-[560px]',
                  help: 'font=Arial; fontsize=10; fontcolor=black; bold=true' },
                { key: 'header_style', label: 'Cabeçalho - Estilo:', width: 'w-[560px]' },
                { key: 'text_before', label: 'Texto - Antes:', width: 'w-[560px]' },
                { key: 'text_style', label: 'Texto - Estilo:', width: 'w-[560px]' },
              ]} />
          ) : section === 'm_selgroups' ? (
            <SimpleSection title="Grupo de Códigos" queryKey="selgroups" endpoint="pos/config/selection-groups/"
              columns={[
                { key: 'number', label: 'Nr', width: '10%' },
                { key: 'code', label: 'Código', width: '30%' },
                { key: 'name', label: 'Descrição', width: '50%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'number', label: 'Nr:', type: 'number', width: 'w-[140px]' },
                { key: 'code', label: 'Código:', required: true, width: 'w-[290px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[620px]' },
                { key: 'is_active', label: 'Ativo', type: 'checkbox' },
              ]} />
          ) : section === 'm_selcodes' ? (
            <SelectionCodesSection />
          ) : section === 'p_printers' ? (
            <SimpleSection title="Impressora" queryKey="printers" endpoint="inventory/pos/printers/"
              columns={[
                { key: 'code', label: 'Código', width: '20%' },
                { key: 'name', label: 'Descrição', width: '35%' },
                { key: 'station_display', label: 'Área de produção', width: '25%' },
                { key: 'is_active', label: 'Ativo', width: '10%', toggle: true },
              ]}
              fields={[
                { key: 'code', label: 'Código:', required: true, width: 'w-[260px]' },
                { key: 'name', label: 'Descrição:', required: true, width: 'w-[560px]' },
                { key: 'station', label: 'Área de produção:', type: 'select', required: true,
                  options: [
                    { value: 'KITCHEN', label: 'Cozinha' }, { value: 'BAR', label: 'Bar' },
                    { value: 'PASTRY', label: 'Pastelaria' }, { value: 'CASHIER', label: 'Caixa' },
                  ],
                  help: 'Para onde vai a comanda impressa nesta impressora.' },
                { key: 'is_active', label: 'Ativo:', type: 'checkbox' },
              ]} />
          ) : section !== 'articles' ? (
            <div className="flex-1 flex items-center justify-center text-[#999] text-[13px]">
              {SECTIONS.flatMap((g) => g.items).find((i) => i.key === section)?.label} — a construir a seguir.
            </div>
          ) : editing !== null ? (
            <ArticleEditor id={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); inval(); }} />
          ) : (
            <>
              {/* FILTROS */}
              <div className="p-3 border-b border-[#c0c0c0] bg-white flex gap-6">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 flex-1">
                  <Field label="Grupo:">
                    <Sel value={f.group} onChange={(v) => setF({ ...f, group: v, family: '', subfamily: '' })}
                      options={groups.map((g: any) => ({ value: g.id, label: g.name }))} all />
                  </Field>
                  <Field label="Sub Família:">
                    <Sel value={f.subfamily} onChange={(v) => setF({ ...f, subfamily: v })}
                      options={subfamilies.map((s: any) => ({ value: s.id, label: s.name }))} all />
                  </Field>
                  <Field label="Família:">
                    <Sel value={f.family} onChange={(v) => setF({ ...f, family: v, subfamily: '' })}
                      options={families.map((x: any) => ({ value: x.id, label: x.name }))} all />
                  </Field>
                  <Field label="Tipo:">
                    <Sel value={f.item_type} onChange={(v) => setF({ ...f, item_type: v })} allLabel="Todos"
                      options={[
                        { value: 'RawMaterial', label: 'Matéria-Prima' },
                        { value: 'Manufactured', label: 'Produzido (Ficha Técnica)' },
                        { value: 'Retail', label: 'Revenda' },
                        { value: 'Service', label: 'Serviço' },
                      ]} all />
                  </Field>
                  <Field label="Estado:">
                    <Sel value={f.state} onChange={(v) => setF({ ...f, state: v })} allLabel="Todos"
                      options={[{ value: 'ACTIVE', label: 'Ativos' }, { value: 'INACTIVE', label: 'Inativos' }]} all />
                  </Field>
                  <Field label="Módulo:">
                    <Sel value={f.module} onChange={(v) => setF({ ...f, module: v })} allLabel="Todos"
                      options={[
                        { value: 'SALE', label: 'Venda' }, { value: 'PURCHASE', label: 'Compra' },
                        { value: 'RECIPE', label: 'Ficha Técnica' }, { value: 'MENU', label: 'Menu' },
                      ]} all />
                  </Field>
                </div>

                <div className="flex flex-col gap-2 justify-center">
                  <Field label="Pesquisa por texto livre:" wide>
                    <input value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })}
                      onKeyDown={(e) => e.key === 'Enter' && search()}
                      className="border border-[#8a95a3] px-2 py-1 text-[12px] w-[220px] bg-white"
                      style={{ boxShadow: 'inset 1px 1px 2px rgba(0,0,0,0.10)' }} />
                  </Field>
                </div>

                <button onClick={search}
                  className="w-[190px] flex flex-col items-center justify-center gap-1 text-white font-bold text-[14px]"
                  style={{ background: '#2b2b2b' }}>
                  <span className="text-[22px]">⟳</span> Pesquisar
                </button>
              </div>

              {/* GRELHA */}
              <div className="flex-1 overflow-auto bg-white">
                <table className="w-full text-[12px] border-collapse">
                  <thead className="sticky top-0">
                    <tr style={{ background: '#e9e9e9' }} className="text-[#333]">
                      {['Código', 'Descrição', 'Sub Família', 'Preço', 'Iva', 'Isenções', 'Stock', 'Impressoras', 'Unidades (Compra/Stock/Venda)', 'Ativo'].map((h) => (
                        <th key={h} className="text-left font-bold px-2 py-1.5 border border-[#d0d0d0] whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {view.map((r) => (
                      <tr key={r.id} onClick={() => setSel(r.id)} onDoubleClick={() => setEditing(r.id)}
                        className={`cursor-pointer border-b border-[#eee] ${sel === r.id ? 'bg-[#cfe2f3]' : 'hover:bg-[#f5f9ff]'}`}>
                        <td className="px-2 py-1 border-r border-[#eee] whitespace-nowrap">{r.code}</td>
                        <td className="px-2 py-1 border-r border-[#eee]">{r.name}</td>
                        <td className="px-2 py-1 border-r border-[#eee]">{r.subfamily_name || '—'}</td>
                        <td className="px-2 py-1 border-r border-[#eee] whitespace-nowrap">
                          {(r.prices || []).length
                            ? r.prices.map((p: any) => `(${p.level}: ${money(p.price)})`).join(' ')
                            : '—'}
                        </td>
                        <td className="px-2 py-1 border-r border-[#eee] whitespace-nowrap">
                          <span className="text-[#1565c0] italic">IVA{r.tax_percentage} - {Number(r.tax_percentage).toFixed(2)}</span>
                        </td>
                        <td className="px-2 py-1 border-r border-[#eee]">{r.exemption_code_1 || ''}</td>
                        <td className={`px-2 py-1 border-r border-[#eee] text-right ${Number(r.stock_qty) < 0 ? 'text-red-600 font-bold' : ''}`}>
                          {Number(r.stock_qty).toFixed(2)}
                        </td>
                        <td className="px-2 py-1 border-r border-[#eee] whitespace-nowrap">{r.printers_label || '—'}</td>
                        <td className="px-2 py-1 border-r border-[#eee] whitespace-nowrap">{r.units_label}</td>
                        <td className="px-2 py-1 text-center">
                          <GridCheck checked={r.is_active} onChange={(v) => setActive.mutate({ id: r.id, v })}
                            title="Ativo — desligar tira o artigo da venda no POS (o histórico fica)" />
                        </td>
                      </tr>
                    ))}
                    {view.length === 0 && (
                      <tr><td colSpan={10} className="text-center text-[#999] py-10">Sem artigos para estes filtros.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* PAGINAÇÃO */}
              <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#c0c0c0] bg-[#f4f4f4] text-[12px]">
                <span>Nº registos a visualizar:</span>
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
                  className="border border-[#8a95a3] px-2 py-0.5 bg-white">
                  {[25, 50, 100, 250].map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(1)} disabled={page === 1} className="px-1.5 disabled:opacity-30">⏮</button>
                  <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-1.5 disabled:opacity-30">◀</button>
                  <span>Página</span>
                  <input value={page} onChange={(e) => setPage(Math.min(totalPages, Math.max(1, Number(e.target.value) || 1)))}
                    className="w-12 border border-[#8a95a3] px-1 py-0.5 text-center bg-white" />
                  <span>de {totalPages}</span>
                  <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="px-1.5 disabled:opacity-30">▶</button>
                  <button onClick={() => setPage(totalPages)} disabled={page === totalPages} className="px-1.5 disabled:opacity-30">⏭</button>
                </div>
                <span className="ml-auto text-[#555]">
                  Nº registos a visualizar {rows.length ? (page - 1) * pageSize + 1 : 0} - {Math.min(page * pageSize, rows.length)} de {rows.length}
                </span>
              </div>

              {/* BARRA DE FERRAMENTAS */}
              <Toolbar
                actions={[
                  { icon: '＋', label: 'Adicionar', color: '#2b2b2b', onClick: () => setEditing('new') },
                  { icon: '✎', label: 'Editar', color: '#1a73c8', disabled: !sel, onClick: () => setEditing(sel!) },
                  { icon: '−', label: 'Apagar', color: '#c0392b', disabled: !sel, onClick: () => confirm(`Apagar "${selRow?.name}"? Fica registado na auditoria.`) && del.mutate(sel!) },
                  { icon: '⧉', label: 'Copiar', color: '#555', disabled: !sel, onClick: () => copy.mutate(sel!) },
                  { icon: '🖶', label: 'Imprimir', color: '#333', onClick: () => window.print() },
                  { icon: '⤓', label: 'Exportar para Excel', color: '#217346', onClick: exportExcel },
                  { icon: '⤒', label: 'Importar', color: '#333', onClick: () => notifyGuide({ title: 'Importar artigos', message: 'A importação em massa (CSV/Excel) entra na próxima fase da Configuração POS.' }) },
                ]}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
