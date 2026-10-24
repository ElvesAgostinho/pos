import { useEffect, useState } from 'react';
import { apiClient as axios } from '../api/client';

/**
 * VERSÕES — o que os clientes veem ao "Sincronizar com o PCC".
 *
 * Publicar aqui uma versão nova (número + link do .exe + o que mudou) é o que faz
 * o Diagnóstico de CADA cliente mostrar "Atualização disponível" na próxima
 * sincronização. A descarga fica automática para o cliente; correr o instalador
 * por cima continua a ser manual — nunca aplicar sozinho em cima de um serviço
 * do Windows a correr.
 */
export default function Versoes() {
  const [releases, setReleases] = useState<any[]>([]);
  const [version, setVersion] = useState('');

  /**
   * O NÚMERO DA VERSÃO, TIRADO DO QUE FOR COLADO.
   *
   * O número vive numa linha de código (`APP_VERSION = '1.1.0'`, em
   * core/support.py) e o passo anterior é ir lá acima. É natural copiar a linha
   * inteira — foi o que aconteceu. Ela tem 21 caracteres, o campo aceita 20, e
   * o browser respondia com a sua própria mensagem: "Certifique-se de que este
   * campo não tenha mais de 20 caracteres". Nem diz QUAL campo, nem o que devia
   * lá estar. Quem a lê fica a saber que algo é comprido de mais e mais nada.
   *
   * Em vez de recusar, tira-se dali o número: é o que a pessoa queria dizer, e
   * não há outra leitura possível. Colar `APP_VERSION = '1.1.0'`, `'1.1.0'`,
   * `v1.1.0` ou `1.1.0 ` dá sempre 1.1.0.
   */
  const limparVersao = (bruto: string) => {
    const m = bruto.match(/(\d+(?:\.\d+)+)/);        // o primeiro 1.2 / 1.2.3 que apareça
    return (m ? m[1] : bruto.replace(/[^0-9.]/g, '')).slice(0, 20);
  };
  const [downloadUrl, setDownloadUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchReleases = async () => {
    try {
      const r = await axios.get('clm/releases/');
      setReleases(r.data?.results || r.data || []);
    } catch (err) {
      console.error('Error fetching releases:', err);
    }
  };
  useEffect(() => { fetchReleases(); }, []);

  // O FICHEIRO DA VERSÃO, carregado aqui.
  //
  // Este ecrã pedia "o link de descarga" e mais nada. Só que o link não existe
  // até alguém pôr o ficheiro algures na internet — e quem publica a versão é
  // quem faz o produto, não um administrador de sistemas. O campo pedia uma
  // coisa que o próprio sistema não dava maneira de produzir, e a publicação
  // ficava por aí.
  //
  // Agora escolhe-se o ficheiro e o PCC guarda-o no volume dele (sobrevive a um
  // redeploy) e gera o endereço sozinho. Quem já tem onde alojar continua a
  // poder colar o link — não se tirou nada a ninguém.
  const [ficheiro, setFicheiro] = useState<File | null>(null);

  const publicar = async () => {
    if (!version.trim()) { alert('Indique a versão (ex.: 1.1.0).'); return; }
    if (!/^\d+(\.\d+)+$/.test(version.trim())) {
      alert(`"${version}" não é um número de versão.\n\nEscreva só o número, como está `
        + `em backend/core/support.py — por exemplo 1.1.0.`);
      return;
    }
    if (!ficheiro && !downloadUrl.trim()) {
      alert('Escolha o ficheiro da versão (o .zip da atualização), ou cole o link de '
        + 'onde ele já está alojado.');
      return;
    }
    setBusy(true);
    try {
      if (ficheiro) {
        // Com ficheiro vai como formulário (multipart); o link é gerado no
        // servidor a partir do ficheiro guardado.
        const fd = new FormData();
        fd.append('version', version.trim());
        fd.append('package', ficheiro);
        fd.append('release_notes', notes);
        if (downloadUrl.trim()) fd.append('download_url', downloadUrl.trim());
        await axios.post('clm/releases/', fd);
      } else {
        await axios.post('clm/releases/', {
          version: version.trim(), download_url: downloadUrl.trim(), release_notes: notes,
        });
      }
      setVersion(''); setDownloadUrl(''); setNotes(''); setFicheiro(null);
      await fetchReleases();
    } catch (err: any) {
      alert(err?.response?.data?.version?.[0] || err?.response?.data?.detail || 'Erro ao publicar.');
    } finally {
      setBusy(false);
    }
  };

  const apagar = async (id: number) => {
    if (!confirm('Apagar esta versão? Deixa de ser a que os clientes veem ao sincronizar.')) return;
    try {
      await axios.delete(`clm/releases/${id}/`);
      await fetchReleases();
    } catch {
      alert('Erro ao apagar.');
    }
  };

  const atual = releases[0]; // ordenado por -created_at no backend

  return (
    <div className="flex-1 flex flex-col h-full bg-[#F7FAFA] text-[12px]">
      <div className="flex items-center px-2 py-1 bg-[#EEF4F5] border-b border-[#7FA9B1]">
        <span className="font-bold text-gray-700">Versões publicadas</span>
      </div>

      <div className="p-4 space-y-4 overflow-auto">
        {atual && (
          <div className="bg-white border border-[#7FA9B1] p-3 max-w-2xl">
            <div className="text-[11px] text-gray-500 mb-1">Versão que os clientes recebem AGORA ao sincronizar:</div>
            <div className="font-bold text-[15px]">v{atual.version}</div>
          </div>
        )}

        <div className="bg-white border border-[#7FA9B1] p-4 max-w-2xl">
          <div className="font-bold mb-3 text-gray-700">Publicar versão nova</div>
          <div className="space-y-2">
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">Versão (ex.: 1.1.0)</label>
              <input value={version} onChange={(e) => setVersion(limparVersao(e.target.value))}
                className="w-full border border-[#7FA9B1] px-2 py-1" placeholder="1.1.0" />
              <div className="text-[10px] text-gray-500 mt-0.5 mb-2">
                Só o número, como está em <code>backend/core/support.py</code>. Se colar a
                linha toda (<code>APP_VERSION = '1.1.0'</code>), fica só o <b>1.1.0</b>.
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">
                Ficheiro da versão — o <b>.zip</b> gerado por <code>build_atualizacao.ps1</code>
              </label>
              <input type="file" accept=".zip,.exe"
                onChange={(e) => setFicheiro(e.target.files?.[0] || null)}
                className="w-full border border-[#7FA9B1] px-2 py-1 bg-white" />
              <div className="text-[10px] text-gray-500 mt-0.5 mb-2">
                Está em <code>instalador\Output\</code>. O PCC guarda-o e cria o link de
                descarga sozinho — não precisa de o alojar em lado nenhum.
                {ficheiro && <b className="text-[#0B5B63]"> Escolhido: {ficheiro.name}</b>}
              </div>

              {/* O RÓTULO DIZIA SÓ ".exe" — e era precisamente o .exe que DESLIGAVA a
                  actualização de um clique. Quem publicasse uma versão a seguir à
                  letra do ecrã deixava todos os clientes a ter de correr o
                  instalador completo à mão, sem perceber porquê. O campo é o
                  mesmo; o que muda é dizer o que cada escolha faz. */}
              <label className="block text-[11px] text-gray-600 mb-0.5">
                …ou cole um link, se já tiver o ficheiro alojado noutro sítio
              </label>
              <input value={downloadUrl} onChange={(e) => setDownloadUrl(e.target.value)}
                className="w-full border border-[#7FA9B1] px-2 py-1" placeholder="https://.../MwanaLodge-Update-1.1.0.zip" />
              <div className="text-[10px] text-gray-500 mt-0.5">
                Com um <b>.zip</b>, o cliente carrega em "Atualizar agora" e o sistema trata de
                tudo — sem reinstalar e sem perder configuração. Com um <b>.exe</b>, ele tem de
                descarregar e correr o instalador à mão.
              </div>
            </div>
            <div>
              <label className="block text-[11px] text-gray-600 mb-0.5">O que mudou (aparece no aviso do cliente)</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full border border-[#7FA9B1] px-2 py-1" />
            </div>
            <button onClick={publicar} disabled={busy}
              className="px-4 py-1.5 bg-[#5C8891] text-white font-bold disabled:opacity-50">
              {busy ? 'A publicar…' : 'Publicar'}
            </button>
          </div>
        </div>

        <div className="bg-white border border-[#7FA9B1] max-w-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-b from-[#FFFFFF] to-[#EEF4F5] border-b border-[#7FA9B1] text-gray-700">
                <th className="py-1 px-2 border-r border-[#EEF4F5] font-normal">Versão</th>
                <th className="py-1 px-2 border-r border-[#EEF4F5] font-normal">Publicada em</th>
                <th className="py-1 px-2 border-r border-[#EEF4F5] font-normal">Por</th>
                <th className="py-1 px-2 font-normal w-16"></th>
              </tr>
            </thead>
            <tbody>
              {releases.map((r) => (
                <tr key={r.id} className="border-b border-[#F7FAFA] hover:bg-[#F7FAFA]">
                  <td className="py-1 px-2 border-r border-[#F7FAFA] font-bold">v{r.version}</td>
                  <td className="py-1 px-2 border-r border-[#F7FAFA]">{new Date(r.created_at).toLocaleString('pt-PT')}</td>
                  <td className="py-1 px-2 border-r border-[#F7FAFA]">{r.created_by || '—'}</td>
                  <td className="py-1 px-2 text-center">
                    <button onClick={() => apagar(r.id)} className="text-[#8C2B1F] hover:underline">Apagar</button>
                  </td>
                </tr>
              ))}
              {releases.length === 0 && (
                <tr><td colSpan={4} className="py-4 px-2 text-center text-gray-400">Nenhuma versão publicada ainda.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
