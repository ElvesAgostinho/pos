import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi, tokenStore } from '../api/auth';
import { apiClient } from '../api/client';
import { getAppearance } from '../config/appearance';
import { TOKENS, RADIUS, shade } from '../config/theme';
import { User, Lock, LogIn, Eye, EyeOff, Settings, Building2, X, Wifi, KeyRound } from 'lucide-react';

/**
 * INÍCIO DE SESSÃO — o primeiro ecrã, e o único que alguns clientes mostram a
 * visitas.
 *
 * Era uma janela cinzenta com barra de título, relevos e botões de sistema
 * operativo: lia-se como um programa instalado em 2004. O conteúdo estava certo
 * — empresa, utilizador, password, memorizar, repor, estado do servidor — e por
 * isso NADA disso saiu daqui. O que mudou foi a moldura: fotografia do hotel a
 * ocupar o ecrã, um cartão de vidro por cima, campos com ícone e uma só acção
 * em destaque.
 *
 * A fotografia é a do CLIENTE (Administração → Aparência → imagem de fundo).
 * Sem ela não se inventa uma imagem de marca nenhuma: fica um fundo próprio,
 * desenhado em CSS a partir da cor da instalação, que continua a parecer
 * deliberado em vez de inacabado.
 */
const CustomerLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState(() => localStorage.getItem('ui_last_user') || '');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(() => !!localStorage.getItem('ui_last_user'));
  // A caixa tem de se lembrar do que ficou escolhido — senão o dono liga-a, sai,
  // volta, e encontra-a desligada sem nada ter acontecido.
  const [autoLogin, setAutoLogin] = useState(() => tokenStore.entradaAutomaticaLigada());
  // Enquanto se tenta entrar sozinho não se mostra o formulário: mostrar o
  // ecrã de login e depois saltar dele é uma piscadela feia, e dá a impressão
  // de que falhou alguma coisa.
  const [aEntrarSozinho, setAEntrarSozinho] = useState(() => tokenStore.queremosEntrarSozinhos());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState(false);
  const [online, setOnline] = useState<boolean | null>(null);

  // O logótipo/nome "Aparência" (ui_login_logo) é uma personalização POR APARELHO,
  // em localStorage — não chega sozinha ao logótipo real da empresa (Administração →
  // Empresa), que fica na base. Sem isto, o login mostrava sempre o "ML" de fábrica
  // em qualquer terminal onde não se tivesse carregado o MESMO ficheiro à mão.
  type Marca = { name: string; company_name: string; logo_url: string; login_bg_url: string };
  const [marca, setMarca] = useState<Marca | null>(null);
  useEffect(() => {
    apiClient.get('platform/branding/').then((r) => setMarca(r.data)).catch(() => {});
  }, []);

  // O nome REAL da empresa (Administração → Empresa) tem prioridade sobre a
  // personalização por aparelho — essa é só um placeholder de fábrica até o
  // hotel estar configurado. Sem isto, o dropdown "Empresa" mostrava sempre
  // "System Mwana Lodge" (o nome do PRODUTO), nunca o nome do cliente.
  // O QUE SE VÊ AQUI É O HOTEL, não uma personalização deste computador.
  //
  // O nome, o logótipo e a imagem de fundo vêm da ficha do hotel (Parâmetros do
  // Sistema → Empresa), gravada no servidor. A "Aparência" em localStorage é
  // anterior a isto e só se usa como último recurso: era por aparelho, o que no
  // ecrã de ENTRADA nunca podia funcionar — entra-se por qualquer posto da casa
  // e um computador acabado de ligar mostrava o nome de fábrica do produto em
  // vez do nome do cliente.
  const company = marca?.name || getAppearance('companyName');
  // Por baixo do nome do hotel, a empresa-mãe (a entidade legal). O "ML" que
  // estava aqui era o nome curto do PRODUTO, igual em todas as instalações: não
  // dizia nada a quem entra.
  const subtitulo = marca?.company_name && marca.company_name !== marca.name
    ? marca.company_name
    : getAppearance('erpName');
  const welcome = getAppearance('welcome');
  const logo = marca?.logo_url || getAppearance('logo') || '';
  const loginBg = marca?.login_bg_url || getAppearance('loginBg');
  const barColor = getAppearance('barColor') || TOKENS.accent;

  /**
   * ENTRAR AUTOMATICAMENTE — ou limpar e mostrar o formulário.
   *
   * Isto apagava SEMPRE a sessão ao abrir a página, o que tornava a entrada
   * automática impossível por construção — a caixa no ecrã nunca passou de
   * decoração. Agora: se o dono pediu para entrar sozinho e a sessão guardada
   * ainda é renovável, entra-se. Se a renovação falhar (sessão expirada a
   * sério), limpa-se e mostra-se o formulário — nunca se finge que se entrou.
   *
   * A sessão do TERMINAL POS limpa-se sempre: é outra identidade (o empregado
   * de mesa), e entrar no backoffice não pode arrastar a conta dele.
   */
  useEffect(() => {
    let vivo = true;
    tokenStore.clearPos();
    if (!tokenStore.queremosEntrarSozinhos()) {
      tokenStore.clearBackoffice();
      setAEntrarSozinho(false);
      return;
    }
    authApi.renovarSessao().then((ok) => {
      if (!vivo) return;
      if (ok) navigate('/backoffice');
      else { tokenStore.clearBackoffice(); setAEntrarSozinho(false); }
    });
    return () => { vivo = false; };
  }, [navigate]);
  // Testa a ligação ao servidor (barra de estado).
  useEffect(() => {
    let alive = true;
    apiClient.get('licensing/status/').then(() => alive && setOnline(true)).catch((e) => {
      if (alive) setOnline(!!e?.response); // responde (mesmo 401/404) = servidor online
    });
    return () => { alive = false; };
  }, []);

  // TROCA FORÇADA: a caixa "Obrigar a mudar a password" da ficha do utilizador viaja
  // no login — o ecrã PARA aqui até ele a mudar. É assim que se entrega um utilizador
  // novo com password provisória sem ela ficar a viver para sempre.
  const [trocar, setTrocar] = useState(false);
  const [novaPw, setNovaPw] = useState('');
  const [confirmaPw, setConfirmaPw] = useState('');

  // ESQUECI-ME DA PASSWORD: o dono pede ao fornecedor um código (PCC → Acessos →
  // "Gerar código de reposição"), 30 min de validade, uso único. Sem isto, repor
  // um acesso perdido exigia PowerShell na máquina do cliente — agora é só isto.
  const [showReset, setShowReset] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [resetPw, setResetPw] = useState('');
  const [resetPw2, setResetPw2] = useState('');
  const [resetMsg, setResetMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetMsg(null);
    if (resetPw !== resetPw2) { setResetMsg({ ok: false, text: 'As duas passwords não coincidem.' }); return; }
    if (resetPw.length < 8) { setResetMsg({ ok: false, text: 'Mínimo 8 caracteres.' }); return; }
    setResetLoading(true);
    try {
      const r = await apiClient.post('licensing/reset-owner-password/', { code: resetCode.trim(), new_password: resetPw });
      setResetMsg({ ok: true, text: r.data?.detail || 'Password reposta.' });
      setResetCode(''); setResetPw(''); setResetPw2('');
    } catch (err: any) {
      setResetMsg({ ok: false, text: err?.response?.data?.detail || 'Não foi possível repor a password.' });
    } finally { setResetLoading(false); }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const resp = await authApi.backofficeLogin(username, password);
      if (remember) localStorage.setItem('ui_last_user', username); else localStorage.removeItem('ui_last_user');
      // Só AQUI se liga a entrada automática: ela depende de haver uma sessão
      // guardada, e só agora existe uma.
      tokenStore.definirEntradaAutomatica(autoLogin);
      if ((resp as any)?.must_change_password) { setTrocar(true); return; }
      navigate('/backoffice');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Não foi possível iniciar sessão. Verifique as credenciais.');
    } finally { setLoading(false); }
  };

  const handleTrocarPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (novaPw !== confirmaPw) return setError('A nova palavra-passe e a confirmação não coincidem.');
    setLoading(true);
    try {
      await apiClient.post('auth/change-password/', { current_password: password, new_password: novaPw });
      navigate('/backoffice');
    } catch (err: any) {
      const d = err?.response?.data;
      setError(d?.detail || 'Não foi possível alterar a palavra-passe.');
    } finally { setLoading(false); }
  };

  // ── vocabulário visual do ecrã ───────────────────────────────────────────
  const campo = 'w-full h-11 pl-10 pr-3 text-[14px] text-[#111827] bg-white border border-[#E6E8EC]'
    + ' outline-none transition-shadow placeholder:text-[#9CA3AF]'
    + ' focus:border-[#2563EB] focus:ring-2 focus:ring-[#DBEAFE]';
  const rotulo = 'block text-[12px] font-medium text-[#6B7280] mb-1.5';
  const botaoClaro = 'h-10 px-4 text-[13px] font-medium text-[#374151] bg-white border border-[#E6E8EC]'
    + ' hover:bg-[#F3F4F6] transition-colors';

  /** Campo com ícone à esquerda — o mesmo desenho nos três sítios onde aparece. */
  const Campo = ({ icone, children }: { icone: React.ReactNode; children: React.ReactNode }) => (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] pointer-events-none">{icone}</span>
      {children}
    </div>
  );

  if (aEntrarSozinho) {
    return (
      <div className="h-screen w-full flex items-center justify-center text-white"
        style={{ background: `linear-gradient(155deg, ${shade(barColor, -32)} 0%, #070D1A 100%)`,
                 fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}>
        <div className="flex items-center gap-3 text-[15px]">
          <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          A retomar a sua sessão…
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col md:flex-row overflow-hidden"
      style={{ fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif" }}>

      {/* ══ ESQUERDA: a imagem, de alto a baixo ════════════════════════════════
          Não é um cartão pousado no meio do ecrã: a fotografia ocupa a sua
          metade inteira, sem margem nem canto, e o formulário ocupa a outra.
          A fotografia é a do CLIENTE (Administração → Aparência). Sem ela fica
          um fundo construído a partir da cor da instalação — nunca uma imagem
          de marca que não é dele. */}
      <div className="relative hidden md:flex md:w-[46%] lg:w-[42%] flex-shrink-0 flex-col justify-between p-12 text-white overflow-hidden">
        {loginBg ? (
          <>
            <img src={loginBg} alt="" className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0" style={{ background: 'linear-gradient(160deg, rgba(8,15,30,0.80) 0%, rgba(8,15,30,0.55) 50%, rgba(8,15,30,0.88) 100%)' }} />
          </>
        ) : (
          <>
            <div className="absolute inset-0" style={{ background: `linear-gradient(155deg, ${shade(barColor, -32)} 0%, ${shade(barColor, -58)} 58%, #070D1A 100%)` }} />
            <div className="absolute inset-0 opacity-75" style={{
              background: `radial-gradient(70% 55% at 15% 8%, ${shade(barColor, 20)}55 0%, transparent 72%),`
                + `radial-gradient(60% 50% at 95% 90%, ${shade(barColor, 6)}4D 0%, transparent 75%)`,
            }} />
          </>
        )}

        {/* Marca */}
        <div className="relative">
          {logo
            ? <img src={logo} alt="" className="max-h-16 max-w-[190px] object-contain" />
            : <span className="w-14 h-14 flex items-center justify-center bg-white/12 border border-white/20"
                style={{ borderRadius: RADIUS.md }}><Building2 size={28} /></span>}
        </div>

        <div className="relative">
          <div className="text-[34px] lg:text-[40px] font-semibold leading-[1.1] tracking-tight">{company}</div>
          <div className="text-[14px] text-white/55 mt-2">{subtitulo}</div>
          <p className="text-[15px] leading-relaxed text-white/75 mt-6 max-w-[380px]">{welcome}</p>
        </div>

        {/* Estado da instalação — a mesma informação da antiga barra de estado,
            agora onde não concorre com o formulário. */}
        <dl className="relative space-y-2.5 text-[12.5px] max-w-[380px]">
          <Linha rotulo="Servidor" valor="localhost:8000" />
          <Linha rotulo="Base de dados" valor="ERP_2026" />
          <Linha rotulo="Versão" valor="1.0.0" />
          <div className="flex items-center justify-between gap-3 pt-2.5 border-t border-white/10">
            <span className="text-white/55 flex items-center gap-1.5"><Wifi size={13} />Ligação</span>
            <span className="flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full" style={{
                background: online === null ? '#9CA3AF' : online ? '#22C55E' : '#F87171',
              }} />
              {online === null ? 'a verificar…' : online ? 'Online' : 'Offline'}
            </span>
          </div>
        </dl>
      </div>

      {/* ══ DIREITA: as credenciais ═══════════════════════════════════════════
          Ecrã estreito (telemóvel/tablet ao alto) não tem duas metades: a da
          esquerda esconde-se e esta fica com tudo, com a marca por cima para o
          utilizador continuar a saber em que sistema está a entrar. */}
      <div className="flex-1 bg-white relative flex items-center justify-center px-6 sm:px-10 lg:px-16 py-10 overflow-auto">
        <div className="w-full max-w-[460px]">
          <div className="md:hidden mb-8 flex items-center gap-3">
            {logo
              ? <img src={logo} alt="" className="max-h-10 max-w-[120px] object-contain" />
              : <span className="w-10 h-10 flex items-center justify-center text-white" style={{ background: barColor, borderRadius: RADIUS.sm }}><Building2 size={20} /></span>}
            <div>
              <div className="text-[16px] font-semibold text-[#111827] leading-tight">{company}</div>
              <div className="text-[12px] text-[#9CA3AF]">{subtitulo}</div>
            </div>
          </div>
          <button onClick={() => setConfig(true)} title="Configurações de ligação"
            className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-[#9CA3AF] hover:text-[#2563EB] hover:bg-[#EFF6FF] transition-colors"
            style={{ borderRadius: RADIUS.sm }}>
            <Settings size={16} />
          </button>

          {trocar ? (
            /* TROCA OBRIGATÓRIA: o gestor marcou "Obrigar a mudar a password" — não
               se entra sem a trocar. A caixa desliga-se sozinha ao gravar. */
            <form onSubmit={handleTrocarPassword} className="space-y-5">
              <div>
                <h1 className="text-[28px] font-semibold text-[#111827] tracking-tight">Defina a sua palavra-passe</h1>
                <p className="text-[13px] text-[#6B7280] mt-1.5">
                  A sua conta foi entregue com uma palavra-passe provisória. Defina a sua antes de continuar.
                </p>
              </div>
              <div>
                <label className={rotulo}>Nova palavra-passe</label>
                <Campo icone={<Lock size={16} />}>
                  <input type="password" autoFocus value={novaPw} onChange={(e) => setNovaPw(e.target.value)}
                    className={campo} style={{ borderRadius: RADIUS.sm }} />
                </Campo>
              </div>
              <div>
                <label className={rotulo}>Confirmar</label>
                <Campo icone={<Lock size={16} />}>
                  <input type="password" value={confirmaPw} onChange={(e) => setConfirmaPw(e.target.value)}
                    className={campo} style={{ borderRadius: RADIUS.sm }} />
                </Campo>
              </div>
              {error && <Erro texto={error} />}
              <button type="submit" disabled={loading || novaPw.length < 6}
                className="w-full h-11 text-[14px] font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: barColor, borderRadius: RADIUS.sm }}>
                {loading ? 'A gravar…' : 'Gravar e entrar'}
              </button>
              <p className="text-[12px] text-[#9CA3AF]">Mínimo 6 caracteres, diferente da atual.</p>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5">
              <div>
                <h1 className="text-[28px] font-semibold text-[#111827] tracking-tight">Início de sessão</h1>
                <p className="text-[14px] text-[#6B7280] mt-2">Entre com as suas credenciais para continuar.</p>
              </div>

              <div>
                <label className={rotulo}>Empresa</label>
                <Campo icone={<Building2 size={16} />}>
                  <select className={`${campo} appearance-none cursor-pointer`} style={{ borderRadius: RADIUS.sm }}>
                    <option>{company}</option>
                  </select>
                </Campo>
              </div>

              <div>
                <label className={rotulo}>Utilizador</label>
                <Campo icone={<User size={16} />}>
                  <input autoFocus value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="o seu utilizador" className={campo} style={{ borderRadius: RADIUS.sm }} />
                </Campo>
              </div>

              <div>
                <label className={rotulo}>Palavra-passe</label>
                <Campo icone={<Lock size={16} />}>
                  <input type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••" className={`${campo} pr-11`} style={{ borderRadius: RADIUS.sm }} />
                  <button type="button" onClick={() => setShowPw((s) => !s)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] hover:text-[#374151] transition-colors">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </Campo>
              </div>

              <div className="flex items-center justify-between gap-3 text-[13px] flex-wrap">
                <div className="flex items-center gap-4 text-[#374151]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    Memorizar
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer"
                    title="Da próxima vez entra sozinho, sem pedir a palavra-passe. Terminar sessão desliga isto.">
                    <input type="checkbox" checked={autoLogin} onChange={(e) => setAutoLogin(e.target.checked)} />
                    Entrar automaticamente
                  </label>
                </div>
                <button type="button" onClick={() => { setShowReset(true); setResetMsg(null); }}
                  className="flex items-center gap-1.5 text-[#2563EB] hover:underline">
                  <KeyRound size={13} />Esqueci-me da password
                </button>
              </div>

              {error && <Erro texto={error} />}

              <button type="submit" disabled={loading || !username}
                className="w-full h-11 flex items-center justify-center gap-2 text-[14px] font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: barColor, borderRadius: RADIUS.sm }}>
                <LogIn size={16} />{loading ? 'A entrar…' : 'Entrar'}
              </button>
            </form>
          )}
          </div>
        </div>

      {/* Diálogo Configurações */}
      {config && (
        <Modal titulo="Configurações de ligação" icone={<Settings size={15} />} cor={barColor} onClose={() => setConfig(false)}>
          <div className="p-5 space-y-3 text-[13px]">
            <Row label="Servidor SQL / API" value="localhost:8000" />
            <Row label="Base de dados" value="ERP_2026" />
            <Row label="Idioma" value="Português (Angola)" />
            <div className="flex items-center justify-between pt-1">
              <span className="flex items-center gap-1.5 text-[13px] text-[#374151]">
                <Wifi size={14} className={online ? 'text-[#16A34A]' : 'text-[#B91C1C]'} />
                {online ? 'Servidor acessível' : 'Sem ligação'}
              </span>
              <button onClick={() => { setOnline(null); apiClient.get('licensing/status/').then(() => setOnline(true)).catch((e) => setOnline(!!e?.response)); }}
                className={botaoClaro} style={{ borderRadius: RADIUS.sm }}>Testar ligação</button>
            </div>
            <p className="text-[12px] text-[#9CA3AF] pt-1">
              Para personalizar logótipo, imagem de fundo e cores use Administração → Aparência.
            </p>
          </div>
        </Modal>
      )}

      {/* Diálogo "Esqueci-me da password" */}
      {showReset && (
        <Modal titulo="Repor password" icone={<KeyRound size={15} />} cor={barColor} onClose={() => setShowReset(false)}>
          <form onSubmit={handleResetPassword} className="p-5 space-y-3.5 text-[13px]">
            <p className="text-[#6B7280] leading-relaxed">
              Peça ao fornecedor um código (válido 30 min, só serve uma vez) e escreva-o aqui com a sua nova password.
            </p>
            <div>
              <label className={rotulo}>Código do fornecedor</label>
              <input autoFocus value={resetCode} onChange={(e) => setResetCode(e.target.value)}
                className={`${campo} pl-3 font-mono tracking-wide`} style={{ borderRadius: RADIUS.sm }} />
            </div>
            <div>
              <label className={rotulo}>Nova password</label>
              <input type="password" value={resetPw} onChange={(e) => setResetPw(e.target.value)}
                className={`${campo} pl-3`} style={{ borderRadius: RADIUS.sm }} />
            </div>
            <div>
              <label className={rotulo}>Confirmar</label>
              <input type="password" value={resetPw2} onChange={(e) => setResetPw2(e.target.value)}
                className={`${campo} pl-3`} style={{ borderRadius: RADIUS.sm }} />
            </div>
            {resetMsg && (resetMsg.ok
              ? <div className="px-3 py-2 text-[12px] text-[#166534] bg-[#F0FDF4] border border-[#BBF7D0]" style={{ borderRadius: RADIUS.sm }}>{resetMsg.text}</div>
              : <Erro texto={resetMsg.text} />)}
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setShowReset(false)} className={botaoClaro} style={{ borderRadius: RADIUS.sm }}>Fechar</button>
              <button type="submit" disabled={resetLoading || !resetCode || !resetPw}
                className="h-10 px-5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50"
                style={{ background: barColor, borderRadius: RADIUS.sm }}>
                {resetLoading ? 'A repor…' : 'Repor password'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

/** Uma linha do painel de estado, à esquerda. */
function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-white/55">{rotulo}</dt>
      <dd className="font-medium text-white/90">{valor}</dd>
    </div>
  );
}

function Erro({ texto }: { texto: string }) {
  return (
    <div className="px-3 py-2.5 text-[12.5px] text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA]"
      style={{ borderRadius: RADIUS.sm }}>
      {texto}
    </div>
  );
}

/** A moldura dos dois diálogos deste ecrã — cabeçalho na cor da instalação. */
function Modal({ titulo, icone, cor, onClose, children }: {
  titulo: string; icone: React.ReactNode; cor: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(11,18,32,0.45)', backdropFilter: 'blur(2px)' }} onClick={onClose}>
      <div className="w-[440px] max-w-full bg-white overflow-hidden" onClick={(e) => e.stopPropagation()}
        style={{ borderRadius: RADIUS.lg, boxShadow: '0 24px 60px rgba(2,8,23,0.35)' }}>
        <div className="h-11 flex items-center justify-between px-4 text-white" style={{ background: cor }}>
          <span className="flex items-center gap-2 text-[14px] font-semibold">{icone}{titulo}</span>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/15 transition-colors"
            style={{ borderRadius: RADIUS.sm }}><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[140px_1fr] items-center gap-2">
      <span className="text-[#6B7280]">{label}</span>
      <input readOnly value={value}
        className="h-9 px-3 bg-[#F9FAFB] border border-[#E6E8EC] text-[#374151] outline-none text-[13px]"
        style={{ borderRadius: RADIUS.sm }} />
    </div>
  );
}

export default CustomerLogin;
