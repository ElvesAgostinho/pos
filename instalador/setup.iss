; ============================================================================
; INSTALADOR DO SYSTEM MWANA LODGE — o setup.exe que se entrega ao cliente.
;
; A experiência é a de uma Primavera V10: Seguinte → aceitar → escolher pasta →
; escolher a base de dados → instalar → terminar com o browser aberto no sistema.
; O cliente não vê Python, não vê Django, não vê npm: vê um programa a instalar-se
; e dois SERVIÇOS do Windows a nascerem (o Servidor e a Impressão), que arrancam
; sozinhos com a máquina — para sempre, sem ninguém abrir consolas.
;
; Compila-se com o Inno Setup 6 (iscc.exe) na MÁQUINA DO FORNECEDOR, através do
; build_instalador.ps1 — o cliente recebe só o setup.exe final.
; ============================================================================

#define AppNome      "System Mwana Lodge"
#define AppVersao    "1.0.0"
#define AppEditor    "Mwana Lodge"
#define AppURL       "http://localhost:8000"

; SENHA DE INSTALAÇÃO — como a Oracle e a Primavera: quem abre o setup.exe tem de a saber
; ANTES de ver sequer o "Seguinte". Não é a password do dono do sistema (essa define-se
; depois, no onboarding) — é a chave do TÉCNICO que instala, para o .exe não poder ser
; corrido por quem o apanhar por aí. O build_instalador.ps1 PERGUNTA esta senha a cada
; build e passa-a por /DInstallPassword — nunca fica escrita aqui a sério. Este valor só
; existe para o ficheiro compilar sozinho se alguém correr o ISCC à mão sem passar por lá.
#ifndef InstallPassword
  #define InstallPassword "TROCAR-NO-BUILD"
#endif

