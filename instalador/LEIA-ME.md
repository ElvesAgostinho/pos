# Instalador do System Mwana Lodge

## O que o CLIENTE vê (a experiência Primavera)

1. Recebe **um ficheiro**: `MwanaLodge-Setup-1.0.0.exe`.
2. Duplo clique → **o Windows pede logo a senha de instalação**, antes de mostrar
   qualquer ecrã do wizard (como a Oracle e a Primavera). Sem a senha certa, o
   .exe nem chega a extrair um ficheiro — não é uma caixa decorativa, é o próprio
   pacote cifrado. Só quem o técnico autorizado souber a senha instala.
3. Wizard em português: *Seguinte* → pasta → **Base de Dados**
   (SQLite local recomendado, ou o PostgreSQL da casa) → **Conta do Dono**
   (o técnico introduz o utilizador/password gerados no PCC — ecrã "Acessos" do
   cliente, botão "Gerar senha do dono") → *Instalar*.
4. A barra de progresso instala tudo, cria a base (migrações), cria a conta do
   dono com a password escolhida na página anterior, e regista **dois serviços
   do Windows** que arrancam com a máquina:
   - **Mwana Lodge — Servidor** (backoffice + POS + API fiscal, porta 8000)
   - **Mwana Lodge — Impressão e Gaveta** (talões, comandas, gaveta)
5. **A licença ativa-se sozinha.** O instalador vai buscá-la ao PCC no fim da
   instalação, autenticando-se com o código do cliente e a senha de instalação —
   as duas coisas que o técnico já teve de ter para abrir o `.exe`. Com ela vêm,
   no mesmo canal, a certificação AGT, a ligação da fatura eletrónica e os dados
   da empresa que já estão escritos no PCC: o dono não reescreve nada. Ninguém
   copia ficheiros para dentro de pastas.

   Se não houver Internet no momento da instalação, **o sistema fica instalado na
   mesma** e a razão fica no registo (`dados\logs\configurar.log`). A licença
   ativa-se depois pelo ecrã: *Configuração POS → Parâmetros do Sistema → Empresa
   → Licença*, onde há três caminhos — ativar pelo código do cliente, puxar do
   PCC, ou carregar o ficheiro `license.key`.

6. No fim abre o browser em `http://localhost:8000/backoffice/login` — o dono
   entra já com a conta criada no passo 3, e o sistema está licenciado.
7. Atalhos no ambiente de trabalho e no menu Iniciar: *Backoffice* e *POS Front Office*.
8. Os outros terminais da casa (tablets, segunda caixa) abrem
   `http://IP-do-servidor:8000/pos` — a firewall já foi aberta pelo instalador.

Os **dados do cliente** (base SQLite, fotos, logs) vivem em `\dados` — sobrevivem a
atualizações e a desinstalação **nunca** os apaga (é contabilidade).

## Como o FORNECEDOR gera o setup.exe

Na sua máquina (precisa de node, python, [Inno Setup 6](https://jrsoftware.org/isdl.php)
e internet):

```powershell
cd instalador
.\build_instalador.ps1
```

O script pergunta três coisas: a **senha de instalação** (duas vezes, sem eco no
ecrã), o **código do cliente** (para a licença se ativar sozinha no fim) e
confirma o **endereço do PCC** (fica guardado entre builds). Vá buscá-las ao
**PCC** (Gestão de Clientes → selecione o cliente → botão "Acessos" →
"Gerar senha de instalação"; o mesmo ecrã gera a "senha do dono" que o técnico vai
introduzir na página "Conta do Dono" do wizard). As duas só aparecem em claro UMA VEZ
no PCC — copie-as na hora. A senha de instalação nunca fica escrita em ficheiro
nenhum do projeto: vive só na memória do PowerShell durante o build e passa
diretamente ao compilador. Entregue-a ao técnico por um canal separado do `.exe`
— nunca no mesmo e-mail.

Sai em `instalador\Output\MwanaLodge-Setup-1.0.0.exe`. O pacote **nunca** leva a base
de dev, o `.env`, o `private.pem` nem a `license.key` — a licença é do cliente e vem
do PCC na ativação.

A senha de instalação e o código do cliente viajam dentro do pacote
(`app\ativacao.ini`), que vai **cifrado** (`Encryption=yes`): só existem em claro
na máquina de quem abriu o instalador com a senha certa. O configurador apaga
esse ficheiro assim que o usa — a senha de instalação não fica a viver no disco
do cliente.

## Atualizações

Gera-se um setup novo (versão acima) e corre-se por cima: o `.env` e os `\dados`
mantêm-se, as migrações novas aplicam-se, os serviços reiniciam.

## Extra opcional: o dono aceder de fora do hotel

Se um cliente pedir para aceder ao seu próprio sistema remotamente (de casa,
em viagem), há um script à parte em `instalador/vpn-cliente/` — instala um
OpenVPN no servidor DELE (o dono liga-se com a app "OpenVPN Connect", a mesma
que se usa para o PCC). Não faz parte da instalação normal; ver o LEIA-ME.md
dessa pasta.
