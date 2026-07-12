"""
Registo Canónico de Módulos — FONTE ÚNICA DE VERDADE.

Este ficheiro é Python puro (sem dependências de Django) para poder ser importado
com segurança em tempo de arranque pelo `erp_server.settings`.

É partilhado por três subsistemas:
  1. erp_server.settings        -> decide que apps Django carregam consoante a licença.
  2. clm (API /api/clm/modules/) -> catálogo apresentado na consola PCC (Wizard de licenças).
  3. licensing.offline_validator -> valida a license.key comparando os módulos ativos.

REGRA DE OURO: o `code` de cada módulo é IGUAL ao app_label do Django. Assim, o que se
ativa na consola de licenças corresponde exatamente ao que arranca no ERP.
"""

# Módulos sempre ativos (fazem parte do núcleo; nunca são desativados por licença).
# NOTA: `eae` (motor de autorização) é núcleo porque o login (auth_engine) depende dele.
CORE_MODULES = [
    {"code": "core", "name": "Núcleo da Plataforma", "category": "Sistema"},
    {"code": "mdm", "name": "Dados Mestres (MDM)", "category": "Sistema"},
    {"code": "identity", "name": "Identidade & Organização", "category": "Sistema"},
    {"code": "licensing", "name": "Licenciamento", "category": "Sistema"},
    {"code": "eae", "name": "Motor de Autorização (RBAC/ABAC)", "category": "Segurança"},
]

# Módulos opcionais — ativáveis/desativáveis por licença na consola PCC.
# `requires` lista as dependências (outros módulos opcionais) que TÊM de ser carregadas
# juntas — o gating resolve o fecho transitivo automaticamente (estilo Oracle/SAP).
OPTIONAL_MODULES = [
    {"code": "inventory", "name": "Inventário & Artigos", "category": "Supply Chain",
     "requires": [], "description": "Artigos, categorias, fichas técnicas e stock base."},
    {"code": "production", "name": "Motor de Produção (Cozinha & Receitas)", "category": "Operação",
     "requires": ["inventory"], "description": "Receitas, alergénios, nutrição, áreas de produção, equipamentos e custeio."},
    {"code": "esm", "name": "Gestão de Fornecedores (ESM)", "category": "Supply Chain",
     "requires": ["inventory"], "description": "Fornecedores enterprise, catálogos, contratos e motor de performance."},
    {"code": "procurement", "name": "Compras (Encomendas & Receções)", "category": "Supply Chain",
     "requires": ["inventory", "esm"], "description": "Purchase Orders e receção de mercadorias (GRN)."},
    {"code": "wms", "name": "Gestão de Armazéns (WMS)", "category": "Supply Chain",
     "requires": [], "description": "Armazéns, localizações, movimentos e níveis de stock."},
    {"code": "ite", "name": "Motor de Transações de Inventário (ITE)", "category": "Supply Chain",
     "requires": [], "description": "Lotes, validades (FEFO), produção, transferências e inventários."},
    {"code": "pos", "name": "Ponto de Venda (POS)", "category": "Operação",
     "requires": ["inventory"], "description": "Frente de loja: mesas, pedidos, pagamentos."},
    {"code": "workforce", "name": "Recursos Humanos", "category": "Pessoas",
     "requires": [], "description": "Colaboradores, operadores POS, turnos e departamentos."},
    {"code": "edc", "name": "Gestão Documental (EDC)", "category": "Documentos",
     "requires": [], "description": "Documentos, workflows de aprovação e auditoria."},
    {"code": "ecc", "name": "Configuração & Regras de Negócio (ECC)", "category": "Sistema",
     "requires": [], "description": "Parâmetros, regras de negócio e auditoria de configuração."},
    {"code": "ewm", "name": "Periféricos & Equipamentos (EWM)", "category": "Infraestrutura",
     "requires": [], "description": "Impressoras, gavetas, balanças e periféricos por terminal."},
    {"code": "fme", "name": "Feature Flags (FME)", "category": "Sistema",
     "requires": [], "description": "Ativação granular de funcionalidades e overrides."},
    {"code": "amc", "name": "Monitorização & Telemetria (AMC)", "category": "Infraestrutura",
     "requires": [], "description": "Eventos de telemetria e alertas do sistema."},
    {"code": "eum", "name": "Gestão de Atualizações (EUM)", "category": "Infraestrutura",
     "requires": [], "description": "Distribuição de versões e estado de atualização dos terminais."},
    {"code": "pms", "name": "Property Management System (PMS)", "category": "Operação",
     "requires": [], "description": "Reservas, quartos, check-in/out, folios e cobrança no quarto."},
    {"code": "finance", "name": "Financeiro & Tesouraria", "category": "Financeiro",
     "requires": [], "description": "Tesouraria, recebimentos, pagamentos, centros de custo e faturação (AR)."},
    {"code": "commercial", "name": "Commercial Center (Pricing & Promoções)", "category": "Comercial",
     "requires": ["inventory", "pos"], "description": "Promoções, Happy Hour e Combos que alimentam o POS."},
]

