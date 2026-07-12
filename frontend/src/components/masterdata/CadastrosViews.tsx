import { useState } from 'react';
import type { ReactNode } from 'react';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Plus, Trash2, Coins, Globe, Landmark, Languages, Users } from 'lucide-react';
import { useCadList, useCadCreate, useCadDelete } from '../../hooks/useCadastros';
import type { CadEnt } from '../../api/cadastros';

interface Field { key: string; placeholder: string; width?: string; up?: boolean }
interface Col { header: string; key: string; width: string }

function Crud({ ent, title, icon, fields, cols, empty }: {
  ent: CadEnt; title: string; icon: ReactNode; fields: Field[]; cols: Col[]; empty: any;
}) {
  const { data = [] } = useCadList(ent);
  const create = useCadCreate(ent);
  const del = useCadDelete(ent);
  const [d, setD] = useState<any>(empty);
  const add = () => {
    const first = fields[0].key;
    if (!d[first]) { alert(`Preencha ${fields[0].placeholder}.`); return; }
    create.mutate(d, { onSuccess: () => setD(empty), onError: (e: any) => alert('Erro: ' + JSON.stringify(e?.response?.data)) });
  };
  return (
    <ClassicWindow title={title} icon={icon} footer={<div className="text-gray-600">{data.length} registo(s)</div>}>
      <div className="flex flex-col h-full">
        <div className="flex flex-wrap items-end gap-2 bg-[#f0f0f0] border-b border-[#a0a0a0] px-3 py-2 text-[11px]">
          {fields.map((f) => (
            <input key={f.key} placeholder={f.placeholder} value={d[f.key] ?? ''}
              onChange={(e) => setD({ ...d, [f.key]: f.up ? e.target.value.toUpperCase() : e.target.value })}
              className="border border-[#a0a0a0] p-1" style={{ width: f.width }} />
          ))}
          <ClassicButton icon={Plus} label="Adicionar" onClick={add} />
        </div>
        <div className="flex-1 overflow-hidden">
          <ClassicGrid rowKey="id" data={data} columns={[
            ...cols.map((c) => ({ header: c.header, accessor: (r: any) => r[c.key] ?? '—', width: c.width })),
            { header: '', accessor: (r: any) => <button onClick={() => del.mutate(r.id)} className="text-red-600 hover:text-red-800"><Trash2 size={12} /></button>, width: '8%' },
          ]} />
        </div>
      </div>
    </ClassicWindow>
  );
}

export const CurrenciesView = () => (
  <Crud ent="currencies" title="Moedas (Master Data)" icon={<Coins size={14} className="text-gray-300" />}
    empty={{ code: '', name: '', symbol: '', rate_to_base: '1' }}
    fields={[{ key: 'code', placeholder: 'Código (AOA)', width: '90px', up: true }, { key: 'name', placeholder: 'Nome' }, { key: 'symbol', placeholder: 'Símbolo', width: '70px' }, { key: 'rate_to_base', placeholder: 'Câmbio', width: '90px' }]}
    cols={[{ header: 'Código', key: 'code', width: '15%' }, { header: 'Nome', key: 'name', width: '45%' }, { header: 'Símbolo', key: 'symbol', width: '15%' }, { header: 'Câmbio', key: 'rate_to_base', width: '17%' }]} />
);
export const CountriesView = () => (
  <Crud ent="countries" title="Países (Master Data)" icon={<Globe size={14} className="text-gray-300" />}
    empty={{ code: '', name: '', phone_code: '' }}
    fields={[{ key: 'code', placeholder: 'Código (AO)', width: '90px', up: true }, { key: 'name', placeholder: 'Nome do país' }, { key: 'phone_code', placeholder: 'Indicativo', width: '90px' }]}
    cols={[{ header: 'Código', key: 'code', width: '18%' }, { header: 'País', key: 'name', width: '56%' }, { header: 'Indicativo', key: 'phone_code', width: '18%' }]} />
);
export const BanksView = () => (
  <Crud ent="banks" title="Bancos (Master Data)" icon={<Landmark size={14} className="text-gray-300" />}
    empty={{ code: '', name: '', swift: '' }}
    fields={[{ key: 'code', placeholder: 'Código', width: '100px', up: true }, { key: 'name', placeholder: 'Nome do banco' }, { key: 'swift', placeholder: 'SWIFT', width: '110px', up: true }]}
    cols={[{ header: 'Código', key: 'code', width: '18%' }, { header: 'Banco', key: 'name', width: '56%' }, { header: 'SWIFT', key: 'swift', width: '18%' }]} />
);
export const LanguagesView = () => (
  <Crud ent="languages" title="Idiomas (Master Data)" icon={<Languages size={14} className="text-gray-300" />}
    empty={{ code: '', name: '' }}
    fields={[{ key: 'code', placeholder: 'Código (pt-PT)', width: '110px' }, { key: 'name', placeholder: 'Idioma' }]}
    cols={[{ header: 'Código', key: 'code', width: '30%' }, { header: 'Idioma', key: 'name', width: '62%' }]} />
);
export const CustomersView = () => (
  <Crud ent="customers" title="Clientes (Master Data)" icon={<Users size={14} className="text-gray-300" />}
    empty={{ code: '', name: '', tax_id: '', phone: '', email: '' }}
    fields={[{ key: 'code', placeholder: 'Código', width: '90px', up: true }, { key: 'name', placeholder: 'Nome' }, { key: 'tax_id', placeholder: 'NIF', width: '110px' }, { key: 'phone', placeholder: 'Telefone', width: '110px' }, { key: 'email', placeholder: 'Email' }]}
    cols={[{ header: 'Código', key: 'code', width: '12%' }, { header: 'Nome', key: 'name', width: '32%' }, { header: 'NIF', key: 'tax_id', width: '16%' }, { header: 'Telefone', key: 'phone', width: '16%' }, { header: 'Email', key: 'email', width: '16%' }]} />
);
