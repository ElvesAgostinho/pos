import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import ClassicWindow from '../ui/ClassicWindow';
import ClassicButton from '../ui/ClassicButton';
import ClassicGrid from '../ui/ClassicGrid';
import { Eye, Check, FileSpreadsheet } from 'lucide-react';
import { apiClient } from '../../api/client';

/**
 * IMPORTAR DE OUTRO SISTEMA — o primeiro dia de quem vem de outro lado.
 *
 * Um hotel que muda de sistema não começa com uma casa vazia: já tem os artigos,
 * os clientes e as mesas, muitas vezes há anos. Este sistema sabia EXPORTAR
 * qualquer grelha (CSV e Excel, pelo ribbon) e não sabia importar nada —
 * escrever mil artigos à mão não é uma tarefa, é um motivo para não mudar de
 * sistema.
 *
 * O ecrã tem três passos porque a importação tem três momentos, e juntá-los é o
 * que faz uma importação correr mal:
 *   1. O FICHEIRO — o que se tem, como ele veio do outro sistema;
 *   2. AS COLUNAS — qual coluna alimenta qual campo. O sistema dá um palpite
 *      pelos nomes mais comuns; quem manda é quem está a importar;
 *   3. O QUE VAI ACONTECER — a simulação completa, linha a linha: quantos
 *      criam, quantos actualizam, e QUAIS ficam de fora e porquê, com o número
 *      da linha do ficheiro. Só depois disto é que o botão de gravar aparece.
 *
 * Correr o mesmo ficheiro outra vez não duplica nada: a chave é o código do
 * registo. Ninguém acerta no ficheiro à primeira — corrige-se e repete-se.
 */
