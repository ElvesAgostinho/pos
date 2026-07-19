import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import { aviso } from '../../ui/dialogo';
import { ComTeclado, CampoTatil, EscolhaTatil } from './CampoTatil';
import { useArrastar } from './useArrastar';
import EntityFormPos from './EntityFormPos';
import { IcoLupa, IcoVisto, IcoCruz, IcoLapis, IcoQuarto, IcoVoltar } from './Icons';

/**
 * PESQUISAR NAS ENTIDADES — o ficheiro de clientes, visto do balcão.
 *
 * É a porta das CONTAS CORRENTES: quem leva fiado, quanto deve, e quanto ainda pode
 * levar. Por isso a grelha mostra o SALDO — sem ele, o empregado lança em conta corrente
 * às cegas e só se descobre no fecho do mês que o cliente passou do limite há semanas.
 *
 * OS FILTROS existem porque um ficheiro real tem centenas de entidades: procurar por
 * nome quando só se sabe o NIF, ou por cidade quando são todos da mesma empresa, é o que
 * faz a diferença entre encontrar em dois toques ou desistir.
 *
 * SEM SCROLL na grelha: páginas, como no resto do terminal.
 */

const RELEVO = 'border-2 border-black shadow-[inset_0_2px_0_rgba(255,255,255,0.18),'
  + 'inset_0_-2px_0_rgba(0,0,0,0.55)] active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.6)]';
const CINZA = 'bg-gradient-to-b from-[#4a4a4a] to-[#242424]';
const POR_PAGINA = 8;

