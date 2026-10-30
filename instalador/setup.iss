; ============================================================================
; INSTALADOR DO SYSTEM MWANA LODGE — o setup.exe que se entrega ao cliente.
;
; A experiência é a de uma Primavera V10: Seguinte → aceitar → escolher pasta →
; escolher a base de dados → instalar → terminar com o browser aberto no sistema.
; O cliente não vê Python, não vê Django, não vê npm: vê um programa a instalar-se
; e TRÊS SERVIÇOS do Windows a nascerem (Servidor, Impressão, Fila de Fundo), que
; arrancam sozinhos com a máquina — para sempre, sem ninguém abrir consolas.
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
; O DRIVER ODBC DA MICROSOFT, para quem escolher SQL Server.
;
; Vai DENTRO do pacote e nao se descarrega durante a instalacao: a casa do
; cliente pode nao ter internet nesse momento, ou te-la lenta — e uma
; instalacao que depende de uma descarga a meio falha no pior momento. Sao
; 4,7 MB num pacote que ja tem 60.
;
; `deleteafterinstall`: depois de instalado nao serve de nada, e um MSI na
; pasta do programa so convida alguem a correr o que nao deve.
Source: "msodbcsql.msi"; DestDir: "{tmp}"; Flags: deleteafterinstall; \
  Check: PrecisaDoDriverODBC

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
; O SERVIDOR DE BASE DE DADOS, quando foi o técnico a pedir que se instalasse.
;
; SQL SERVER EXPRESS: instala-se com autenticação do WINDOWS, e é de propósito.
; A instalação silenciosa com utilizador e password exige meia dúzia de
; parâmetros que falham de maneiras diferentes em cada versão — e não são
; precisos: o sistema liga-se com a conta do Windows de quem instala, e é essa
; conta que depois cria a base. Zero passwords no processo todo.
;
; POSTGRESQL: não tem autenticação do Windows, por isso leva uma password de
; superutilizador gerada aqui. Fica escrita no instalacao.ini para o
; configurador a usar, e é mostrada no fim a quem instala.
;
; `/norestart` e `--unattendedmodeui minimal`: a máquina não reinicia nem abre
; janelas a meio de uma instalação que o técnico está a acompanhar.
Filename: "{tmp}\motor-bd.exe"; \
  Parameters: "/ACTION=Install /QUIET /IACCEPTSQLSERVERLICENSETERMS /INSTANCENAME=SQLEXPRESS /HIDEPROGRESSBAR"; \
  StatusMsg: "A instalar o SQL Server Express (pode demorar alguns minutos)..."; \
  Check: VaiInstalarSqlServer; Flags: waituntilterminated

Filename: "{tmp}\motor-bd.exe"; \
  Parameters: "--mode unattended --unattendedmodeui minimal --superpassword ""{code:PasswordDoSuper}"" --serverport 5432 --disable-components stackbuilder"; \
  StatusMsg: "A instalar o PostgreSQL (pode demorar alguns minutos)..."; \
  Check: VaiInstalarPostgres; Flags: waituntilterminated

; O DRIVER ODBC — o configurador precisa dele para criar a base.
;
; `/qn` e silencioso; `IACCEPTMSODBCSQLLICENSETERMS=YES` e exigido pela
; Microsoft para instalar sem interface (e a aceitacao da licenca, que o
; tecnico ja aceitou ao aceitar a deste instalador). `/norestart` evita que a
; maquina reinicie a meio da instalacao sem ninguem contar com isso.
Filename: "msiexec.exe"; \
  Parameters: "/i ""{tmp}\msodbcsql.msi"" /qn /norestart IACCEPTMSODBCSQLLICENSETERMS=YES ADDLOCAL=ALL"; \
  StatusMsg: "A instalar o driver de ligacao ao SQL Server..."; \
  Check: PrecisaDoDriverODBC; Flags: waituntilterminated

Filename: "{app}\python\python.exe"; Parameters: """{app}\configurar.py"" --ini ""{app}\instalacao.ini"""; \
  StatusMsg: "A preparar a base de dados…"; Flags: runhidden waituntilterminated
