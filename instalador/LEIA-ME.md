# Instalador do System Mwana Lodge

## O que o CLIENTE vê (a experiência Primavera)

1. Recebe **um ficheiro**: `MwanaLodge-Setup-1.0.0.exe`.
2. Duplo clique → wizard em português: *Seguinte* → pasta → **Base de Dados**
   (SQLite local recomendado, ou o PostgreSQL da casa) → *Instalar*.
3. A barra de progresso instala tudo, cria a base (migrações) e regista **dois
   serviços do Windows** que arrancam com a máquina:
   - **Mwana Lodge — Servidor** (backoffice + POS + API fiscal, porta 8000)
   - **Mwana Lodge — Impressão e Gaveta** (talões, comandas, gaveta)
4. No fim abre o browser em `http://localhost:8000` → **onboarding**: ativar a
   licença (do PCC), associar o hardware, criar pontos de venda, setores e mesas.
5. Atalhos no ambiente de trabalho e no menu Iniciar: *Backoffice* e *POS Front Office*.
6. Os outros terminais da casa (tablets, segunda caixa) abrem
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

Sai em `instalador\Output\MwanaLodge-Setup-1.0.0.exe`. O pacote **nunca** leva a base
de dev, o `.env`, o `private.pem` nem a `license.key` — a licença é do cliente e vem
do PCC na ativação.

## Atualizações

Gera-se um setup novo (versão acima) e corre-se por cima: o `.env` e os `\dados`
mantêm-se, as migrações novas aplicam-se, os serviços reiniciam.
