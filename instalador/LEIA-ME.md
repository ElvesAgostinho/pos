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
5. No fim abre o browser em `http://localhost:8000/backoffice/login` — o dono
   entra já com a conta criada no passo 3. **Falta ainda** o `license.key` desta
   instalação (gerado no PCC ao criar o cliente) — hoje tem de ser colocado à mão
   em `{app}\app\license.key` antes ou depois do arranque; uma ativação por
   ecrã ainda não existe (item aberto, não confundir com o onboarding antigo
   que chamava um endpoint que já não existe).
6. Atalhos no ambiente de trabalho e no menu Iniciar: *Backoffice* e *POS Front Office*.
7. Os outros terminais da casa (tablets, segunda caixa) abrem
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

O script **pergunta logo a senha de instalação** (duas vezes, sem eco no ecrã) — vá
buscá-la ao **PCC** (Gestão de Clientes → selecione o cliente → botão "Acessos" →
"Gerar senha de instalação"; o mesmo ecrã gera a "senha do dono" que o técnico vai
introduzir na página "Conta do Dono" do wizard). As duas só aparecem em claro UMA VEZ
no PCC — copie-as na hora. A senha de instalação nunca fica escrita em ficheiro
nenhum do projeto: vive só na memória do PowerShell durante o build e passa
diretamente ao compilador. Entregue-a ao técnico por um canal separado do `.exe`
— nunca no mesmo e-mail.

Sai em `instalador\Output\MwanaLodge-Setup-1.0.0.exe`. O pacote **nunca** leva a base
de dev, o `.env`, o `private.pem` nem a `license.key` — a licença é do cliente e vem
do PCC na ativação.

## Atualizações

Gera-se um setup novo (versão acima) e corre-se por cima: o `.env` e os `\dados`
mantêm-se, as migrações novas aplicam-se, os serviços reiniciam.