; 2) os TRÊS SERVIÇOS, como a Oracle instala os dela:
Filename: "{app}\servicos\servidor.exe";  Parameters: "install"; StatusMsg: "A instalar o serviço do Servidor…";  Flags: runhidden waituntilterminated
Filename: "{app}\servicos\impressao.exe"; Parameters: "install"; StatusMsg: "A instalar o serviço de Impressão…"; Flags: runhidden waituntilterminated
Filename: "{app}\servicos\servidor.exe";  Parameters: "start";   StatusMsg: "A arrancar o Servidor…";             Flags: runhidden waituntilterminated
Filename: "{app}\servicos\impressao.exe"; Parameters: "start";   StatusMsg: "A arrancar a Impressão…";            Flags: runhidden waituntilterminated
; 2b) A FILA DE FUNDO (Celery) — TERCEIRO serviço, sempre instalado, como os
;     outros dois. Não precisa de Redis nem de pergunta nenhuma: a fila vive na
;     própria base de dados que o wizard já escolheu (SQLite ou PostgreSQL) —
;     ver o comentário "FILA DE FUNDO" em backend/erp_server/settings.py.
Filename: "{app}\servicos\celery.exe"; Parameters: "install"; StatusMsg: "A instalar o serviço da Fila de Fundo…"; Flags: runhidden waituntilterminated
Filename: "{app}\servicos\celery.exe"; Parameters: "start";   StatusMsg: "A arrancar a Fila de Fundo…";            Flags: runhidden waituntilterminated
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
Filename: "{app}\servicos\celery.exe"; Parameters: "stop";      Flags: runhidden waituntilterminated; RunOnceId: "StopCel"
Filename: "{app}\servicos\celery.exe"; Parameters: "uninstall"; Flags: runhidden waituntilterminated; RunOnceId: "DelCel"

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
  { A página que aparece quando a máquina não tem o motor escolhido, e a
    página de descarga do instalador dele. }
  SemMotor: TInputOptionWizardPage;
  Descarga: TDownloadWizardPage;
  CaminhoMotor: String;    { o instalador do motor, depois de descarregado }
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
    'Escolha onde ficam guardados os dados desta casa.'#13#10 +
    'Em caso de dúvida, deixe a opção recomendada — pode mudar mais tarde.',
    True, False);
  TipoBD.Add('Base de dados local (SQLite) — recomendado');
  TipoBD.Add('Servidor SQL Server existente (o da casa)');
  TipoBD.Add('Servidor PostgreSQL existente');
  TipoBD.SelectedValueIndex := 0;

  { A PÁGINA DE QUEM NÃO TEM O SERVIDOR.
    Só aparece quando o técnico escolheu SQL Server ou PostgreSQL e a máquina
    não tem nenhum — e então dá-lhe as três saídas, em vez de o mandar embora.
    A escolha é do cliente: há casas que querem mesmo o servidor, e há quem
    só precise que o sistema funcione. }
  SemMotor := CreateInputOptionPage(TipoBD.ID,
    'Servidor de base de dados', 'Esta máquina não tem o servidor escolhido',
    'O que quer fazer?',
    True, False);
  SemMotor.Add('Instalar agora o servidor nesta máquina (descarrega da Internet)');
  SemMotor.Add('O servidor está NOUTRO computador — continuar e indicar o endereço');
  SemMotor.Add('Usar a base de dados local (SQLite) — sem servidor, recomendado');
  SemMotor.SelectedValueIndex := 0;

  Descarga := CreateDownloadPage(
    'A descarregar o servidor de base de dados',
    'Isto demora conforme a ligação à Internet desta casa.', nil);

  PgDados := CreateCustomPage(SemMotor.ID,
    'Ligação ao servidor',
    'Os dados de acesso ao servidor da casa. O instalador testa a ligação antes de continuar.');
  { O QUE SE PEDE AQUI É A CONTA DE ADMINISTRAÇÃO DO SERVIDOR, e não a da
    aplicação. O instalador usa-a uma vez para CRIAR a base e um utilizador só
    para ela — e esquece-a. Antes pedia-se a conta da aplicação e obrigava-se
    quem instala a ter criado a base à mão, com SQL, no SSMS ou no pgAdmin: um
    técnico que não saiba SQL não tem como fazer isso, e um comando mal colado
    estraga a instalação de uma forma difícil de perceber.

    A porta fica VAZIA numa instância nomeada do SQL Server (SERVIDOR\INSTANCIA)
    — quem a resolve é o SQL Browser. No PostgreSQL é sempre 5432. É preenchida
    em CurPageChanged, conforme o motor. }
  EdHost  := Campo(PgDados, 8,   'Servidor:',        'localhost',  False);
  EdPorta := Campo(PgDados, 40,  'Porta:',           '',           False);
  EdBase  := Campo(PgDados, 72,  'Base a criar:',    'mwanalodge', False);
  EdUser  := Campo(PgDados, 104, 'Administrador:',   '',           False);
  EdPass  := Campo(PgDados, 136, 'Password admin:',  '',           True);

  DonoPagina := CreateCustomPage(PgDados.ID,
    'Conta do Dono', 'A conta com que o dono do sistema faz o primeiro login');
  EdDonoUser  := Campo(DonoPagina, 8,   'Utilizador:',        'dono', False);
  EdDonoPass  := Campo(DonoPagina, 40,  'Password:',          '',     True);
  EdDonoPass2 := Campo(DonoPagina, 72,  'Confirmar Password:', '',    True);
