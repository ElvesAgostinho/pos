import { useEffect, useState } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { ChefHat, Plus, Trash2, Save, ArrowLeft, ShieldAlert } from 'lucide-react';
import {
  useRecipes, useRecipe, useCreateRecipe, useUpdateRecipe, useDeleteRecipe,
  useAddLine, useDeleteLine, useInvItems, useInvUoms, useAreas,
  useAllergens, useItemProfile, useSaveProfile,
} from '../../hooks/useProduction';
import type { Recipe } from '../../api/production';

const STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Rascunho', IN_REVIEW: 'Em Revisão', APPROVED: 'Aprovada',
  PRODUCTION: 'Em Produção', DISCONTINUED: 'Descontinuada',
};
const fmt = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const inputCls = 'flex-1 border border-[#a0a0a0] p-1 focus:outline-none bg-white';

const NUTRI_FIELDS: { key: string; label: string }[] = [
  { key: 'serving_size_g', label: 'Dose (g)' },
  { key: 'energy_kcal', label: 'Energia (kcal)' },
  { key: 'fat_g', label: 'Gordura (g)' },
  { key: 'saturated_fat_g', label: 'Sat. (g)' },
  { key: 'carbs_g', label: 'Hidratos (g)' },
  { key: 'sugars_g', label: 'Açúcares (g)' },
  { key: 'protein_g', label: 'Proteína (g)' },
  { key: 'salt_g', label: 'Sal (g)' },
  { key: 'fiber_g', label: 'Fibra (g)' },
];

function ProfilePanel({ itemId }: { itemId: number }) {
  const { data: allergens = [] } = useAllergens();
  const { data: profile } = useItemProfile(itemId);
  const saveProfile = useSaveProfile();
  const [form, setForm] = useState<any>({ is_semi_finished: false, allergen_ids: [] });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (profile) {
      setForm({ ...profile, allergen_ids: (profile.allergens || []).map((a: any) => a.id) });
    } else {
      setForm({ is_semi_finished: false, allergen_ids: [] });
    }
  }, [profile, itemId]);

  const toggle = (id: number) => setForm((f: any) => {
    const s = new Set<number>(f.allergen_ids || []);
    s.has(id) ? s.delete(id) : s.add(id);
    return { ...f, allergen_ids: Array.from(s) };
  });

  const save = () => {
    const payload: any = { ...form, item: itemId };
    saveProfile.mutate(payload, { onSuccess: () => { setSaved(true); setTimeout(() => setSaved(false), 2000); } });
  };

  return (
    <div className="border border-[#a0a0a0] bg-white p-2">
      <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1 flex items-center">
        <ShieldAlert size={13} className="mr-1.5 text-[#b06a00]" /> Alergénios, Nutrição & Conservação (do produto final)
      </h3>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alergénios */}
        <div>
          <div className="font-bold text-gray-700 mb-1">Alergénios (UE)</div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 max-h-40 overflow-y-auto border border-[#e0e0e0] p-2">
            {allergens.map((a) => (
              <label key={a.id} className="flex items-center space-x-1.5">
                <input type="checkbox" checked={(form.allergen_ids || []).includes(a.id)} onChange={() => toggle(a.id)} className="w-3 h-3" />
                <span>{a.name}</span>
              </label>
            ))}
          </div>
          <div className="mt-2 space-y-1">
            <label className="flex items-center space-x-2">
              <input type="checkbox" checked={!!form.is_semi_finished} onChange={(e) => setForm({ ...form, is_semi_finished: e.target.checked })} className="w-3 h-3" />
              <span>É semiacabado (usado como ingrediente)</span>
            </label>
            <div className="flex items-center">
              <label className="w-28 font-bold">Shelf life (h)</label>
              <input type="number" value={form.shelf_life_hours ?? ''} onChange={(e) => setForm({ ...form, shelf_life_hours: e.target.value ? Number(e.target.value) : null })} className="w-24 border border-[#a0a0a0] p-1" />
            </div>
          </div>
        </div>

        {/* Nutrição */}
        <div>
          <div className="font-bold text-gray-700 mb-1">Informação Nutricional</div>
          <div className="grid grid-cols-3 gap-2">
            {NUTRI_FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col">
                <label className="text-[10px] text-gray-600">{f.label}</label>
                <input type="number" value={form[f.key] ?? ''} onChange={(e) => setForm({ ...form, [f.key]: e.target.value })} className="border border-[#a0a0a0] p-1" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end mt-3 gap-3">
        {saved && <span className="text-green-700 font-bold text-[11px]">✓ Guardado</span>}
        <ClassicButton icon={Save} label="Gravar Perfil" onClick={save} />
      </div>
    </div>
  );
}

