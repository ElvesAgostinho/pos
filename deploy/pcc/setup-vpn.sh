#!/usr/bin/env bash
# ============================================================================
# OPENVPN NA VPS DO PCC — para TU (e os teus técnicos) acederes à consola do
# PCC como acedes hoje ao sistema do teu amigo: OpenVPN Connect no telemóvel/
# portátil, sem o PCC nunca ficar exposto na internet pública.
#
# Corre-se UMA vez, na VPS, depois do deploy.sh já ter posto o PCC no ar.
# Usa o instalador comunitário angristan/openvpn-install (o mais usado e
# revisto para Ubuntu/Debian) em vez de escrever tudo à mão — é o mesmo que
# qualquer tutorial sério recomendaria.
#
# Uso:
#   sudo bash setup-vpn.sh
# ============================================================================
set -euo pipefail

echo "== 1/2 A instalar o OpenVPN (script comunitário angristan/openvpn-install) =="
curl -O https://raw.githubusercontent.com/angristan/openvpn-install/master/openvpn-install.sh
chmod +x openvpn-install.sh

echo ""
echo "Vai começar o instalador interativo. Responda assim (bate certo com o"
echo "nginx-pcc.conf que já está configurado para a rede 10.8.0.0/24):"
echo "  - IP público: o sugerido está certo (deteta sozinho)"
echo "  - Protocolo: UDP"
echo "  - Porta: 1194 (ou outra, mas depois mude também no firewall/router se aplicável)"
echo "  - DNS: pode deixar o que vier por omissão"
echo "  - No fim, dê um nome ao SEU cliente (ex.: dono-mwanalodge) quando perguntar"
echo ""
read -p "Prima Enter para continuar…"
./openvpn-install.sh

echo ""
echo "== 2/2 Feito =="
echo "O ficheiro .ovpn do cliente ficou na pasta onde correu este script (ex.: ~/dono-mwanalodge.ovpn)."
echo "Copie-o para o seu computador/telemóvel e importe na app 'OpenVPN Connect'."
echo ""
echo "Confirme que a rede da VPN é 10.8.0.0/24 (o instalador angristan usa isto por"
echo "omissão) — é o que o nginx-pcc.conf já espera. Se escolheu outra rede durante"
echo "o instalador, edite o 'allow 10.8.0.0/24' em /etc/nginx/sites-available/mwana-pcc"
echo "para a rede que escolheu, e corra: sudo nginx -t && sudo systemctl reload nginx"
echo ""
echo "Para dar acesso a outro técnico mais tarde: sudo bash openvpn-install.sh (o mesmo"
echo "script, já instalado, oferece \"Add a new user\" no menu)."