export default function EntitySearchPos({ onPick, onClose, titulo = 'Pesquisar nas Entidades' }: {
  onPick?: (e: any) => void;
  onClose: () => void;
  titulo?: string;
}) {
  const [f, setF] = useState<any>({ entity_type: '', city: '', email: '', name: '',
    tax_id: '', phone: '', code: '', id_number: '', country: '' });
  const [aplicado, setAplicado] = useState<any>({});
  const [sel, setSel] = useState<any | null>(null);
  const [pagina, setPagina] = useState(0);
  const [form, setForm] = useState<'' | 'NOVO' | 'EDITAR'>('');
  const { ref, pegar, pos } = useArrastar();

  const set = (k: string) => (v: any) => setF((o: any) => ({ ...o, [k]: v }));

  const { data: tipos = [] } = useQuery({
    queryKey: ['pos-entity-types'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/config/customer-types/');
        return (r.data?.results || r.data || []) as any[];
      } catch { return []; }
    },
  });

  // AS ENTIDADES — o servidor filtra (cada filtro é um parâmetro que ele já entende).
  const { data: linhas = [], isFetching, refetch } = useQuery({
    queryKey: ['pos-ent-busca', aplicado],
    queryFn: async () => {
      const params: any = {};
      Object.entries(aplicado).forEach(([k, v]) => { if (v) params[k] = v; });
      const r = await apiClient.get('pos/marketing/entities/', { params });
      return (r.data?.results || r.data || []) as any[];
    },
  });

  // OS SALDOS de conta corrente, para a coluna que importa.
  const { data: saldos = {} } = useQuery({
    queryKey: ['pos-cc-saldos'],
    queryFn: async () => {
      try {
        const r = await apiClient.get('pos/ops/current-accounts/');
        const rows = (r.data?.rows || r.data?.results || r.data || []) as any[];
        const m: Record<number, any> = {};
        rows.forEach((x: any) => { if (x.entity ?? x.id) m[x.entity ?? x.id] = x.balance ?? x.saldo; });
        return m;
      } catch { return {}; }
    },
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });
  const paginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const p = Math.min(pagina, paginas - 1);
  const vista = linhas.slice(p * POR_PAGINA, (p + 1) * POR_PAGINA);
  const pesquisar = () => { setAplicado({ ...f }); setPagina(0); setSel(null); };

  const COLS = 'grid-cols-[70px_150px_1fr_140px_130px_1fr_170px]';

  return (
    <ComTeclado>
      <div className="fixed inset-0 bg-black/60 flex items-start justify-center pt-3 z-[60]">
        <div ref={ref} className="w-[1560px] max-w-[97vw] h-[94vh] bg-[#2b2b2b]
          border-[3px] border-black shadow-2xl flex flex-col"
          style={pos ? { position: 'fixed', left: pos.x, top: pos.y } : undefined}>

          <div onMouseDown={pegar} onTouchStart={pegar}
            className="h-[58px] bg-gradient-to-b from-[#4a4a4a] to-[#2e2e2e] border-b-2 border-black
              flex items-center px-3 cursor-grab active:cursor-grabbing select-none flex-shrink-0">
            <span className="w-[46px] flex flex-col gap-[3px] opacity-45">
              <span className="h-[2px] bg-white rounded" />
              <span className="h-[2px] bg-white rounded" />
              <span className="h-[2px] bg-white rounded" />
            </span>
            <span className="flex-1 text-center text-white text-[23px] font-bold">{titulo}</span>
            <span className="w-[46px]" />
          </div>

          {/* ── FILTROS ── */}
          <div className="flex gap-1 p-1 flex-shrink-0">
            <div className="flex-1 grid grid-cols-3 gap-1">
              <EscolhaTatil label="Tipo de ent." valor={f.entity_type} onChange={set('entity_type')}
                opcoes={tipos.map((t: any) => ({ id: t.id, label: t.name }))} rotulo="w-[120px]" />
              <CampoTatil chave="fCidade" label="Cidade" valor={f.city} onChange={set('city')} rotulo="w-[110px]" />
              <CampoTatil chave="fEmail" label="E-mail" valor={f.email} onChange={set('email')} rotulo="w-[100px]" />

              <CampoTatil chave="fNome" label="Nome" valor={f.name} onChange={set('name')} rotulo="w-[120px]" />
              <CampoTatil chave="fNif" label="Nr. contrib." valor={f.tax_id} onChange={set('tax_id')}
                tipo="numero" rotulo="w-[110px]" />
              <CampoTatil chave="fTel" label="Telefone" valor={f.phone} onChange={set('phone')}
                tipo="numero" rotulo="w-[100px]" />

              <CampoTatil chave="fCod" label="Nr. cliente" valor={f.code} onChange={set('code')} rotulo="w-[120px]" />
              <CampoTatil chave="fId" label="Nr. de ident." valor={f.id_number} onChange={set('id_number')}
                rotulo="w-[110px]" />
              <CampoTatil chave="fPais" label="País" valor={f.country} onChange={set('country')} rotulo="w-[100px]" />
            </div>
            <button onClick={pesquisar}
              className={`w-[200px] rounded-[3px] flex flex-col items-center justify-center gap-1
                text-white ${RELEVO} ${CINZA}`}>
              <IcoLupa size={30} />
              <span className="text-[16px] font-bold">Pesquisar</span>
            </button>
          </div>

          {/* ── GRELHA ── */}
          <div className={`grid ${COLS} bg-[#1a1a1a] text-white text-[15px] font-bold px-3 py-2.5
            border-y-2 border-black flex-shrink-0`}>
            <span>Nr</span><span>Nr. contrib.</span><span>Nome</span><span>Telefone</span>
            <span>Cód. postal</span><span>Cidade</span>
            <span className="text-right">Saldo (Conta Corrente)</span>
          </div>

          <div className="flex-1 min-h-0">
            {isFetching && <div className="p-8 text-white/50 text-[16px] text-center">A procurar…</div>}
            {!isFetching && linhas.length === 0 && (
              <div className="p-8 text-white/45 text-[16px] text-center">
                Sem entidades. Preencha um filtro e prima Pesquisar — ou crie uma nova.
              </div>
            )}
            {vista.map((e: any) => (
              <button key={e.id} onClick={() => setSel(e)}
                onDoubleClick={() => onPick?.(e)}
                className={`w-full grid ${COLS} px-3 py-3 text-left text-[16px] border-b border-black/40
                  ${sel?.id === e.id ? 'bg-[#b39100] text-white' : 'text-white hover:bg-white/10'}`}>
                <span>{e.code || e.id}</span>
                <span>{e.tax_id || '—'}</span>
                <span className="truncate font-semibold">{e.name}</span>
                <span>{e.phone || '—'}</span>
                <span>{e.postal_code || '—'}</span>
                <span className="truncate">{e.city || '—'}</span>
                <span className={`text-right font-bold ${Number(saldos[e.id] || 0) > 0
                  ? 'text-[#ff8a80]' : ''}`}>{money(saldos[e.id])}</span>
              </button>
            ))}
          </div>

          {linhas.length > POR_PAGINA && (
            <div className="flex items-center justify-center gap-2 py-1 flex-shrink-0">
              <button onClick={() => setPagina(Math.max(0, p - 1))} disabled={p === 0}
                className={`w-[96px] h-[46px] rounded-[3px] flex items-center justify-center text-white
                  ${RELEVO} ${CINZA} disabled:opacity-25`}><IcoVoltar size={22} /></button>
              <span className="text-white text-[16px] font-bold px-3">
                {p + 1} / {paginas} · {linhas.length} entidades
              </span>
              <button onClick={() => setPagina(Math.min(paginas - 1, p + 1))} disabled={p >= paginas - 1}
                className={`w-[96px] h-[46px] rounded-[3px] flex items-center justify-center text-white
                  ${RELEVO} ${CINZA} disabled:opacity-25 rotate-180`}><IcoVoltar size={22} /></button>
            </div>
          )}

          {/* ── RODAPÉ ── */}
          <div className="grid grid-cols-5 gap-1 p-1 bg-black flex-shrink-0">
            <Rodape icon={<IcoQuarto size={24} />} label="Info.Hósp."
              on={!!sel} onClick={() => aviso(
                `${sel?.name}\n\nNIF: ${sel?.tax_id || '—'}\nTelefone: ${sel?.phone || '—'}\n`
                + `E-mail: ${sel?.email || '—'}\nCidade: ${sel?.city || '—'}\n`
                + `Saldo em conta corrente: ${money(saldos[sel?.id])} Kz`, 'Entidade')} />
            <Rodape icon={<span className="text-[26px] leading-none">+</span>} label="Novo"
              onClick={() => setForm('NOVO')} />
            <Rodape icon={<IcoLapis size={24} />} label="Editar"
              on={!!sel} onClick={() => setForm('EDITAR')} />
            <Rodape icon={<IcoVisto size={26} />} label="Selecionar" cor="#2ecc40"
              on={!!sel && !!onPick} onClick={() => onPick?.(sel)} />
            <Rodape icon={<IcoCruz size={26} />} label="Cancelar" cor="#e02020" onClick={onClose} />
          </div>
        </div>

        {form && (
          <EntityFormPos entidade={form === 'EDITAR' ? sel : null}
            onClose={() => setForm('')}
            onGravado={(e) => { setForm(''); setSel(e); refetch(); }} />
        )}
      </div>
    </ComTeclado>
  );
}

const Rodape = ({ icon, label, onClick, on = true, cor = '#ffffff' }: {
  icon: any; label: string; onClick: () => void; on?: boolean; cor?: string;
}) => (
  <button onClick={() => on && onClick()} disabled={!on}
    className={`h-[64px] rounded-[3px] flex items-center justify-center gap-3 text-white
      text-[17px] font-bold ${RELEVO} ${CINZA} disabled:opacity-25 disabled:cursor-not-allowed`}>
    <span style={{ color: cor }}>{icon}</span>{label}
  </button>
);
