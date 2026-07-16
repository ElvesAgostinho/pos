import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../../api/client';
import Window from './Window';
import TouchKeyboard from './TouchKeyboard';

/**
 * CONSULTA DE ARTIGO — procurar no catálogo INTEIRO, não no teclado.
 *
 * O teclado tem as teclas do dia-a-dia; o catálogo pode ter MILHARES de artigos e não
 * cabem todos em teclas. Quando o cliente pede o vinho que não está no teclado, o
 * empregado procura AQUI — por nome, código, código de barras ou PLU — e lança-o na
 * conta com um toque.
 *
 * A pesquisa é a MESMA do backoffice (Configuração POS › Artigos, parâmetro ?q= no
 * servidor): não se carrega o catálogo para o terminal, pergunta-se ao servidor.
 * O preço é o do servidor — o terminal nunca inventa preços.
 */
export default function ArticleSearch({ onPick, onClose }: {
  onPick: (item: any) => void;
  onClose: () => void;
}) {
  const [texto, setTexto] = useState('');
  const [busca, setBusca] = useState('');

  const { data: artigos = [], isFetching } = useQuery({
    queryKey: ['pos-art-search', busca],
    queryFn: async () => {
      const r = await apiClient.get('inventory/pos/articles/', {
        params: { q: busca, state: 'ACTIVE', module: 'SALE' },
      });
      const rows = (r.data?.results || r.data || []) as any[];
      return rows.slice(0, 60);          // 60 chegam para escolher; afina-se a pesquisa
    },
    enabled: busca.length >= 2,
  });

  const money = (v: any) => Number(v || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2 });

  return (
    <Window title="Consulta de Artigo" width={760} onClose={onClose} tone="#0f8b8d">
      <div className="flex flex-col bg-[#1a1a1a]" style={{ height: '62vh' }}>
        <div className="grid grid-cols-[110px_1fr_130px] bg-[#2b2b2b] text-white text-[15px] font-bold px-3 py-2">
          <span>Código</span><span>Artigo</span><span className="text-right">Preço</span>
        </div>

        <div className="flex-1 overflow-auto">
          {artigos.map((a: any) => (
            <button key={a.id} onClick={() => onPick(a)}
              className="w-full grid grid-cols-[110px_1fr_130px] px-3 py-2.5 text-left text-white
                text-[15px] border-b border-black/30 hover:bg-[#0f8b8d]/40 active:bg-[#0f8b8d]">
              <span className="text-white/60">{a.code}</span>
              <span className="truncate">{a.name}</span>
              <span className="text-right">{money(a.sale_price)}</span>
            </button>
          ))}
          {busca.length < 2 && (
            <div className="text-white/40 text-center py-10 text-[14px]">
              Escreva pelo menos 2 caracteres — nome, código, código de barras ou PLU.
            </div>
          )}
          {busca.length >= 2 && !isFetching && artigos.length === 0 && (
            <div className="text-white/40 text-center py-10 text-[14px]">Nenhum artigo encontrado.</div>
          )}
        </div>

        <TouchKeyboard valor={texto} setValor={(v: string) => { setTexto(v); if (v.length >= 2) setBusca(v); }}
          onOk={() => setBusca(texto)} />
      </div>
    </Window>
  );
}