# Lista de app_labels opcionais — consumida por erp_server.settings para o gating.
OPTIONAL_APP_LABELS = [m["code"] for m in OPTIONAL_MODULES]
_REQUIRES = {m["code"]: m.get("requires", []) for m in OPTIONAL_MODULES}


def optional_app_labels():
    """Devolve os app_labels opcionais (fonte única do gating por licença)."""
    return list(OPTIONAL_APP_LABELS)


def resolve_active(requested):
    """
    Dado o conjunto de módulos pedidos pela licença, devolve o FECHO TRANSITIVO:
    inclui todas as dependências necessárias e ignora códigos desconhecidos.
    '*' ativa todos os módulos opcionais.
    """
    requested = set(m.lower() for m in requested)
    if "*" in requested:
        return set(OPTIONAL_APP_LABELS)

    active = set()
    stack = [c for c in requested if c in _REQUIRES]
    while stack:
        code = stack.pop()
        if code in active:
            continue
        active.add(code)
        for dep in _REQUIRES.get(code, []):
            if dep not in active:
                stack.append(dep)
    return active


def all_modules():
    """Catálogo completo (core + opcionais) para a consola PCC."""
    return [{**m, "is_core": True} for m in CORE_MODULES] + \
           [{**m, "is_core": False} for m in OPTIONAL_MODULES]


# ==========================================================================
# FUNCIONALIDADES (feature flags) — licenciamento DENTRO do módulo.
# Cada feature liga/desliga um sub-conjunto do módulo. `default_on` = ligada
# por defeito (o admin pode desligar; a licença pode restringir o conjunto).
# 'item' liga a feature a um ecrã (id de navegação) para gating no frontend.
# ==========================================================================
FEATURES = [
    {"key": "pos.delivery", "name": "Delivery / Destinos de Serviço", "module": "pos", "item": "posc_destinations", "default_on": True},
    {"key": "pos.table_reservations", "name": "Reservas de Mesa", "module": "pos", "item": "posc_reservations", "default_on": True},
    {"key": "pos.giftcards", "name": "Gift Cards / Vouchers", "module": "pos", "item": "posc_giftcards", "default_on": True},
    {"key": "pos.kds", "name": "Kitchen Display (KDS)", "module": "pos", "item": "posc_kds", "default_on": True},
    {"key": "commercial.loyalty", "name": "Fidelização (Loyalty)", "module": "commercial", "item": "com_loyalty", "default_on": True},
    {"key": "commercial.combos", "name": "Menus & Combos", "module": "commercial", "item": "com_menus", "default_on": True},
    {"key": "fiscal.commercial_docs", "name": "Documentos Comerciais (Orçamento/Proforma)", "module": "fiscal", "item": "fis_commercial", "default_on": True},
    {"key": "pms.spa", "name": "Spa", "module": "pms", "item": "pms_spa", "default_on": True},
    {"key": "pms.minibar", "name": "Minibar", "module": "pms", "item": "pms_minibar", "default_on": True},
    {"key": "pms.laundry", "name": "Lavandaria", "module": "pms", "item": "pms_laundry", "default_on": True},
    {"key": "pms.agencies", "name": "Agências & Empresas (crédito)", "module": "pms", "item": "pms_agencies", "default_on": True},
    {"key": "pms.night_audit", "name": "Night Audit", "module": "pms", "item": "pms_nightaudit", "default_on": True},
    {"key": "ops.center", "name": "Centro de Operações (torre de controlo)", "module": "ops", "item": "ops_dashboard", "default_on": True},
    {"key": "integration.channel_manager", "name": "Channel Manager", "module": "integration", "item": "int_channel", "default_on": True},
    {"key": "integration.booking_engine", "name": "Booking Engine (reservas online)", "module": "integration", "item": "int_booking", "default_on": True},
]
FEATURE_KEYS = [f["key"] for f in FEATURES]


def resolve_active_features(active_modules, license_features=None, overrides=None):
    """
    Features efetivamente ativas.
    - Só features cujo módulo está ativo.
    - Se a licença traz uma lista (license_features não None), a feature tem de constar.
    - Override do admin (overrides: {key: bool}) tem prioridade dentro do permitido.
    - Sem override: usa default_on.
    """
    active_modules = set(active_modules or [])
    lic = set(license_features) if license_features is not None else None
    overrides = overrides or {}
    out = []
    for f in FEATURES:
        # 'ops' e 'integration' são transversais (não são apps opcionais): estão sempre
        # disponíveis se a licença os permitir — senão o Booking Engine/Channel Manager
        # nunca apareceriam, apesar de instalados.
        if f["module"] not in active_modules and f["module"] not in ("ops", "integration"):
            # 'ops' é sempre disponível (núcleo de supervisão); os restantes exigem módulo ativo.
            if f["module"] != "ops":
                continue
        if lic is not None and f["key"] not in lic:
            continue
        enabled = overrides.get(f["key"], f["default_on"])
        if enabled:
            out.append(f["key"])
    return out