[Setup]
AppId={{7E1D2C4A-ML26-4B8F-9C11-MWANALODGE01}
AppName={#AppNome}
AppVersion={#AppVersao}
AppPublisher={#AppEditor}
DefaultDirName={autopf}\MwanaLodge
DefaultGroupName={#AppNome}
; instala serviços — precisa de administrador, como qualquer ERP
PrivilegesRequired=admin
OutputBaseFilename=MwanaLodge-Setup-{#AppVersao}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; o wizard fala português
ShowLanguageDialog=no
DisableProgramGroupPage=yes
; A SENHA: o Windows pede-a antes de extrair um único ficheiro — Encryption=yes cifra o
; próprio pacote, não é só uma caixa de texto decorativa à frente dos ficheiros.
Password={#InstallPassword}
Encryption=yes

[Languages]
Name: "pt"; MessagesFile: "compiler:Languages\Portuguese.isl"

[Files]
; o PACOTE inteiro, montado pelo build_instalador.ps1:
;   app\      -> o backend Django + o site compilado (webapp\)
;   python\   -> Python embutido com todas as dependências já dentro
;   servicos\ -> WinSW (servidor.exe/impressao.exe + .xml)
Source: "pacote\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs

[Dirs]
; onde vivem os dados do CLIENTE — sobrevivem a atualizações e desinstalações
Name: "{app}\dados"; Permissions: users-modify
Name: "{app}\dados\media"; Permissions: users-modify
Name: "{app}\dados\logs"; Permissions: users-modify

[Icons]
Name: "{group}\{#AppNome} — Backoffice"; Filename: "{#AppURL}/backoffice/login"
Name: "{group}\{#AppNome} — POS Front Office"; Filename: "{#AppURL}/pos"
Name: "{autodesktop}\{#AppNome}"; Filename: "{#AppURL}"
Name: "{group}\Desinstalar {#AppNome}"; Filename: "{uninstallexe}"

[Run]
; 1) o CONFIGURADOR: escreve o .env com a base de dados escolhida no wizard,
;    corre as migrações e prepara os estáticos — com uma janela de progresso.
Filename: "{app}\python\python.exe"; Parameters: """{app}\configurar.py"" --ini ""{app}\instalacao.ini"""; \
  StatusMsg: "A preparar a base de dados…"; Flags: runhidden waituntilterminated
; 2) os DOIS SERVIÇOS, como a Oracle instala os dela:
Filename: "{app}\servicos\servidor.exe";  Parameters: "install"; StatusMsg: "A instalar o serviço do Servidor…";  Flags: runhidden waituntilterminated
Filename: "{app}\servicos\impressao.exe"; Parameters: "install"; StatusMsg: "A instalar o serviço de Impressão…"; Flags: runhidden waituntilterminated
Filename: "{app}\servicos\servidor.exe";  Parameters: "start";   StatusMsg: "A arrancar o Servidor…";             Flags: runhidden waituntilterminated
Filename: "{app}\servicos\impressao.exe"; Parameters: "start";   StatusMsg: "A arrancar a Impressão…";            Flags: runhidden waituntilterminated
; 3) firewall: os terminais POS da casa (tablets, outras caixas) ligam-se a este servidor
Filename: "netsh"; Parameters: "advfirewall firewall add rule name=""Mwana Lodge Servidor"" dir=in action=allow protocol=TCP localport=8000"; Flags: runhidden waituntilterminated
; 4) no fim, abre o sistema: sem licença ativa cai no ONBOARDING (ativar a licença,
;    associar o hardware, criar os pontos de venda) — é aí que a instalação acaba.
Filename: "{#AppURL}"; Description: "Abrir o {#AppNome} e ativar a licença"; Flags: postinstall shellexec nowait

[UninstallRun]
; parar e remover os serviços ANTES de apagar ficheiros — senão ficam órfãos no Windows
Filename: "{app}\servicos\servidor.exe";  Parameters: "stop";      Flags: runhidden waituntilterminated; RunOnceId: "StopSrv"
Filename: "{app}\servicos\impressao.exe"; Parameters: "stop";      Flags: runhidden waituntilterminated; RunOnceId: "StopImp"
Filename: "{app}\servicos\servidor.exe";  Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "DelSrv"
Filename: "{app}\servicos\impressao.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "DelImp"

[UninstallDelete]
; os DADOS não se apagam na desinstalação: a base de dados do cliente (vendas,
; documentos fiscais) fica em {app}\dados — apagar isso é apagar contabilidade.

[Code]
{ ── A PÁGINA DA BASE DE DADOS ─────────────────────────────────────────────
  Como a Primavera pergunta pelo SQL Server, nós perguntamos:
    · SQLite (recomendado)  — tudo nesta máquina, zero configuração; para uma
      casa com um servidor e meia dúzia de terminais chega e sobra.
    · PostgreSQL            — o servidor SQL do cliente (existente): pede
      servidor, porta, base, utilizador e password.
  A escolha é escrita em instalacao.ini e o configurar.py transforma-a no .env. }
var
  PgDados: TWizardPage;
  TipoBD: TInputOptionWizardPage;
  EdHost, EdPorta, EdBase, EdUser, EdPass: TNewEdit;
  { ── A CONTA DO DONO — como a Oracle pede a password do SYS/SYSTEM na instalação,
    aqui pede-se a conta com que o dono do hotel faz o PRIMEIRO login. O técnico
    traz o utilizador/senha que o PCC gerou (ecrã "Acessos" do cliente) — nunca se
    inventa uma ali, na hora, sem ficar registada em lado nenhum. }
  DonoPagina: TWizardPage;
  EdDonoUser, EdDonoPass, EdDonoPass2: TNewEdit;

{ O Pascal Script do Inno Setup não suporta funções aninhadas (ao contrário do
  Object Pascal normal) — por isso "Campo" tem de viver cá fora, não dentro de
  InitializeWizard. Foi isto que partia a compilação ("'BEGIN' expected"). }
function Campo(AOwner: TWizardPage; ATop: Integer; ACaption, ADefault: String;
               APass: Boolean): TNewEdit;
var
  L: TNewStaticText;
begin
  L := TNewStaticText.Create(AOwner.Surface);
  L.Parent := AOwner.Surface; L.Top := ATop; L.Left := 0; L.Caption := ACaption;
  Result := TNewEdit.Create(AOwner.Surface);
  Result.Parent := AOwner.Surface; Result.Top := ATop - 4; Result.Left := 140;
  Result.Width := 280; Result.Text := ADefault;
  if APass then Result.PasswordChar := '*';
end;

procedure InitializeWizard;
begin
  TipoBD := CreateInputOptionPage(wpSelectDir,
    'Base de Dados', 'Onde ficam guardadas as vendas',
    'Escolha a base de dados. Em caso de dúvida, deixe a opção recomendada.',
    True, False);
  TipoBD.Add('Base de dados local (SQLite) — recomendado');
  TipoBD.Add('Servidor PostgreSQL existente (avançado)');
  TipoBD.SelectedValueIndex := 0;

  PgDados := CreateCustomPage(TipoBD.ID,
    'Ligação ao PostgreSQL', 'Os dados de acesso ao servidor SQL do cliente');
  EdHost  := Campo(PgDados, 8,   'Servidor:',   'localhost', False);
  EdPorta := Campo(PgDados, 40,  'Porta:',      '5432',      False);
  EdBase  := Campo(PgDados, 72,  'Base:',       'mwanalodge', False);
  EdUser  := Campo(PgDados, 104, 'Utilizador:', 'mwana',     False);
  EdPass  := Campo(PgDados, 136, 'Password:',   '',          True);

  DonoPagina := CreateCustomPage(PgDados.ID,
    'Conta do Dono', 'A conta com que o dono do sistema faz o primeiro login');
  EdDonoUser  := Campo(DonoPagina, 8,   'Utilizador:',        'dono', False);
  EdDonoPass  := Campo(DonoPagina, 40,  'Password:',          '',     True);
  EdDonoPass2 := Campo(DonoPagina, 72,  'Confirmar Password:', '',    True);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  { a página do PostgreSQL só aparece a quem o escolheu }
  Result := (PageID = PgDados.ID) and (TipoBD.SelectedValueIndex = 0);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = DonoPagina.ID then begin
    if EdDonoPass.Text = '' then begin
      MsgBox('Indique a password do dono — foi gerada no PCC (ecrã Acessos do cliente).', mbError, MB_OK);
      Result := False;
    end else if EdDonoPass.Text <> EdDonoPass2.Text then begin
      MsgBox('As duas passwords não coincidem.', mbError, MB_OK);
      Result := False;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  Ini: String;
begin
  if CurStep = ssPostInstall then begin
    { o wizard entrega a escolha ao configurar.py por um ini simples }
    Ini := ExpandConstant('{app}\instalacao.ini');
    if TipoBD.SelectedValueIndex = 0 then
      SaveStringToFile(Ini, '[bd]' + #13#10 + 'tipo=sqlite' + #13#10, False)
    else
      SaveStringToFile(Ini,
        '[bd]' + #13#10 + 'tipo=postgres' + #13#10 +
        'host=' + EdHost.Text + #13#10 + 'porta=' + EdPorta.Text + #13#10 +
        'base=' + EdBase.Text + #13#10 + 'utilizador=' + EdUser.Text + #13#10 +
        'password=' + EdPass.Text + #13#10, False);
    SaveStringToFile(Ini,
      '[dono]' + #13#10 + 'utilizador=' + EdDonoUser.Text + #13#10 +
      'password=' + EdDonoPass.Text + #13#10, True);
  end;
end;
