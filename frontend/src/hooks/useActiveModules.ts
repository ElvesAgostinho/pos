import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';

export interface LicenseStatus { licensed: boolean; client?: string; license_number?: string; valid_until?: string; modules: string[]; }

// Estado da licença local (on-premises). Sem licença válida = sem acesso à plataforma.
export const useLicenseStatus = () =>
  useQuery({
    queryKey: ['licensing', 'status'],
    // Pedido LIMPO, fora do apiClient: a licença valida-se ANTES do login, e o
    // interceptor do apiClient cola sempre o token guardado no browser. Um token velho
    // fazia o DRF responder 401 e o ecrã lia isso como "servidor em baixo" — o servidor
    // estava de pé; o token é que estava podre.
    queryFn: async (): Promise<LicenseStatus> => {
      const base = (apiClient.defaults.baseURL || '/api/').replace(/\/?$/, '/');
      const r = await fetch(`${base}licensing/status/`);
      if (!r.ok) throw new Error(`licenca: ${r.status}`);
      return r.json();
    },
    staleTime: 60 * 1000,
    retry: false,
  });

// Funcionalidades (feature flags) ativas — licenciamento dentro do módulo.
export interface FeaturesResp { catalog: any[]; active: string[]; }
export const useFeatures = () =>
  useQuery({
    queryKey: ['licensing', 'features'],
    queryFn: async (): Promise<FeaturesResp> => (await apiClient.get('licensing/features/')).data,
    staleTime: 5 * 60 * 1000,
  });

export interface ActiveModules { active: string[]; core: string[]; catalog: any[]; }

/**
 * MÓDULOS ACTIVADOS PELA LICENÇA.
 *
 * ─── O QUE ACONTECEU ──────────────────────────────────────────────────────
 * O comentário dizia 'Cai para "tudo" em caso de erro'. A função NÃO fazia
 * isso — não tinha try/catch nenhum. Falhava a leitura, `data` ficava
 * indefinido, e quem a chamava escrevia `lic?.active || []`: uma lista vazia,
 * que quer dizer "não tem módulo nenhum licenciado".
 *
 * O resultado foi o dono abrir o Ambiente de Trabalho e O PMS TER
 * DESAPARECIDO da barra de tarefas. O PMS está licenciado, o servidor estava
 * de pé e respondia — bastou um pedido que não chegou (a máquina estava a
 * correr a suite de testes ao mesmo tempo) para um módulo pago sumir sem uma
 * palavra de explicação.
 *
 * ─── PORQUE NÃO SE "CAI PARA TUDO" ────────────────────────────────────────
 * Era o que o comentário prometia, e está errado: inventar uma licença é
 * mostrar a um cliente módulos que ele não comprou. O que se faz é LEMBRAR a
 * última resposta boa. É a única fonte honesta que existe — foi o servidor que
 * a deu, e um soluço de rede não a torna falsa.
 *
 * Só na PRIMEIRA vez, num computador que nunca conseguiu ler a licença, é que
 * não há nada para lembrar. Aí o erro sobe, e quem chama tem de o dizer em vez
 * de desenhar uma lista curta como se fosse a verdade.
 */
const MEMORIA_MODULOS = 'ultimos_modulos_licenciados';

/**
 * QUANTO TEMPO A MEMÓRIA VALE.
 *
 * A memória existe para cobrir um SOLUÇO: um pedido que não chega, segundos
 * de rede má. Para isso, sete dias são uma eternidade — e é de propósito,
 * porque uma casa pode ficar sem internet um fim-de-semana inteiro e a
 * recepção tem de continuar a trabalhar.
 *
 * O que ela NÃO pode é valer para sempre. O sistema vende-se por módulo: um
 * cliente que deixou de pagar o PMS não pode continuar a vê-lo só porque o
 * computador dele nunca mais falou com o servidor. Passado o prazo, a memória
 * deixa de contar e o ecrã diz que não conseguiu ler a licença — que é a
 * verdade, e é melhor do que uma licença antiga apresentada como actual.
 *
 * Qualquer leitura BOA reescreve a memória, por isso um downgrade chega
 * sozinho assim que houver rede.
 */
const PRAZO_DA_MEMORIA_MS = 7 * 24 * 60 * 60 * 1000;

export const useActiveModules = () =>
  useQuery({
    queryKey: ['licensing', 'active-modules'],
    queryFn: async (): Promise<ActiveModules> => {
      try {
        const d: ActiveModules = (await apiClient.get('licensing/active-modules/')).data;
        if (Array.isArray(d?.active)) {
          try {
            localStorage.setItem(MEMORIA_MODULOS,
              JSON.stringify({ active: d.active, em: Date.now() }));
          } catch { /* sem espaço */ }
        }
        return d;
      } catch (erro) {
        try {
          const guardado = JSON.parse(localStorage.getItem(MEMORIA_MODULOS) || 'null');
          const dentroDoPrazo = guardado?.em && (Date.now() - guardado.em) < PRAZO_DA_MEMORIA_MS;
          if (dentroDoPrazo && Array.isArray(guardado.active) && guardado.active.length) {
            return { active: guardado.active, core: [], catalog: [] };
          }
          // Fora do prazo (ou no formato antigo, sem data): apaga-se. Uma
          // licença velha guardada sem data não se consegue datar depois, e
          // mantê-la seria arriscar mostrar módulos que já não são do cliente.
          if (guardado) localStorage.removeItem(MEMORIA_MODULOS);
        } catch { /* valor estragado: trata-se como se não houvesse */ }
        throw erro;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

// Acessos do utilizador ATUAL (permissões por perfil). full=true → vê tudo.
// Em erro, cai para acesso total (fail-open) para não trancar ninguém.
export interface MyAccess { full: boolean; modules: string[]; screens: string[]; is_superuser: boolean; }
export const useMyAccess = () =>
  useQuery({
    queryKey: ['auth', 'access'],
    queryFn: async (): Promise<MyAccess> => {
      try { return (await apiClient.get('auth/access/')).data; }
      catch { return { full: true, modules: [], screens: [], is_superuser: false }; }
    },
    staleTime: 5 * 60 * 1000,
  });

// Nº de certificação AGT — vem SEMPRE de fiscal.FiscalConfig (a mesma fonte que já
// assina as faturas e o SAF-T), nunca de texto fixo no código. '0000' é o valor de
// fábrica (ainda não certificado) — mostra-se como tal, honestamente, não se esconde
// nem se finge um número. Assim que o PCC aplicar a certificação real (Sincronizar
// com o PCC), este hook reflete-a sozinho, em qualquer ecrã que o use.
export interface AgtCertificate { certificate_number: string; certified: boolean; environment?: string }
export const useAgtCertificate = () =>
  useQuery({
    queryKey: ['fiscal', 'certificate'],
    queryFn: async (): Promise<AgtCertificate> => {
      const r = await apiClient.get('fiscal/config/');
      const cfg = (r.data?.results || r.data || [])[0] || {};
      const num = cfg.certificate_number || '0000';
      return { certificate_number: num, certified: num !== '0000', environment: cfg.environment };
    },
    staleTime: 60 * 1000,
  });
