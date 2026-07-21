# VPN no servidor do cliente — para o dono aceder de fora

Extra **opcional**: só se instala nos hotéis onde o dono (ou outra pessoa autorizada)
pediu para aceder ao sistema de fora do hotel — de casa, em viagem, do telemóvel.
Não faz parte da instalação normal do `setup.exe`.

Usa a mesma ferramenta que o fornecedor usa para o PCC (OpenVPN + app "OpenVPN
Connect"), mas aqui o servidor VPN corre **dentro do servidor do próprio hotel**
— o acesso fica todo sob o controlo do cliente, sem depender de nenhum serviço
de terceiros para ligar as pontas.

## Antes de correr o script

1. **Confirme a rede local do hotel** — normalmente `192.168.1.0` ou
   `192.168.0.0`, máscara `255.255.255.0`. Veja no próprio servidor:
   `ipconfig` → "Default Gateway" diz-lhe a rede (ex.: gateway `192.168.1.1` →
   rede `192.168.1.0`).
2. **O hotel precisa de um nome fixo na internet** — a maioria não tem IP
   público fixo (o ISP muda-o de vez em quando). A forma grátis e simples:
   - Crie uma conta em [duckdns.org](https://www.duckdns.org) (grátis, 2 minutos).
   - Escolha um nome, ex. `meuhotel.duckdns.org`.
   - No router do hotel, procure "Dynamic DNS" / "DDNS" nas configurações e
     ligue-o ao DuckDNS com o token que o site lhe dá (a maioria dos routers
     domésticos/TP-Link/D-Link já traz isto de fábrica). Se o router não
     tiver DDNS embutido, o DuckDNS também tem uma aplicação pequena para
     correr no próprio servidor Windows — peça-nos se precisar dela.

## Correr o script

No servidor do hotel, PowerShell **como Administrador**:

```powershell
cd instalador\vpn-cliente
.\configurar_vpn.ps1 -PublicHost meuhotel.duckdns.org -LanSubnet 192.168.1.0
```

Faz tudo sozinho: instala o OpenVPN (se ainda não estiver), gera os
certificados, escreve a configuração do servidor, abre a porta na firewall do
Windows, e deixa pronto o ficheiro que o dono vai importar.

## O que falta fazer no ROUTER do hotel (isto o script não alcança)

**Reencaminhar a porta UDP 1194** para o IP local deste servidor (o script
diz-lhe esse IP no fim). Em qualquer router:
- Procure "Port Forwarding" / "Reencaminhamento de Portas" / "Virtual Server".
- Porta externa e interna: `1194`, protocolo `UDP`.
- IP de destino: o IP local do servidor (ex.: `192.168.1.50`).

Sem este passo, o servidor VPN fica a funcionar mas ninguém de fora consegue
ligar-se — é o único pedaço que tem mesmo de ser feito à mão, no equipamento do
hotel, e varia de router para router.

## Entregar o acesso ao dono

O script deixa o ficheiro em:

```
C:\ProgramData\MwanaVPN\cliente\dono.ovpn
```

Envie este ficheiro ao dono (por WhatsApp, e-mail — não é secreto ao ponto de
precisar de cuidado especial, mas trate-o como uma password). Ele:
1. Instala a app **OpenVPN Connect** (Android, iPhone, Windows ou Mac).
2. Importa o ficheiro `dono.ovpn`.
3. Toca em "Ligar" — a partir daí, com a VPN ligada, abre
   `http://192.168.1.50:8000` (o IP local do servidor) no telemóvel/portátil,
   exatamente como se estivesse dentro do hotel.

## Dar acesso a mais uma pessoa

Corra o script outra vez, só mudando o nome:

```powershell
.\configurar_vpn.ps1 -PublicHost meuhotel.duckdns.org -ClienteNome gerente
```

Não mexe na CA nem no servidor (já existem) — só cria um certificado novo e um
`gerente.ovpn` novo em `C:\ProgramData\MwanaVPN\cliente\`.

## Segurança

- A pasta `C:\ProgramData\MwanaVPN\certs\` tem a chave privada da autoridade
  certificadora — **nunca a copie para fora deste servidor** nem a envie a
  ninguém. Só os ficheiros `.ovpn` em `cliente\` se entregam.
- Cada pessoa tem o SEU próprio certificado — se alguém sair da empresa ou
  perder o telemóvel, revogue o acesso dela apagando o par `nome.key`/`nome.crt`
  e reiniciando o serviço `OpenVPNService` (peça ajuda se não tiver a certeza).

## Honestidade

Este script nunca correu contra um servidor Windows real — foi escrito com
cuidado (a mesma receita usada em milhares de tutoriais OpenVPN, só que
automatizada), mas é o primeiro sítio a olhar se algo não bater certo:
versão do OpenVPN, nome exato do serviço, ou se o `openssl.exe` não vier no
sítio esperado dentro da instalação do OpenVPN.
