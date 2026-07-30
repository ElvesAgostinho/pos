"""
Catálogo de parâmetros do POS (globais).

O NÚMERO é a referência estável: é por ele que o suporte fala com o cliente
("mude o 8128"). O nome pode mudar de versão para versão; o número nunca.
"""
from django.core.management.base import BaseCommand

from pos.models import PosParameter
from pos import params as pengine

B, I, T, C = 'BOOL', 'INT', 'TEXT', 'CHOICE'

# (nº, grupo, nome, tipo, opções, valor por omissão, ajuda)
PARAMS = [
    # ---------------- Front Office (o que o TERMINAL faz) ----------------
    # Estes decidem o caminho do empregado. Não são preferências de ecrã: mudam o ofício.
    # NUMERAÇÃO 9xxx: parâmetros PRÓPRIOS do Mwana Lodge (não existem no sistema de
    # referência) — 9311/9312 nasceram como 8311/8312 nesta casa antes de se saber que a
    # HOST usa esses dois números para outra coisa (e-mails de mesa libertada). Para não
    # partir nada já em uso, moveram-se para o bloco 9xxx; os números 8311/8312 ficam
    # livres para significar exatamente o que significam na HOST.
    (9311, 'Front Office', 'Pedir o cliente ao ABRIR a venda (Entidade/Quarto/Eventos)', B, [], 'true',
     'LIGADO de fábrica: perguntar só na hora de cobrar é tarde — a fatura já saiu como '
     'Consumidor Final e essa não se corrige, anula-se por nota de crédito.'),
    (9312, 'Front Office', 'Abrir o teclado ao entrar na venda', B, [], 'true',
     'LIGADO de fábrica: entrar no balcão e ver "escolha uma página" é perder um toque em '
     'todas as vendas do dia.'),
    (9313, 'Front Office', 'Abrir o teclado tátil automaticamente ao focar a pesquisa', B, [], 'true',
     'LIGADO de fábrica: tocar na caixa de pesquisa (Entidade, Artigos, hóspedes…) já abre o '
     'teclado no ecrã, sem precisar de tocar duas vezes. DESLIGADO: a caixa fica pronta a '
     'escrever, mas o teclado só sobe se o empregado tocar no ícone dele — para quem liga um '
     'teclado físico ao terminal e não quer o virtual a saltar por cima.'),
    (8300, 'Front Office', 'Venda Direta (vender sem passar pelas mesas)', B, [], 'false',
     'LIGADO: o terminal abre logo numa conta de balcão, sem seletor de mesa. É o bar de '
     'praia e o take-away — quem serve ao balcão não tem mesas para escolher.'),
    (8302, 'Front Office', 'Escolher o setor ao entrar', B, [], 'true',
     'DESLIGADO: o terminal usa sempre o setor que tem configurado. Um terminal que só '
     'serve o Lounge não deve perguntar todos os dias qual é o setor.'),
    (8304, 'Front Office', 'Exigir abertura de caixa', B, [], 'true',
     'DESLIGADO: vende-se sem declarar o fundo de maneio. Só faz sentido em terminais que '
     'não recebem dinheiro (só lançam no quarto).'),
    (8306, 'Front Office', 'Abrir o teclado automaticamente na Venda Direta (balcão)', B, [], 'true',
     'LIGADO de fábrica: no balcão (8300), entrar na venda já mostra a 1ª página do teclado — '
     'perder um toque em CADA cliente do dia. DESLIGADO: fica em "Escolha uma página em cima", '
     'para quem tem várias cartas ao balcão e quer escolher de propósito. Só vale para o '
     'balcão — nas mesas quem manda é o 9312.'),
    (8308, 'Front Office', 'Enviar para a cozinha automaticamente ao lançar', B, [], 'false',
     'LIGADO: cada artigo lançado vai logo para a produção. Serve o bar (a cerveja sai já); '
     'não serve o restaurante (a mesa ainda está a escolher).'),
    (8310, 'Front Office', 'Pedir a entidade antes de cobrar', B, [], 'false',
     'LIGADO: o terminal pergunta sempre quem leva a fatura. Evita o "afinal queria com '
     'contribuinte" depois do documento emitido — que já não se pode mudar.'),
    # ---------------- Geral ----------------
    (8183, 'Geral', 'Fazer backup no fecho do dia', B, [], 'false', 'Ativar só quando não existe PMS.'),
    (8176, 'Geral', 'Configuração de teclado por', C, ['Setor', 'Terminal', 'Operador'], 'Setor', ''),
    (8001, 'Geral', 'Layout do teclado', C, ['QWERTY (Português)', 'AZERTY', 'Numérico'], 'QWERTY (Português)', ''),
    (8128, 'Geral', 'Emitir sempre nota de crédito ao anular fatura', B, [], 'true',
     'LIGADO: anular uma fatura emite automaticamente a Nota de Crédito (exigência da AGT).'),
    (8012, 'Geral', 'Modo de Pagamento base', C, ['Cash', 'Cartão', 'Transferência'], 'Cash', ''),
    (8036, 'Geral', 'Dias a guardar o log', I, [], '30', ''),
    (8062, 'Geral', 'Permitir Fechar o Dia no Front Office', B, [], 'false',
     'Se desligado, só o backoffice pode fechar o dia.'),
    (8124, 'Geral', 'Transferências de Mesas', C, ['Total', 'Parcial', 'Não permitir'], 'Parcial', ''),
    (8101, 'Geral', 'Nº de documentos visíveis no POS', I, [], '0', '0 = todos.'),
    (8063, 'Geral', 'Tempo para refrescar mesas (em segundos)', I, [], '8',
     'De quanto em quanto tempo o mapa de sala é re-lido do servidor.'),
    (8084, 'Geral', 'Mostrar Status do Pagamento', B, [], 'false', ''),
    (8088, 'Geral', 'Tempo em minutos para terminar sessão automaticamente', I, [], '60', ''),
    (8138, 'Geral', 'Tempo em minutos para fechar POS automaticamente', I, [], '120', ''),
    (8089, 'Geral', 'Hora para aviso de fecho do Dia', I, [], '5', ''),
    (8110, 'Geral', 'Permitir alterar contas de eventos', B, [], 'true', ''),
    (8127, 'Geral', 'Configuração de documentos por', C, ['Setor', 'Terminal'], 'Setor',
     'A série de cada documento (Fatura-Recibo, Nota de Crédito, Recibo…) vem da ficha do '
     'SETOR (separador Documentos). "Terminal" ficaria disponível se o Front Office soubesse '
     'em que posto físico está a correr — hoje o fluxo é Setor→Caixa→Mesas→Pedido→Pagar, sem '
     'esse emparelhamento, por isso a escolha por Terminal não tem efeito.'),
    (8143, 'Geral', 'Formato do Nome da Entidade', T, [], '{name1}, {name2}', ''),
    (8148, 'Geral', 'Nome da entidade por defeito para Faturas Simplificadas', T, [], 'Consumidor Final', ''),
    (8333, 'Geral', 'Tipo de Hóspede é obrigatório', B, [], 'true', ''),
    (8145, 'Geral', 'Permissões de utilizador', B, [], 'true',
     'LIGADO: o pagamento respeita a ficha do GRUPO (Utilizadores → Grupos → separador '
     '"POS - Pagamentos") — um perfil sem um método marcado não o pode usar. Desligado, '
     'qualquer perfil usa qualquer método ativo no outlet.'),
    (8197, 'Geral', 'Quantidade máxima a dividir antes de emitir aviso', I, [], '10', ''),
    (8150, 'Geral', 'Primeiro número de mesa a utilizar nas contas de cartão', I, [], '100000',
     'Campo herdado de sistemas que emitem CARTÕES numerados como conta em vez de mesa. '
     'Este POS não tem esse modo — a conta sem mesa é a Venda Direta (balcão), com o seu '
     'próprio carrossel de subcontas. Sem efeito.'),
    (8175, 'Geral', 'Perguntar tipo de cliente', B, [], 'true',
     'LIGADO: ao abrir a mesa, o POS pergunta se é passante ou hóspede.'),
    (8180, 'Geral', 'Largura do scroll no teclado de artigos', I, [], '0', ''),
    (8177, 'Geral', 'Colocar como oferta ao aplicar 100% desconto no artigo', B, [], 'true', ''),
    (8207, 'Geral', 'Linhas a adicionar antes de cortar o papel', I, [], '2', ''),
    (8149, 'Geral', 'Não imprimir artigos com valor 0', B, [], 'false', ''),
    (8222, 'Geral', 'Cash Pickup - Nº de vias', I, [], '2', ''),
    (8240, 'Geral', 'Descontos exclusivos', T, [], '', ''),
    (8256, 'Geral', 'Mensagem final no talão', T, [], 'Obrigado pela sua visita.', ''),
    (8271, 'Geral', 'Imagem de Fundo (Ativar)', B, [], 'true', ''),
    (8364, 'Geral', 'Impressão de Talão - Casas decimais em valores', I, [], '2', ''),
    (8620, 'Geral', 'Desconto máximo sem supervisor (%)', I, [], '10',
     'Acima deste valor, o POS exige a autorização de um supervisor.'),
    (8196, 'Geral', 'Secção de informação para avisos do cliente', T, [], '',
     'Códigos separados por "|" (ex.: ADMIN|DIR) — a quem chegam os avisos do POS ao cliente.'),
    (8224, 'Geral', 'Tipos de entidades válidas para contas a receber', T, [], '',
     'Nomes separados por vírgula (ex.: Hóspede, Empresa, Agência). Vazio = qualquer '
     'entidade pode ficar a dever. Aplicado no pagamento em conta corrente.'),
    (8369, 'Geral', 'Descontos exclusivos que não permitem aplicação de descontos automáticos', T, [], '', ''),
    (9369, 'Geral', 'Horário (Happy Hour) relacionado com 8369', T, [], '',
     'Enquanto este Happy Hour estiver ativo, os descontos automáticos NÃO se aplicam '
     'aos artigos marcados em 8369 (o preço de Happy Hour já é o desconto).'),

    # ---------------- E-mail (SMTP) ----------------
    # Bloco 9xxx: parâmetro PRÓPRIO do Mwana Lodge (sem equivalente mostrado na HOST até
    # hoje). Nasceram como 8500-8505/8510 antes de se saber que a HOST usa 8501/8502/8503/
    # 8510 para outra coisa (opções de Abrir Gaveta e o limite de anulação do terminal) —
    # ver "params-numbering" na memória.
    # A EMPRESA configura aqui o SEU servidor de envio (e-mails a clientes/parceiros).
    # Sem password preenchida, o motor SIMULA (regista no outbox sem enviar) — o vendedor
    # entrega o sistema a funcionar e o cliente liga o SMTP quando tiver conta.
    (9500, 'E-mail (SMTP)', 'Servidor SMTP', T, [], '', 'Ex.: smtp.sendgrid.net, smtp.office365.com'),
    (9501, 'E-mail (SMTP)', 'Porta', I, [], '587', ''),
    (9502, 'E-mail (SMTP)', 'Utilizador', T, [], '', ''),
    (9503, 'E-mail (SMTP)', 'Password', T, [], '', 'Guardada no servidor; nunca aparece nos ecrãs.'),
    (9504, 'E-mail (SMTP)', 'Remetente (From)', T, [], '', 'Ex.: noreply@oseuhotel.ao'),
    (9505, 'E-mail (SMTP)', 'Usar TLS', B, [], 'true', ''),
    (9510, 'E-mail (SMTP)', 'E-mail do suporte (envio de logs)', T, [], 'suporte@mwanalodge.ao',
     'Para onde o Diagnóstico envia os logs do sistema quando o cliente pede assistência.'),

    # ---------------- Reporting ----------------
    # Estes 4 apontavam para o Windows Reporting Services (SSRS) da HOST — um
    # servidor externo que gerava os relatórios em .rdl. Este sistema não usa
    # SSRS: tem o SEU PRÓPRIO motor de relatórios (Reporting Center, pos/reports.py
    # + PosReports.tsx, mais de 30 relatórios reais, nenhum deles precisa de
    # servidor externo nenhum). Ficam guardados por paridade de número com a HOST,
    # tal como a "Interface com PMS" — nunca vão ligar a nada NESTE sistema.
    (1363, 'Reporting', 'Servidor de Relatórios (URL)', T, [], '',
     'Campo de um servidor externo de relatórios que este sistema não usa — tem o seu próprio motor de relatórios nativo (Reporting Center). Sem efeito.'),
    (1360, 'Reporting', 'Gestor de Relatórios (URL)', T, [], '',
     'Sem equivalente neste sistema (Reporting Center próprio, sem servidor externo). Sem efeito.'),
    (8053, 'Reporting', 'Ligação aos Relatórios', T, [], '',
     'Sem equivalente neste sistema (Reporting Center próprio, sem servidor externo). Sem efeito.'),
    (8374, 'Reporting', 'Relatório - Ficha técnica', T, [], '',
     'Modelo de relatório externo que este sistema não usa. Aqui a Ficha Técnica imprime-se nativamente '
     '(Configuração POS → Artigos → aba Composição/Unidade → Imprimir) — não precisa de modelo nenhum.'),

    # ---------------- Moeda ----------------
    (8006, 'Moeda', 'Moeda base', T, [], 'Kz', ''),
    (8059, 'Moeda', 'Moeda para Troco', T, [], 'Kz', ''),
    (8007, 'Moeda', 'Moeda alternativa', T, [], 'USD', ''),

    # ---------------- Interface com PMS ----------------
    (8035, 'Interface com PMS', 'Interface com PMS', B, [], 'true',
     'LIGADO: o POS pode lançar consumos na conta do quarto.'),
    (8126, 'Interface com PMS', 'Lançar encargos PMS por', C, ['Setor', 'Artigo', 'Sub-Família'], 'Setor', ''),
    (8055, 'Interface com PMS', 'Visualizar Paymasters/Dummies do PMS', B, [], 'true', ''),
    (8236, 'Interface com PMS', 'Mostrar grupo/empresa na pesquisa de quartos', B, [], 'true', ''),
    (8365, 'Interface com PMS', 'Visualizar assinatura do hóspede', B, [], 'true', ''),
    (8064, 'Interface com PMS', 'Informação do hóspede', B, [], 'true', ''),
    (8174, 'Interface com PMS', 'Verificar se a conta PMS está aberta ao anular talões de quarto', B, [], 'true', ''),
    (8147, 'Interface com PMS', 'Plano de refeições - Forçar a pesquisa de hóspedes', B, [], 'false',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),
    (8065, 'Interface com PMS', 'Plano de refeições - Perguntar se deseja ir para a conta da '
     'mesa ao associar a mesa ao quarto', B, [], 'false',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),
    (8141, 'Interface com PMS', 'Card Packages - Utilizar Packages da Reserva', B, [], 'false',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),
    (8339, 'Interface com PMS', 'Card Packages - Utilizar Packages Extra para aplicar desconto', B, [], 'false',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),
    (8142, 'Interface com PMS', 'Refeições Extra', B, [], 'false',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),
    (8225, 'Interface com PMS', 'Mostrar informação de cartão de membro na pesquisa de quartos', B, [], 'false',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),
    (8325, 'Interface com PMS', 'Caixa PMS para Contas Correntes', T, [], '',
     'Sem módulo de PMS instalado nesta casa: fica guardado para quando existir.'),

    # ---------------- Descontos ----------------
    (8237, 'Descontos', 'Desconto de linha detalhado', B, [], 'false', ''),
    (8075, 'Descontos', 'Desconto - Hóspede', T, [], '', ''),
    (8076, 'Descontos', 'Desconto - Empresa', T, [], '', ''),
    (8077, 'Descontos', 'Desconto - Agência', T, [], '', ''),
    (8078, 'Descontos', 'Desconto - CRO', T, [], '', ''),
    (8079, 'Descontos', 'Desconto - Grupo', T, [], '', ''),
    (8080, 'Descontos', 'Desconto - Timeshare', T, [], '', ''),
    (8081, 'Descontos', 'Desconto - Proprietário', T, [], '', ''),
    (8082, 'Descontos', 'Desconto - Grupo (2)', T, [], '',
     'Duplicado histórico do desconto "Grupo". Este não está '
     'ligado ao motor de descontos automáticos (o 8079 já cobre "Grupo") — fica guardado '
     'para não faltar o número, mas não dispara nada sozinho.'),

    # ---------------- Gratificação ----------------
    (8214, 'Gratificação', 'Remover a gratificação do dinheiro no fecho', B, [], 'true', ''),
    (8213, 'Gratificação', 'Modo de pagamento para remover gratificação', C, ['Cash', 'Cartão'], 'Cash', ''),
    (8352, 'Gratificação', 'Remover quando pagamento em consumo interno', B, [], 'false',
     'A gorjeta do troco de uma conta de consumo interno (staff, oferta) também sai do '
     'dinheiro contado no fecho, como a das vendas normais.'),

    # ---------------- Fecho de caixa ----------------
    (8005, 'Fecho de caixa', 'Perguntar Total Vendido', C, ['Modo Detalhado', 'Modo Simples', 'Não perguntar'], 'Modo Detalhado',
     'CEGO: o operador conta o dinheiro sem ver o esperado — é assim que se deteta desvio.'),
    (8215, 'Fecho de caixa', 'Gratificações', B, [], 'true', ''),
    (8038, 'Fecho de caixa', 'Vendas por Artigo', B, [], 'true', ''),
    (8040, 'Fecho de caixa', 'Vendas por Família', B, [], 'true', ''),
    (8192, 'Fecho de caixa', 'Vendas por Sub-Família', B, [], 'false', ''),
    (8042, 'Fecho de caixa', 'Vendas por Documento', B, [], 'false', ''),
    (8044, 'Fecho de caixa', 'Resumo do IVA', B, [], 'true', ''),
    (8190, 'Fecho de caixa', 'Resumo do IVA (Sem consumos internos)', B, [], 'false',
     'O mesmo resumo, mas sem misturar o que foi vendido com o que foi consumo da casa.'),
    (8046, 'Fecho de caixa', 'Ofertas', B, [], 'true', ''),
    (8135, 'Fecho de caixa', 'Descontos', B, [], 'true', ''),
    (8061, 'Fecho de caixa', 'Encargos', B, [], 'false', ''),
    (8155, 'Fecho de caixa', 'Movimentos do cartão', B, [], 'false', ''),
    (8178, 'Fecho de caixa', 'Cancelamentos', B, [], 'true',
     'O relatório de fecho mostra o que foi anulado — é a primeira coisa que um dono quer ver.'),

    # ---------------- Fecho do Dia ----------------
    (8198, 'Fecho do Dia', 'Fecho do dia Automático', B, [], 'false', ''),
    (8199, 'Fecho do Dia', 'Fecho do dia Automático - Hora', T, [], '00:00', ''),
    (8037, 'Fecho do Dia', 'Vendas por Artigo', B, [], 'true', ''),
    (8216, 'Fecho do Dia', 'Gratificações', B, [], 'true', ''),
    (8039, 'Fecho do Dia', 'Vendas por Família', B, [], 'false', ''),
    (8191, 'Fecho do Dia', 'Vendas por Sub-Família', B, [], 'true', ''),
    (8041, 'Fecho do Dia', 'Vendas por Documento', B, [], 'false', ''),
    (8043, 'Fecho do Dia', 'Resumo do IVA', B, [], 'true', ''),
    (8189, 'Fecho do Dia', 'Resumo do IVA (Sem consumos internos)', B, [], 'false', ''),
    (8045, 'Fecho do Dia', 'Ofertas', B, [], 'true', ''),
    (8134, 'Fecho do Dia', 'Descontos', B, [], 'true', ''),
    (8060, 'Fecho do Dia', 'Encargos', B, [], 'false', ''),
    (8156, 'Fecho do Dia', 'Movimentos do cartão', B, [], 'false', ''),
    (8179, 'Fecho do Dia', 'Cancelamentos', B, [], 'true', ''),
    (8231, 'Fecho do Dia', 'E-mails para avisar quando são libertadas mesas abertas (;)', T, [], '',
     'Separados por ";". Dispara quando uma mesa fica livre (POSTicketViewSet._liberta_mesa).'),
    (8311, 'Fecho do Dia', 'E-mails para avisar quando são libertadas mesas abertas (Relatório)', T, [], '',
     'Campo herdado para o caminho de um relatório externo anexado ao e-mail. Este sistema '
     'não usa esse mecanismo — o e-mail sai em texto simples. Sem efeito.'),

    # ---------------- Artigos ----------------
    (8209, 'Artigos', 'Configurar IVA por sub-família', B, [], 'false', ''),
    (8010, 'Artigos', 'Gerar códigos automaticamente', B, [], 'true', ''),
    (8009, 'Artigos', 'Número de dígitos do código', I, [], '4', ''),
    (8011, 'Artigos', 'Utilizar código da sub-família como prefixo', B, [], 'true', ''),
    (8235, 'Artigos', 'Usar o código do artigo como código de barras se não estiver preenchido', B, [], 'true', ''),
    # ---------------- Marketing ----------------
    (4079, 'Marketing', 'Pedidos de eventos - Enviar e-mail', B, [], 'true',
     'Avisa a equipa de eventos assim que entra um pedido pelo site.'),
    (4179, 'Marketing', 'Pedidos de eventos - E-mails sep ";"', T, [], '',
     'Para quem vai o aviso. Vários endereços separados por ";".'),
    (4080, 'Marketing', 'Newsletter - Enviar e-mail', B, [], 'false',
     'Envia a newsletter aos hóspedes que a autorizaram.'),
    (4180, 'Marketing', 'Newsletter - E-mails sep ";"', T, [], '', ''),
    (8201, 'Marketing', 'Newsletter - Interesses', T, [], '',
     'Códigos de seleção que filtram quem recebe (ex.: SPA;GOLFE).'),
    # ---------------- Eventos · Geral ----------------
    (4070, 'Eventos', 'Utilizar faturação EMS (só quando não existe PMS)', B, [], 'false',
     'Ligar só em casas sem PMS — senão a mesma conta era faturada duas vezes.'),
    (4051, 'Eventos', 'Código de IVA neste posto', I, [], '0', ''),
    (4050, 'Eventos', 'Nível de Preço', I, [], '0', 'Nível de preço (1..6) usado nos eventos.'),
    (4039, 'Eventos', 'Lançar encargos PMS por', C, ['Setor', 'Banquet', 'Evento'], 'Setor', ''),
    (4058, 'Eventos', 'Criar conta para evento', B, [], 'true',
     'Cada evento abre a sua conta — sem isto, os consumos misturam-se com os do hotel.'),
    (4073, 'Eventos', 'Adicionar espaços comunicantes', B, [], 'true',
     'Reservar o salão grande bloqueia também os que abrem para ele.'),
    (4066, 'Eventos', 'Não permitir o check-out enquanto existirem itens por lançar', B, [], 'true',
     'Impede fechar a conta com consumos por cobrar — é dinheiro que se perdia.'),
    (4068, 'Eventos', 'Permitir colocar mais pessoas nas salas do que o definido no evento', B, [], 'false', ''),
    (4069, 'Eventos', 'Utilizar estados personalizados', B, [], 'true', ''),
    (4081, 'Eventos', 'Estado ao copiar evento', C, ['Opção', 'Normal', 'Pendente'], 'Opção', ''),
    (4077, 'Eventos', 'Não validar evento no momento do Check-In', B, [], 'false', ''),
    (4078, 'Eventos', 'Não bloquear espaço com o estado "Opcional"', B, [], 'true',
     'A Opção não tira o salão do mercado: continua a poder ser vendido a quem confirmar.'),
    (4085, 'Eventos', 'Cor do planning (montagem/desmontagem)', T, [], '#c0392b', ''),
    (4087, 'Eventos', 'Setores', T, [], '', ''),
    (4089, 'Eventos', 'Calendário de leitura (URL)', T, [], '', ''),
    (4091, 'Eventos', 'Alterar todas as quantidades quando muda o nr. de adultos', B, [], 'false', ''),

    # ---------------- Eventos · Lançamentos ----------------
    (4059, 'Eventos · Lançamentos', 'Espaços — lançar em', C, ['PMS', 'EMS'], 'PMS', ''),
    (4159, 'Eventos · Lançamentos', 'Espaços — Tipo de Preço', C, ['Diário', 'Por hora', 'Fixo'], 'Diário', ''),
    (4060, 'Eventos · Lançamentos', 'Recursos — lançar em', C, ['PMS', 'EMS'], 'PMS', ''),
    (4160, 'Eventos · Lançamentos', 'Recursos — Tipo de Preço', C, ['Diário', 'Por hora', 'Fixo'], 'Diário', ''),
    (4062, 'Eventos · Lançamentos', 'Lançar encargos na Auditoria da Noite', B, [], 'true', ''),
    (4067, 'Eventos · Lançamentos', 'Lançar F&B na Auditoria da noite', B, [], 'true', ''),
    (4074, 'Eventos · Lançamentos', 'A referência do setor no F&B é obrigatória', B, [], 'true',
     'Sem setor, o consumo não sabe a que centro de custo pertence.'),
    (4082, 'Eventos · Lançamentos', 'Movimentar stocks só quando consumo real finalizado', B, [], 'true',
     'O stock sai quando o buffet fecha e se sabe o que se gastou — não quando se planeia.'),
    (4083, 'Eventos · Lançamentos', 'Utilizador para lançamentos no PMS', T, [], 'IFC', ''),
    (4086, 'Eventos · Lançamentos', 'Packages a agrupar na fatura do PMS', T, [], '', ''),
    (4088, 'Eventos · Lançamentos', 'Lançar F&B com valor zero', B, [], 'true',
     'O incluído no pacote aparece na conta a zero — o cliente vê o que consumiu.'),

    # ---------------- Eventos · Valores por defeito ----------------
    (2023, 'Eventos · Valores por defeito', 'Prefixo do nº do evento', T, [], 'EV', ''),
    (4072, 'Eventos · Valores por defeito', 'Valores monetários não podem ser 0 (Zero)', B, [], 'true', ''),
    (4004, 'Eventos · Valores por defeito', 'Estado', C, ['Opção', 'Normal', 'Pendente'], 'Opção', ''),
    (4063, 'Eventos · Valores por defeito', 'Hora de Início', T, [], '00:00', ''),
    (4064, 'Eventos · Valores por defeito', 'Hora de Fim', T, [], '23:59', ''),
    (4005, 'Eventos · Valores por defeito', 'Duração (horas)', I, [], '8', ''),
    (4006, 'Eventos · Valores por defeito', 'Pax', I, [], '10', ''),
    (4071, 'Eventos · Valores por defeito', 'Datas de Follow up/Decisão/Limite com base em',
     C, ['Data Criação', 'Data do Evento'], 'Data Criação', ''),
    (4053, 'Eventos · Valores por defeito', 'Data Follow Up (dias)', I, [], '3', ''),
    (4054, 'Eventos · Valores por defeito', 'Data Decisão (dias)', I, [], '5', ''),
    (4055, 'Eventos · Valores por defeito', 'Data Limite (dias)', I, [], '7', ''),
    (4076, 'Eventos · Valores por defeito', 'Tipo Cliente (campo obrigatório)', B, [], 'true', ''),
    (4020, 'Eventos · Valores por defeito', 'Segmento (campo obrigatório)', B, [], 'true', ''),
    (4021, 'Eventos · Valores por defeito', 'Sub-Segmento (campo obrigatório)', B, [], 'true', ''),
    (4022, 'Eventos · Valores por defeito', 'Canal de Distribuição (campo obrigatório)', B, [], 'true', ''),
    (4092, 'Eventos · Valores por defeito', 'Refeição (campo obrigatório)', B, [], 'false', ''),

    # ---------------- Eventos · Reporting/Documentos ----------------
    (4084, 'Eventos · Reporting', 'Pró-forma (modelo)', T, [], '', ''),
    (12520, 'Eventos · Reporting', 'Pró-forma — excluir depósitos', B, [], 'false', ''),
    (4041, 'Eventos · Reporting', 'Talão (modelo)', T, [], '', ''),
    (4093, 'Eventos · Reporting', 'Artigo de Banquetes', T, [], '', ''),
    # ---------------- Gestão de F&B · Geral ----------------
    (8210, 'F&B', 'Casas decimais na quantidade', I, [], '3', ''),
    (8211, 'F&B', 'Casas decimais no preço', I, [], '3', ''),
    (8229, 'F&B', 'Bloquear compras para armazéns que estão em contagem', B, [], 'true',
     'Durante o inventário ninguém entra mercadoria — senão a contagem nunca fecha.'),
    (8230, 'F&B', 'Avisar quando o preço é alterado', B, [], 'true',
     'O fornecedor subiu o preço e ninguém deu por isso: é assim que a margem desaparece.'),
    (9231, 'F&B', 'Avisar quando o preço é alterado (percentagem)', I, [], '5',
     'A partir de quantos %% se avisa.'),
    (8238, 'F&B', 'Endereço de e-mail de resposta', T, [], '', ''),
    (8277, 'F&B', 'Bloquear movimento de stock com quantidade negativa na origem', B, [], 'false',
     'Impede tirar do armazém o que lá não está — o stock negativo é sempre um erro escondido.'),

    # ---------------- Gestão de F&B · Exportação ----------------
    # Na HOST, isto exportava os movimentos de stock/custo para um FICHEIRO de texto
    # que a contabilidade externa importava à parte. Este sistema não precisa: tem o
    # SEU PRÓPRIO motor de contabilidade (Centro 22, PGC-AO) que faz o auto-posting
    # DIRETO para o razão — sem ficheiro no meio, sem passo manual de importar.
    # Ficam guardados por paridade de número; nunca vão gerar ficheiro nenhum aqui.
    (8274, 'F&B · Exportação', 'Dias', I, [], '0',
     'Campo herdado de exportação para ficheiro de texto — este sistema lança direto no razão, sem ficheiro. Sem efeito.'),
    (8275, 'F&B · Exportação', 'Nome do ficheiro', T, [], 'CT{F:yyyyMMdd}_{T:yyyyMMdd}.txt',
     'Campo herdado de exportação para ficheiro de texto — sem equivalente (auto-posting direto). Sem efeito.'),
    (8276, 'F&B · Exportação', 'Pasta de exportação', T, [], '',
     'Campo herdado de exportação para ficheiro de texto — sem equivalente (auto-posting direto). Sem efeito.'),
    (8273, 'F&B · Exportação', 'Decimais', I, [], '4',
     'Campo herdado de exportação para ficheiro de texto — sem equivalente (auto-posting direto). Sem efeito.'),

    # ---------------- Gestão de F&B · Contas a pagar / Contabilidade ----------------
    (10537, 'F&B · Contas a pagar', 'Recibo de pagamento (relatório)', T, [], '', ''),
    (8335, 'F&B · Contabilidade', 'Conta analítica', C, ['Escondido', 'Visível', 'Obrigatório'], 'Escondido', ''),
    (8337, 'F&B · Contabilidade', 'Centro de Custo', C, ['Escondido', 'Visível', 'Obrigatório'], 'Escondido', ''),
]