export default function ImportarDadosView() {
  const [destino, setDestino] = useState('artigos');
  const [conteudo, setConteudo] = useState('');
  const [nomeFicheiro, setNomeFicheiro] = useState('');
  const [colunas, setColunas] = useState<Record<string, string>>({});
  const [previsao, setPrevisao] = useState<any>(null);
  const [resultado, setResultado] = useState<any>(null);
  const [erro, setErro] = useState('');
  const [aCorrer, setACorrer] = useState(false);

  const { data: destinos = [] } = useQuery<any[]>({
    queryKey: ['import-targets'],
    queryFn: async () => (await apiClient.get('data/import/targets/')).data,
  });
  const cfg = destinos.find((d: any) => d.key === destino);

  const escolherFicheiro = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setNomeFicheiro(f.name);
    setPrevisao(null); setResultado(null); setErro('');
    const leitor = new FileReader();
    leitor.onload = () => setConteudo(String(leitor.result || ''));
    // Lido como texto: o servidor trata da codificação (há ficheiros em UTF-8 e
    // há os que o Excel em português escreve, que são Windows-1252).
    leitor.readAsText(f, 'utf-8');
  };

  const correr = async (aplicar: boolean) => {
    if (!conteudo) { setErro('Escolha primeiro o ficheiro a importar.'); return; }
    setACorrer(true); setErro('');
    try {
      const r = await apiClient.post(`data/import/${aplicar ? '?apply=1' : ''}`, {
        target: destino, content: conteudo,
        columns: Object.keys(colunas).length ? colunas : undefined,
      });
      if (aplicar) { setResultado(r.data); setPrevisao(null); }
      else { setPrevisao(r.data); setColunas(r.data.colunas || {}); }
    } catch (e: any) {
      setErro(e?.response?.data?.detail || 'Não foi possível ler o ficheiro.');
    } finally { setACorrer(false); }
  };

  const dados = resultado || previsao;

  return (
    <ClassicWindow title="Importar de outro sistema"
      icon={<FileSpreadsheet size={14} className="text-gray-300" />}
      footer={<div className="text-gray-600">
        {dados
          ? `${dados.total} linha(s) no ficheiro · ${dados.criar} a criar · ${dados.actualizar} a actualizar · ${dados.recusadas?.length || 0} de fora`
          : 'Escolha o que vai importar e o ficheiro CSV exportado do outro sistema'}
      </div>}>
      <div className="p-2 space-y-2 h-full flex flex-col overflow-auto">

        {/* ── 1 · O QUE E DE ONDE ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-end gap-2 bg-[#EEF1F5] border border-[#E6E8EC] p-2 text-[11px]">
          <label className="flex items-center gap-1">O que está a importar:
            <select value={destino} className="border border-[#E6E8EC] p-1 bg-white"
              onChange={(e) => { setDestino(e.target.value); setColunas({}); setPrevisao(null); setResultado(null); }}>
              {destinos.map((d: any) => <option key={d.key} value={d.key}>{d.name}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-1">
            <input type="file" accept=".csv,.txt" onChange={escolherFicheiro}
              className="border border-[#E6E8EC] p-1 bg-white w-[260px]" />
          </label>
          <ClassicButton icon={Eye} label={aCorrer ? 'A ler…' : 'Ver o que vai acontecer'}
            onClick={() => correr(false)} disabled={!conteudo || aCorrer} />
          {/* O BOTÃO DE GRAVAR SÓ APARECE DEPOIS DA SIMULAÇÃO, de propósito:
              importar o cadastro de um hotel sem ver primeiro o que entra é o
              género de passo que ninguém devia poder dar por engano. */}
          {previsao && (
            <ClassicButton icon={Check}
              label={aCorrer ? 'A importar…' : `Importar (${previsao.criar + previsao.actualizar})`}
              onClick={() => correr(true)} disabled={aCorrer} />
          )}
          {nomeFicheiro && <span className="text-gray-600">Ficheiro: <b>{nomeFicheiro}</b></span>}
        </div>

        {erro && (
          <div className="bg-[#FEF2F2] border border-[#FCA5A5] text-[#B91C1C] p-2 text-[11px] whitespace-pre-line">{erro}</div>
        )}

        {resultado && (
          <div className="bg-[#F0FDF4] border border-[#86EFAC] text-[#15803D] p-2 text-[11px]">
            Importação feita: <b>{resultado.criar}</b> criado(s), <b>{resultado.actualizar}</b> actualizado(s).
            {resultado.recusadas?.length ? ` ${resultado.recusadas.length} linha(s) ficaram de fora — a lista está em baixo.` : ''}
            <div className="text-gray-600 mt-1">
              Correr o mesmo ficheiro outra vez não duplica nada: actualiza o que mudou e cria o que falta.
            </div>
          </div>
        )}

        {/* ── 2 · AS COLUNAS ──────────────────────────────────────────── */}
        {previsao && cfg && (
          <div className="bg-white border border-[#E6E8EC]">
            <div className="px-2 py-1 bg-[#EEF1F5] border-b border-[#E6E8EC] text-[11px] font-bold">
              Colunas — confirme o que alimenta o quê
            </div>
            <div className="p-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
              {cfg.fields.map((f: any) => (
                <label key={f.key} className="flex items-center gap-2">
                  <span className="w-[150px] text-[#111827]">
                    {f.label}{f.required && <b className="text-[#B91C1C]"> *</b>}:
                  </span>
                  <select value={colunas[f.key] || ''} className="border border-[#E6E8EC] p-1 bg-white flex-1"
                    onChange={(e) => setColunas({ ...colunas, [f.key]: e.target.value })}>
                    <option value="">(nenhuma)</option>
                    {(previsao.cabecalho || []).map((c: string) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </label>
              ))}
            </div>
            <div className="px-2 pb-2 text-[11px] text-gray-600">
              Mudou alguma? Carregue outra vez em <b>Ver o que vai acontecer</b> antes de importar.
            </div>
          </div>
        )}

        {/* ── 3 · O QUE VAI ACONTECER ─────────────────────────────────── */}
        {dados?.amostra?.length > 0 && (
          <div className="flex-1 min-h-[160px] overflow-hidden">
            <ClassicGrid rowKey="linha" data={dados.amostra} columns={[
              { header: 'Linha', accessor: 'linha', width: '12%' },
              { header: 'Código', accessor: 'valor', width: '22%' },
              { header: 'Nome', accessor: 'nome', width: '46%' },
              { header: 'O que faz', width: '20%',
                accessor: (r: any) => (
                  <span className={r.accao === 'cria' ? 'text-[#15803D] font-bold' : 'text-[#111827]'}>
                    {r.accao === 'cria' ? 'cria novo' : 'actualiza o que existe'}
                  </span>
                ) },
            ]} />
          </div>
        )}

        {/* ── O QUE FICOU DE FORA, e porquê ───────────────────────────── */}
        {dados?.recusadas?.length > 0 && (
          <div className="bg-white border border-[#FCA5A5]">
            <div className="px-2 py-1 bg-[#FEF2F2] border-b border-[#FCA5A5] text-[11px] font-bold text-[#B91C1C]">
              {dados.recusadas.length} linha(s) ficaram de fora
            </div>
            {/* O NÚMERO DA LINHA é o que importa: é por ele que a pessoa procura
                no ficheiro original. Uma lista de erros sem a linha obriga a
                adivinhar qual das mil é. */}
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-[#F1F2F4] text-left">
                  <th className="px-2 py-1 font-medium w-[70px]">Linha</th>
                  <th className="px-2 py-1 font-medium w-[140px]">Código</th>
                  <th className="px-2 py-1 font-medium">Porquê</th>
                </tr>
              </thead>
              <tbody>
                {dados.recusadas.slice(0, 100).map((r: any, i: number) => (
                  <tr key={i} className="border-t border-[#F1F2F4]">
                    <td className="px-2 py-1">{r.linha}</td>
                    <td className="px-2 py-1">{r.valor || '—'}</td>
                    <td className="px-2 py-1 text-[#B91C1C]">{r.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-2 text-[11px] text-gray-600 border-t border-[#F1F2F4]">
              Corrija estas linhas no ficheiro e importe outra vez — o que já entrou
              não se duplica.
            </div>
          </div>
        )}

        {!dados && !erro && (
          <div className="bg-white border border-[#E6E8EC] p-3 text-[11px] text-gray-600">
            <b>Como funciona:</b> exporte do outro sistema para CSV (é o que todos
            fazem), escolha aqui o ficheiro e carregue em <b>Ver o que vai acontecer</b>.
            Nada é gravado nesse passo: vê-se primeiro o que entra, o que é actualizado
            e o que fica de fora. Só depois aparece o botão de importar.
            <div className="mt-1">
              O ficheiro pode vir com ponto e vírgula ou com vírgula, em UTF-8 ou no
              formato do Excel português — o sistema trata disso. Os preços tanto podem
              vir "8.500,00" como "8500.00".
            </div>
          </div>
        )}
      </div>
    </ClassicWindow>
  );
}