end;

{ O DRIVER ODBC TEM DE EXISTIR NA MÁQUINA — e não vem no pacote.
  O Python embutido traz o `pyodbc`, mas o pyodbc é só a ponte: quem fala com o
  SQL Server é o driver ODBC da Microsoft, que é software do sistema e instala-se
  à parte. Numa máquina com o SQL Server Management Studio já lá está; numa
  máquina limpa, não.
  Sem esta verificação, a instalação acabava bem e o sistema não arrancava, com
  um erro de ODBC que não diz qual é o driver que falta. Quem instala precisa de
  saber ANTES, enquanto ainda está à frente do computador do cliente. }
{ ESTA MÁQUINA TEM UM SERVIDOR DESTE MOTOR?
  Não é uma pergunta retórica: é o que decide se o técnico pode avançar ou se
  tem de parar e ir instalar software. Procura-se onde cada motor se regista —
  o serviço e a chave de registo —, que é o que existe mesmo numa máquina com
  o servidor instalado e parado. }
function TemSqlServer(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\Microsoft\Microsoft SQL Server\Instance Names\SQL');
end;

function TemPostgres(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\PostgreSQL\Installations')
         or RegKeyExists(HKLM, 'SOFTWARE\WOW6432Node\PostgreSQL\Installations');
end;

function MotorEscolhidoExiste(): Boolean;
begin
  if TipoBD.SelectedValueIndex = 1 then
    Result := TemSqlServer()
  else if TipoBD.SelectedValueIndex = 2 then
    Result := TemPostgres()
  else
    Result := True;    { SQLite não precisa de servidor nenhum }
end;

function TemDriverODBC(): Boolean;
begin
  Result := RegKeyExists(HKLM, 'SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 18 for SQL Server')
         or RegKeyExists(HKLM, 'SOFTWARE\ODBC\ODBCINST.INI\ODBC Driver 17 for SQL Server');
end;

{ Instala-se o driver quando o cliente escolheu SQL Server E nao o tem.
  Numa maquina que ja o tenha (e o caso de quem tem o SSMS) nao se mexe em
  nada: reinstalar por cima e pedir um reinicio que ninguem pediu. }
function PrecisaDoDriverODBC(): Boolean;
begin
  Result := (TipoBD.SelectedValueIndex = 1) and (not TemDriverODBC());
end;

{ Instala-se o motor só quando: foi escolhido um servidor, a máquina não o
  tem, e o técnico pediu expressamente para o instalar. }
function VaiInstalarMotor(): Boolean;
begin
  Result := (TipoBD.SelectedValueIndex <> 0) and (not MotorEscolhidoExiste())
            and (SemMotor.SelectedValueIndex = 0) and (CaminhoMotor <> '');
end;

function VaiInstalarSqlServer(): Boolean;
begin
  Result := VaiInstalarMotor() and (TipoBD.SelectedValueIndex = 1);
end;

function VaiInstalarPostgres(): Boolean;
begin
  Result := VaiInstalarMotor() and (TipoBD.SelectedValueIndex = 2);
end;

{ A PASSWORD DO SUPERUTILIZADOR DO POSTGRESQL É A QUE O TÉCNICO ESCREVEU.
  Não se gera: quem instala um servidor tem de ficar com a password de
  administração dele anotada, e uma password que o instalador inventa é uma
  password que ninguém registou. É também o que o instalador oficial do
  PostgreSQL faz — pergunta.
  O mesmo valor serve para DUAS coisas: define o superutilizador na instalação
  do servidor, e é com ele que o configurador cria a base a seguir. }
function PasswordDoSuper(Param: String): String;
begin
  Result := EdPass.Text;
end;

function ShouldSkipPage(PageID: Integer): Boolean;
begin
  Result := False;
  { A página "não tem servidor" só aparece quando é mesmo o caso. }
  if PageID = SemMotor.ID then
    Result := (TipoBD.SelectedValueIndex = 0) or MotorEscolhidoExiste();
  { A página da ligação não aparece a quem ficou em SQLite — nem a quem
    escolheu SQLite na página anterior por não ter servidor. }
  if PageID = PgDados.ID then
    Result := (TipoBD.SelectedValueIndex = 0)
           or ((not MotorEscolhidoExiste()) and (SemMotor.SelectedValueIndex = 2));
  { A descarga só corre a quem pediu para instalar o servidor. }
  if PageID = Descarga.ID then
    Result := (TipoBD.SelectedValueIndex = 0) or MotorEscolhidoExiste()
           or (SemMotor.SelectedValueIndex <> 0);
end;

{ Os valores por omissão mudam com o motor escolhido: o que é certo para um
  é errado para o outro, e deixar a porta do PostgreSQL num SQL Server é o
  erro que faz a ligação falhar sem se perceber porquê. }
procedure CurPageChanged(CurPageID: Integer);
begin
  { O SERVIDOR ACABOU DE SER INSTALADO POR NÓS: sabemos o endereço, a instância
    e as credenciais — não há nada para o técnico adivinhar. Preenche-se tudo,
    e ele só confirma. Era aqui que uma instalação automática deixava de o ser:
    instalava o servidor e depois pedia a morada dele. }
  if (CurPageID = PgDados.ID) and VaiInstalarMotor() then begin
    if TipoBD.SelectedValueIndex = 1 then begin
      EdHost.Text := ExpandConstant('{computername}') + '\SQLEXPRESS';
      EdPorta.Text := '';
      EdUser.Text := '';          { conta do Windows — foi assim que se instalou }
      EdPass.Text := '';
    end else begin
      { A password fica VAZIA de propósito: é o técnico que a escolhe, e é
        ela que vai ser DEFINIDA no servidor que estamos prestes a instalar. }
      EdHost.Text := 'localhost';
      EdPorta.Text := '5432';
      EdUser.Text := 'postgres';
      PgDados.Description :=
        'O PostgreSQL vai ser instalado nesta máquina.' + #13#10 +
        'ESCOLHA a password de administração (utilizador "postgres") — é esta' + #13#10 +
        'que fica definida no servidor. ANOTE-A: sem ela ninguém o administra.';
    end;
  end;

  if CurPageID = PgDados.ID then begin
    if TipoBD.SelectedValueIndex = 1 then begin
      PgDados.Caption := 'Ligação ao SQL Server';
      PgDados.Description :=
        'O instalador cria a base e o utilizador sozinho — não precisa de SQL.' + #13#10 +
        'Servidor: PC-RECECAO ou PC-RECECAO\SQLEXPRESS (porta vazia).' + #13#10 +
        'Administrador vazio = usar a conta do Windows com que está a instalar.';
      if EdPorta.Text = '5432' then EdPorta.Text := '';
    end else begin
      PgDados.Caption := 'Ligação ao PostgreSQL';
      PgDados.Description :=
        'O instalador cria a base e o utilizador sozinho — não precisa de SQL.' + #13#10 +
        'Administrador: o utilizador "postgres" e a password definida quando o' + #13#10 +
        'PostgreSQL foi instalado.';
      if EdPorta.Text = '' then EdPorta.Text := '5432';
      if EdUser.Text = '' then EdUser.Text := 'postgres';
    end;
  end;
end;

{ DE ONDE VEM CADA INSTALADOR.
  São as páginas oficiais: a Microsoft e a EnterpriseDB (que é quem distribui
  o PostgreSQL para Windows). Não se aloja cópia nenhuma — uma cópia nossa
  ficava desactualizada e sem as correcções de segurança deles. }
function UrlDoMotor(): String;
begin
  if TipoBD.SelectedValueIndex = 1 then
    { Bootstrapper do SQL Server Express: são ~6 MB, e é ele que traz o resto. }
    Result := 'https://go.microsoft.com/fwlink/p/?linkid=2216019'
  else
    Result := 'https://get.enterprisedb.com/postgresql/postgresql-16.4-1-windows-x64.exe';
end;

function NomeDoMotor(): String;
begin
  if TipoBD.SelectedValueIndex = 1 then
    Result := 'SQL Server Express'
  else
    Result := 'PostgreSQL 16';
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;

  { A DESCARGA DO MOTOR — só de quem a pediu na página anterior. }
  if (CurPageID = SemMotor.ID) and (not MotorEscolhidoExiste())
     and (SemMotor.SelectedValueIndex = 0) then begin
    Descarga.Clear;
    Descarga.Add(UrlDoMotor(), 'motor-bd.exe', '');
    Descarga.Show;
    try
      try
        Descarga.Download;
        CaminhoMotor := ExpandConstant('{tmp}\motor-bd.exe');
      except
        { Uma descarga que falha NÃO pode derrubar a instalação: a casa pode
          estar sem Internet, e há duas saídas boas a um clique de distância. }
        MsgBox('Não consegui descarregar o ' + NomeDoMotor() + '.' + #13#10 + #13#10 +
               GetExceptionMessage + #13#10 + #13#10 +
               'Volte atrás e escolha "usar a base de dados local", ou instale o ' +
               NomeDoMotor() + ' à mão e recomece.', mbError, MB_OK);
        Result := False;
      end;
    finally
      Descarga.Hide;
    end;
  end;

  if CurPageID = PgDados.ID then begin
    if Trim(EdHost.Text) = '' then begin
      MsgBox('Indique o servidor.', mbError, MB_OK);
      Result := False;
    end else if Trim(EdBase.Text) = '' then begin
      MsgBox('Indique o nome da base de dados.', mbError, MB_OK);
      Result := False;
    end else if (TipoBD.SelectedValueIndex = 2) and (Trim(EdUser.Text) = '') then begin
      { No PostgreSQL não há "conta do Windows": o administrador é obrigatório. }
      MsgBox('Indique o utilizador de administração do PostgreSQL' + #13#10 +
             '(normalmente "postgres").', mbError, MB_OK);
      Result := False;
    end else if (TipoBD.SelectedValueIndex = 2) and (EdPass.Text = '') then begin
      MsgBox('Indique a password do administrador do PostgreSQL —' + #13#10 +
             'é a que foi definida quando o PostgreSQL foi instalado.', mbError, MB_OK);
      Result := False;
    end else if (TipoBD.SelectedValueIndex = 1) and (Trim(EdUser.Text) <> '')
                and (EdPass.Text = '') then begin
      MsgBox('Indicou um administrador do SQL Server mas não a password.' + #13#10 +
             'Para usar a conta do Windows, deixe o Administrador vazio.', mbError, MB_OK);
      Result := False;
    end;
    { O DRIVER ODBC JÁ NÃO É UM IMPEDIMENTO: o instalador traz-o e instala-o
      sozinho (ver PrecisaDoDriverODBC). Avisa-se apenas, para quem está a
      instalar não pensar que a instalação encravou nos segundos em que o MSI
      corre — e para saber porquê, se a máquina pedir um reinício no fim. }
    if Result and (TipoBD.SelectedValueIndex = 1) and (not TemDriverODBC()) then
      MsgBox('Esta máquina não tem o driver de ligação ao SQL Server.' + #13#10 + #13#10 +
             'O instalador traz-o e instala-o sozinho — não precisa de o ir' + #13#10 +
             'buscar a lado nenhum. Demora alguns segundos.',
             mbInformation, MB_OK);
  end;
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
  Motor: String;
begin
  if CurStep = ssPostInstall then begin
    { o wizard entrega a escolha ao configurar.py por um ini simples }
    Ini := ExpandConstant('{app}\instalacao.ini');
    { "Usar a base local" na página do servidor vale o mesmo que ter escolhido
      SQLite logo no início — e é aí que a escolha do cliente manda. }
    if (TipoBD.SelectedValueIndex = 0)
       or ((not MotorEscolhidoExiste()) and (SemMotor.SelectedValueIndex = 2)) then
      SaveStringToFile(Ini, '[bd]' + #13#10 + 'tipo=sqlite' + #13#10, False)
    else begin
      if TipoBD.SelectedValueIndex = 1 then
        Motor := 'sqlserver'
      else
        Motor := 'postgres';
      { `admin_*` são as credenciais com que se CRIA a base, e só existem
        durante a instalação — o configurador usa-as e não as escreve no .env.
        `utilizador` fica com o nome da base: é o nome do utilizador que vai
        ser criado para a aplicação, com uma password gerada que ninguém
        escreve nem dita. }
      SaveStringToFile(Ini,
        '[bd]' + #13#10 + 'tipo=' + Motor + #13#10 +
        'host=' + EdHost.Text + #13#10 + 'porta=' + EdPorta.Text + #13#10 +
        'base=' + EdBase.Text + #13#10 +
        'utilizador=' + EdBase.Text + #13#10 +
        'admin_utilizador=' + EdUser.Text + #13#10 +
        'admin_password=' + EdPass.Text + #13#10, False);
    end;
    SaveStringToFile(Ini,
      '[dono]' + #13#10 + 'utilizador=' + EdDonoUser.Text + #13#10 +
      'password=' + EdDonoPass.Text + #13#10, True);

    { A PASSWORD DO SUPERUTILIZADOR DO POSTGRESQL, quando foi o instalador a
      montar o servidor. É a chave de administração daquele servidor para
      sempre, e se ninguém a anotar fica perdida — o servidor continua a
      funcionar, mas ninguém mais lhe mexe. Mostra-se uma vez, aqui, e fica
      também no ficheiro ao lado para quem tiver de a ir buscar. }
    if VaiInstalarPostgres() then begin
      SaveStringToFile(ExpandConstant('{app}\POSTGRESQL-ADMIN.txt'),
        'PostgreSQL instalado por este instalador.' + #13#10 +
        'Utilizador de administração: postgres' + #13#10 +
        'Password: ' + EdPass.Text + #13#10 + #13#10 +
        'GUARDE ISTO. É a password de administração do servidor PostgreSQL ' +
        'desta máquina. O sistema não precisa dela para funcionar (usa um ' +
        'utilizador próprio), mas sem ela ninguém administra o servidor.' + #13#10,
        False);
      MsgBox('O PostgreSQL foi instalado nesta máquina.' + #13#10 + #13#10 +
             'O utilizador de administração é "postgres", com a password que' + #13#10 +
             'indicou. Ficou guardada em POSTGRESQL-ADMIN.txt, na pasta do' + #13#10 +
             'programa — sem ela ninguém administra este servidor.',
             mbInformation, MB_OK);
    end;
  end;
end;
