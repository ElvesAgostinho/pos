# Como gerar uma versão nova para os clientes

Guarde este ficheiro. São três passos, sempre os mesmos.

---

## O caminho normal — uma atualização

### 1. Subir o número da versão

Num único sítio, `backend/core/support.py`:

```python
APP_VERSION = '1.2.0'      # era 1.1.0
```

É a **fonte única** do número. O script de build lê-o daqui e o PCC confere que
o número que escrever no ecrã bate com o que está dentro do pacote — por isso
não há como publicar um pacote com um número que não é o dele.

### 2. Correr os testes, e só depois o build

```powershell
cd C:\Users\DELL\Desktop\POS\backend
python manage.py test

cd C:\Users\DELL\Desktop\POS\instalador
.\build_atualizacao.ps1
```

O build demora cerca de um minuto e deixa o pacote em:

```
instalador\Output\MwanaLodge-Update-<versao>.zip
```

Os testes demoram meia hora e não são opcionais num sistema que fatura: um
pacote publicado vai para a instalação de todos os clientes, e desfazer isso é
muito mais caro do que esperar.

### 3. Publicar no PCC

**PCC → Versões → Publicar versão nova**

| Campo | O que pôr |
|---|---|
| **Versão (ex.: 1.1.0)** | o mesmo número que pôs no `support.py` |
| **Ficheiro da versão** | o `.zip` que o build acabou de criar |
| **O que mudou** | o texto que o cliente vai ler no aviso |

Não precisa de alojar o ficheiro em lado nenhum: o PCC guarda-o e cria o link de
descarga sozinho.

### E do lado do cliente

**Configuração POS → Utilitários → Diagnóstico → Atualizar agora.**

Não reinstala nada. A configuração, a licença e a base de dados dele ficam
intactas — o pacote só substitui o `app/` e o `webapp/`, e guarda uma cópia do
anterior antes de mexer (se a atualização falhar, repõe a versão de trás
sozinho).

---

## O outro caminho — o instalador completo

```powershell
cd C:\Users\DELL\Desktop\POS\instalador
.\build_instalador.ps1
```

Produz o `setup.exe` (com o Python embutido e os serviços) e **gera as senhas de
instalação**, que ficam em `instalador\Output\senhas.txt`.

Use-o só em dois casos:

1. **Um cliente novo** — a primeira instalação.
2. **Quando o que mudou está FORA do `app/`** — uma versão nova do Python, um
   serviço novo do Windows, uma dependência que precisa de compilar.

> **Nunca publique um `.exe` no ecrã das Versões.** Isso **desliga** o botão
> "Atualizar agora" do lado do cliente: ele passa a ter de descarregar e correr
> o instalador completo à mão. O `.zip` é o que faz a atualização de um clique.

---

## Duas armadilhas que já morderam

**A ordem dos dois primeiros passos.** Correr o build antes de subir o número dá
um pacote com a versão antiga lá dentro e o número novo no ecrã — o cliente
atualiza e continua a ver a versão de antes, sem erro nenhum. O PCC passou a
recusar isso (confere o `APP_VERSION` dentro do `.zip`), mas é mais simples não
inverter a ordem.

**O que vai dentro do pacote.** A lista de exclusões dos scripts é o que impede
que uma chave privada, um `.env` ou uma base de dados de desenvolvimento viajem
para o disco de todos os clientes. Já escapou uma chave por um padrão que não
batia (`private.pem.bak`). Há um teste que guarda essa lista pelos dois lados —
que nada privado sai, e que o `licensing/engine/public.pem` **continua a sair**,
porque sem ele nenhum cliente consegue verificar a licença:

```powershell
cd C:\Users\DELL\Desktop\POS\backend
python manage.py test core.test_pacote_sem_segredos
```

São quatro segundos. Vale a pena antes de publicar.