# ══════════════════════════════════════════════════════════════════════════
# PARÂMETROS POR TERMINAL (scope=TERMINAL) — o catálogo é global, o VALOR
# concreto de cada um vive em PosTerminal.params (JSON, {número: valor}), não
# aqui. O que está aqui é só o nome/tipo/grupo/omissão — o TerminalEditor lê
# isto em pos/config/params/?scope=TERMINAL e mostra a aba "Geral".
# ══════════════════════════════════════════════════════════════════════════
PARAMS_TERMINAL = [
    # ---------------- Geral ----------------
    (8523, 'Geral', 'Tipo Posto', C, ['Mesas', 'Venda Direta', 'Mesas + Venda Direta'],
     'Mesas + Venda Direta', 'Como o terminal vende: por mesa, balcão, ou os dois. "Mesas" '
     'esconde o botão de Venda Direta; "Venda Direta" abre logo o balcão e esconde o mapa.'),
    (8594, 'Geral', 'Abrir Mesa por Código de Barras', B, [], 'false',
     'O empregado lê o código na mesa (o próprio número dela) para a abrir, sem tocar no mapa.'),
    (8517, 'Geral', 'Setor Único', B, [], 'true',
     'O terminal serve um só setor — esconde "Setor"/"Trocar de Setor" e nunca pergunta.'),
    (8516, 'Geral', 'Setor Inicial', T, [], '',
     'Código do setor que abre por omissão quando não se pergunta (8610/8302 desligados).'),
    (8540, 'Geral', 'Setores Disponíveis', T, [], '',
     'Códigos separados por vírgula. Restringe os setores deste TERMINAL, por cima da '
     'ficha do operador ("Todos os setores").'),
    (8610, 'Geral', 'Perguntar o setor após o login', B, [], 'true',
     'Pergunta o setor a cada início de sessão (em conjunto com 8302 e 8517).'),
    (8576, 'Geral', 'Modo de mesas simples', B, [], 'false',
     'Mapa de mesas em grelha por número, sem a planta (posição/forma) da sala.'),
    (8545, 'Geral', 'Modos de Pagamento', C, ['Todos', 'Só dinheiro', 'Só cartão'], 'Todos',
     'Que pagamentos este posto aceita — filtra a lista no painel de Pagamentos.'),
    (8579, 'Geral', 'Depósitos/Cash Advance - Ativar', B, [], 'false',
     'Mostra o botão "Depósito" em Contas Correntes (adiantamento da entidade).'),
    (8528, 'Geral', 'Impressora A4', T, [], '', 'Impressora para faturas A4.'),
    (8567, 'Geral', 'Impressora de talões', T, [], '', 'A térmica deste terminal (código do periférico).'),
    (8552, 'Geral', 'Opção para imprimir A4', B, [], 'true', ''),
    (8580, 'Geral', 'Opção para imprimir modelo específico', B, [], 'true', ''),
    # 8528/8552 (impressão A4 por spooler do Windows) e 8580 (escolher "modelo
    # específico") são do mundo do papel A4 num spooler local — este sistema não tem
    # essa peça: a impressão é nativa (talão pela fila PrintJob/print_agent, ou o
    # ecrã do navegador em janelas de conferência/recibo). 8567 (impressora térmica
    # DESTE terminal) esbarra na mesma limitação do 8127/TERMINAL: o Front Office não
    # sabe em que posto físico está a correr para escolher UM aparelho entre vários —
    # a impressora é resolvida por ESTAÇÃO+OUTLET (Configuração POS › Impressoras),
    # não por parâmetro. Os quatro ficam sem efeito, documentados para não se
    # inventar um spooler A4 que este produto nunca teve.
    (8513, 'Geral', 'Perguntar Nr. Clientes', T, [], 'Ao abrir mesa',
     '"Nunca" abre a mesa direto (1 · Passante), sem parar no teclado numérico. '
     'Qualquer outro valor mantém a pergunta ao abrir mesa.'),
    (8537, 'Geral', 'Nr. clientes pode ser 0', B, [], 'false',
     'LIGADO: o teclado de clientes aceita 0 (mesa reservada, conta técnica).'),
    (8539, 'Geral', 'Número de Clientes em modo de balcão', I, [], '1',
     'Nº de clientes com que a Venda Direta abre (era sempre 1, fixo no código).'),
    (8514, 'Geral', 'Nos consumos internos, pedir funcionário', B, [], 'true',
     'Abre o formulário do colaborador (RH) assim que a conta é de Consumo Interno.'),
    (8515, 'Geral', 'Pedir motivos de anulação', B, [], 'true',
     'Exige motivo ao anular um artigo já em produção (Cozinha/Bar/Pastelaria).'),
    (8502, 'Geral', 'Juntar artigos na grelha de pedidos', B, [], 'false',
     'Artigos iguais aparecem numa linha só, com a quantidade somada.'),
    (8503, 'Geral', 'Juntar artigos ao imprimir documentos', B, [], 'true',
     'Três cafés lançados um a um saem no papel como "3x Café", não em três linhas.'),
    (8532, 'Geral', 'Utilizar fatura personalizada', B, [], 'false',
     'Usa o cabeçalho/rodapé de Configuração › Modelos de Documento (por tipo), em '
     'vez do texto fixo. Sem modelo para o tipo, usa-se o de sempre.'),
    (8547, 'Geral', 'Pesquisar clientes no', T, [], 'Entity',
     'O único cadastro de clientes deste sistema é o mdm.Customer ("Entity") — não há '
     'outra fonte de pesquisa para escolher.'),
    (8510, 'Geral', 'Nº linhas a anular sem pedir password', I, [], '0',
     'Acima deste número de linhas anuladas na mesma conta, pede supervisor.'),
    (8538, 'Geral', 'Imprimir anulação no terminal', B, [], 'true',
     'Imprime um talão de anulação na CAIXA (à parte da comanda que já vai à estação).'),
    (8524, 'Geral', 'Nível de Preço', I, [], '1',
     'Nível de preço deste TERMINAL — só entra quando o setor não manda em nada '
     '(8592 vazio e o setor no nível 1, o base).'),
    (8518, 'Geral', 'Tempo até mostrar screensaver', I, [], '0', '0 = nunca.'),
    (8511, 'Geral', 'Número da mesa em Venda Direta', I, [], '',
     'A conta de balcão nasce já rotulada "Mesa <nº>" no recibo/ecrã, em vez de sem '
     'identificação nenhuma. Vazio = sem rótulo fixo (como sempre foi).'),
    (9511, 'Geral', 'Bloquear Venda Direta', B, [], 'false',
     'LIGADO: o servidor recusa qualquer conta sem mesa (não só esconde o botão — trava '
     'mesmo quem tentar por outra via, ex.: offline).'),
    (8509, 'Geral', 'Código de IVA neste posto', I, [], '0',
     'Id de uma taxa (Fiscal › Taxas de IVA). Quando preenchido, ESTE terminal fatura '
     'tudo a essa taxa, por cima da taxa da ficha do artigo. 0 = usa sempre a do artigo.'),
    (8520, 'Geral', 'Quantidade de sub-contas', I, [], '10', ''),
    (8534, 'Geral', 'Fechar janela de pagamentos quando pagamento aplicado', B, [], 'false',
     'LIGADO: fecha o painel de Pagamentos logo a seguir a aplicar um pagamento, sem '
     'esperar pelo recibo (reimprime-se depois a partir da conta).'),
    (8535, 'Geral', 'Pasta de Documentos', T, [], '',
     'Pasta LOCAL herdada de outro sistema. Este sistema guarda tudo no servidor '
     '(core/uploads.py + MEDIA_ROOT) — não há pasta de terminal para configurar. Sem efeito.'),
    (8536, 'Geral', 'Pasta de Imagens', T, [], '',
     'Mesmo caso do 8535: as imagens (ex.: fotos de artigo) sobem para o servidor, '
     'não para uma pasta local do posto. Sem efeito.'),
    (8542, 'Geral', 'Fechar conta ao imprimir conta da mesa', B, [], 'false',
     'Só se aplica com Tipo Posto = Mesas ou Mesas + Venda Direta. Sem efeito: fechar '
     '(cobrar) uma conta sem escolher método de pagamento arrisca inconsistência '
     'fiscal — a Consulta de Mesa mantém-se, de propósito, "sem fechar a conta".'),
    (8612, 'Geral', 'Fazer logout depois de sair de uma conta', B, [], 'false', ''),
    (8566, 'Geral', 'Pedir cliente/quarto na abertura de mesa', B, [], 'true', ''),
    (8568, 'Geral', 'Casas decimais na quantidade', I, [], '2',
     'Casas decimais da quantidade na grelha da conta (corta zeros à direita).'),
    (8583, 'Geral', 'Tamanho da grelha da conta %', I, [], '0',
     '0 (fábrica) = colunas em pixels fixos, como sempre foi. Qualquer outro valor '
     'liga a partilha em percentagem do 9583.'),
    (9583, 'Geral', '% por Coluna', T, [], '20;60;20',
     'Qtd;Descrição;Total, em percentagem — só entra com o 8583 ligado.'),
    (8593, 'Geral', 'Payment gateway', T, [], '',
     'Já coberto pela ficha do Modo de Pagamento (Interface externa/TPA) — usada em '
     'cada método, não por posto. Sem efeito, para não duplicar a configuração.'),
    (8595, 'Geral', 'Paperless Customer Invoice - Ativar', B, [], 'false',
     'LIGADO: manda a fatura por e-mail ao cliente com conta (mdm.Customer.email), a '
     'par do talão. Filtra por método de pagamento em 9595.'),
    (9595, 'Geral', 'Continuar - Modos de Pagamento', T, [], '',
     'Códigos de Modo de Pagamento (separados por vírgula) que mandam a fatura por '
     'e-mail quando 8595 está ligado. Vazio = todos os métodos.'),
    (8613, 'Geral', 'Utilizador por defeito', T, [], '',
     'O login deste sistema é só por PIN (sem campo de utilizador para pré-preencher '
     '— ver PosLoginModern). Sem efeito.'),
    (8617, 'Geral', 'Documentos - Secção', T, [], '',
     'Sem um destino concreto (que documento, que evento) para associar à secção, '
     'não se liga sem inventar a regra. Ver 8196 para o padrão equivalente já ligado '
     '(avisos do cliente por secção).'),
    (8618, 'Geral', 'Print server', T, [], '',
     'O agente de impressão (print_agent) fala DIRETO com a impressora (rede/série/'
     'spooler Windows) — não há servidor de impressão intermédio. Sem efeito.'),

    # ---------------- Abrir Gaveta ----------------
    (8591, 'Abrir Gaveta', 'Não abrir gaveta', B, [], 'false',
     'Interruptor mestre: LIGADO, nenhum dos motivos abaixo (nem o pagamento em '
     'dinheiro) abre a gaveta neste sistema — para terminais sem gaveta física.'),
    (8501, 'Abrir Gaveta', 'No fim do dia', B, [], 'true',
     'Abre a gaveta de cada caixa fechada no Fecho do Dia (Operações › Fecho do Dia).'),
    (8543, 'Abrir Gaveta', 'Na abertura de caixa', B, [], 'true',
     'Abre a gaveta ao abrir a sessão de caixa — para lá pôr o fundo de troco.'),
    (8544, 'Abrir Gaveta', 'No fecho de caixa', B, [], 'true',
     'Abre a gaveta ao fechar a sessão de caixa (contagem) e em "Fechar Terminais".'),

    # ---------------- Cozinha ----------------
    (8529, 'Cozinha', 'Documento de pedidos', T, [], '',
     'Texto fixo no topo da comanda de pedido normal. Vazio = sem cabeçalho.'),
    (8530, 'Cozinha', 'Documento de anulação de pedidos', T, [], '',
     'Texto fixo no topo da comanda de anulação. Vazio = "*** ANULAÇÃO — NÃO PREPARAR ***".'),
    (8541, 'Cozinha', 'Documento de transferência de mesa', T, [], '',
     'Texto fixo no topo da comanda enviada às estações quando uma conta com pedidos já '
     'em curso muda de mesa. Vazio = "*** MUDANÇA DE MESA ***".'),
    (8619, 'Cozinha', 'Documento de reenvio de pedidos', T, [], '',
     'Texto fixo no topo das comandas reenviadas em "Reenviar comandas falhadas" '
     '(Operações). Vazio = "*** REENVIO — PEDIDO JÁ FEITO ***".'),

    # ---------------- Eventos ----------------
    (8548, 'Eventos', 'Atribuir eventos a documentos Pos', B, [], 'false', ''),
    (8549, 'Eventos', 'Dias para mostrar eventos antes da data da atual', I, [], '0', ''),
]


class Command(BaseCommand):
    help = 'Cria/atualiza o catálogo de parâmetros globais e por-terminal do POS.'

    def handle(self, *args, **o):
        for n, group, name, kind, choices, default, help_text in PARAMS:
            PosParameter.objects.update_or_create(number=n, defaults={
                'name': name, 'group': group, 'kind': kind, 'choices': choices,
                'default': default, 'help_text': help_text, 'scope': 'GLOBAL',
            })
        for n, group, name, kind, choices, default, help_text in PARAMS_TERMINAL:
            PosParameter.objects.update_or_create(number=n, defaults={
                'name': name, 'group': group, 'kind': kind, 'choices': choices,
                'default': default, 'help_text': help_text, 'scope': 'TERMINAL',
            })
        pengine.invalidate()
        self.stdout.write(self.style.SUCCESS(
            f'{PosParameter.objects.filter(scope="GLOBAL").count()} parâmetros globais em '
            f'{len(set(p[1] for p in PARAMS))} grupos; '
            f'{PosParameter.objects.filter(scope="TERMINAL").count()} por-terminal em '
            f'{len(set(p[1] for p in PARAMS_TERMINAL))} grupos.'))