function RecipeDetail({ recipeId, onBack }: { recipeId: number | null; onBack: () => void }) {
  const [currentId, setCurrentId] = useState<number | null>(recipeId);
  const { data: recipe } = useRecipe(currentId ?? undefined);
  const { data: items = [] } = useInvItems();
  const { data: uoms = [] } = useInvUoms();
  const { data: areas = [] } = useAreas();
  const createRecipe = useCreateRecipe();
  const updateRecipe = useUpdateRecipe();
  const addLine = useAddLine();
  const delLine = useDeleteLine();

  const [form, setForm] = useState<Partial<Recipe>>({
    code: '', name: '', status: 'DRAFT', yield_quantity: 1,
  });
  const [line, setLine] = useState<any>({ component_item: '', quantity: '', uom: '', wastage_percentage: 0 });

  useEffect(() => {
    if (recipe) setForm(recipe);
  }, [recipe]);

  const set = (p: Partial<Recipe>) => setForm((f) => ({ ...f, ...p }));
  const isNew = !currentId;

  const save = () => {
    const payload = { ...form };
    if (currentId) updateRecipe.mutate({ id: currentId, data: payload });
    else createRecipe.mutate(payload, { onSuccess: (r) => setCurrentId(r.id!) });
  };

  const addComponent = () => {
    if (!line.component_item || !line.quantity || !line.uom || !currentId) return;
    addLine.mutate(
      { recipe: currentId, component_item: Number(line.component_item), quantity: line.quantity, uom: Number(line.uom), wastage_percentage: line.wastage_percentage || 0 },
      { onSuccess: () => setLine({ component_item: '', quantity: '', uom: '', wastage_percentage: 0 }) }
    );
  };

  return (
    <ClassicWindow
      title={isNew ? 'Nova Receita' : `Receita: ${recipe?.name ?? ''}`}
      icon={<ChefHat size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Save} label="Gravar" onClick={save} />
            {!isNew && recipe && (
              <span className="text-[11px] text-gray-700 ml-2">
                Custo do lote: <b className="text-[#1e3f66]">{fmt(recipe.theoretical_cost)}</b> ·
                Custo/dose: <b className="text-[#1e3f66]">{fmt(recipe.cost_per_yield_unit)}</b>
              </span>
            )}
          </div>
          <ClassicButton icon={ArrowLeft} label="Voltar à Lista" onClick={onBack} />
        </>
      }
    >
      <div className="p-4 bg-[#f0f0f0] h-full overflow-y-auto text-[11px] space-y-4">
        {/* Cabeçalho */}
        <div className="border border-[#a0a0a0] bg-white p-2">
          <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Identificação</h3>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex items-center"><label className="w-32 font-bold">Código *</label>
              <input value={form.code || ''} onChange={(e) => set({ code: e.target.value })} className={inputCls} /></div>
            <div className="flex items-center"><label className="w-32 font-bold">Nome *</label>
              <input value={form.name || ''} onChange={(e) => set({ name: e.target.value })} className={inputCls} /></div>
            <div className="flex items-center"><label className="w-32 font-bold">Produto Final *</label>
              <select value={form.final_item || ''} onChange={(e) => set({ final_item: Number(e.target.value) })} className={inputCls}>
                <option value="">— escolher artigo —</option>
                {items.map((i) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Área de Produção</label>
              <select value={form.area || ''} onChange={(e) => set({ area: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                <option value="">— sem área —</option>
                {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Rendimento (yield) *</label>
              <input type="number" value={form.yield_quantity ?? 1} onChange={(e) => set({ yield_quantity: e.target.value })} className="w-24 border border-[#a0a0a0] p-1" />
              <select value={form.yield_uom || ''} onChange={(e) => set({ yield_uom: Number(e.target.value) })} className="ml-2 border border-[#a0a0a0] p-1 bg-white">
                <option value="">unidade</option>
                {uoms.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Estado</label>
              <select value={form.status || 'DRAFT'} onChange={(e) => set({ status: e.target.value })} className={inputCls}>
                {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="flex items-center"><label className="w-32 font-bold">Prep. (min)</label>
              <input type="number" value={form.prep_time_mins ?? ''} onChange={(e) => set({ prep_time_mins: e.target.value ? Number(e.target.value) : null })} className="w-24 border border-[#a0a0a0] p-1" /></div>
            <div className="flex items-center"><label className="w-32 font-bold">Confeção (min)</label>
              <input type="number" value={form.cook_time_mins ?? ''} onChange={(e) => set({ cook_time_mins: e.target.value ? Number(e.target.value) : null })} className="w-24 border border-[#a0a0a0] p-1" /></div>
          </div>
        </div>

        {/* Componentes / Linhas */}
        {isNew ? (
          <div className="border border-[#a0a0a0] bg-[#fffbe6] p-3 text-gray-700">
            Grave a receita primeiro para adicionar ingredientes/componentes.
          </div>
        ) : (
          <div className="border border-[#a0a0a0] bg-white p-2">
            <h3 className="font-bold text-[#1e3f66] border-b border-[#a0a0a0] mb-2 pb-1">Componentes & Custeio</h3>
            <div className="flex flex-wrap items-end gap-2 mb-3 bg-[#f8f8f8] p-2 border border-[#e0e0e0]">
              <select value={line.component_item} onChange={(e) => setLine({ ...line, component_item: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                <option value="">— componente —</option>
                {items.map((i) => <option key={i.id} value={i.id}>[{i.code}] {i.name}</option>)}
              </select>
              <input placeholder="Qtd" type="number" value={line.quantity} onChange={(e) => setLine({ ...line, quantity: e.target.value })} className="border border-[#a0a0a0] p-1 w-20" />
              <select value={line.uom} onChange={(e) => setLine({ ...line, uom: e.target.value })} className="border border-[#a0a0a0] p-1 bg-white">
                <option value="">un</option>
                {uoms.map((u) => <option key={u.id} value={u.id}>{u.code}</option>)}
              </select>
              <input placeholder="Desperdício %" type="number" value={line.wastage_percentage} onChange={(e) => setLine({ ...line, wastage_percentage: e.target.value })} className="border border-[#a0a0a0] p-1 w-24" />
              <ClassicButton icon={Plus} label="Adicionar" onClick={addComponent} />
            </div>
            <ClassicGrid
              rowKey="id"
              data={recipe?.lines || []}
              columns={[
                { header: 'Cód.', accessor: 'component_code', width: '12%' },
                { header: 'Componente', accessor: 'component_name', width: '34%' },
                { header: 'Qtd', accessor: (r: any) => `${fmt(r.quantity)} ${r.uom_code || ''}`, width: '15%' },
                { header: 'Desperd.', accessor: (r: any) => `${r.wastage_percentage}%`, width: '10%' },
                { header: 'Qtd efetiva', accessor: (r: any) => fmt(r.effective_quantity), width: '13%' },
                { header: 'Custo', accessor: (r: any) => fmt(r.line_cost), width: '11%' },
                { header: '', accessor: (r: any) => <button onClick={() => delLine.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '5%' },
              ]}
            />
            <div className="flex justify-end mt-2 text-[12px] font-bold text-[#1e3f66] pr-2">
              Custo total do lote: {fmt(recipe?.theoretical_cost)}
            </div>
          </div>
        )}

        {/* Alergénios & Nutrição do produto final */}
        {form.final_item && <ProfilePanel itemId={Number(form.final_item)} />}
      </div>
    </ClassicWindow>
  );
}

export default function RecipesView() {
  const [mode, setMode] = useState<'list' | 'detail'>('list');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const { data: recipes = [], isLoading } = useRecipes();
  const del = useDeleteRecipe();

  const open = (id: number | null) => { setSelectedId(id); setMode('detail'); };

  if (mode === 'detail') return <RecipeDetail recipeId={selectedId} onBack={() => setMode('list')} />;

  const columns = [
    { header: 'Código', accessor: 'code', width: '13%' },
    { header: 'Receita', accessor: 'name', width: '27%' },
    { header: 'Produto Final', accessor: (r: Recipe) => r.final_item_name, width: '20%' },
    { header: 'Área', accessor: (r: Recipe) => r.area_name || '—', width: '13%' },
    { header: 'Estado', accessor: (r: Recipe) => STATUS_LABEL[r.status || 'DRAFT'], width: '11%' },
    { header: 'Custo/dose', accessor: (r: Recipe) => <b className="text-[#1e3f66]">{fmt(r.cost_per_yield_unit)}</b>, width: '11%' },
    {
      header: '', accessor: (r: Recipe) => (
        <button onClick={(e) => { e.stopPropagation(); if (confirm(`Apagar a receita ${r.name}?`)) del.mutate(r.id!); }} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>
      ), width: '5%',
    },
  ];

  return (
    <ClassicWindow
      title="Receitas / Fichas Técnicas"
      icon={<ChefHat size={14} className="text-gray-300" />}
      footer={
        <>
          <div className="flex items-center space-x-2">
            <ClassicButton icon={Plus} label="Nova Receita" onClick={() => open(null)} />
          </div>
          <div className="text-gray-600">Nº registos: {recipes.length}{isLoading ? ' (a carregar…)' : ''}</div>
        </>
      }
    >
      <ClassicGrid columns={columns} data={recipes} rowKey="id" onRowClick={(row) => open(row.id)} />
    </ClassicWindow>
  );
}
