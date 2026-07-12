from django.db import models
from django.contrib.auth.models import User
import uuid

# --- HIERARQUIA ORGANIZACIONAL ---

class EnterpriseGroup(models.Model):
    """GRUPO — o topo da estrutura (ex.: "Global Catering" com vários hotéis).

    É aqui que se definem as LÍNGUAS em que o sistema fala com o hóspede (o menu
    digital, a fatura, a confirmação de reserva) e as MOEDAS em que se aceita pagar.
    Ambas se definem uma vez no grupo e valem para todos os hotéis dele.
    """
    code = models.CharField(max_length=60, blank=True, null=True)   # "Global Catering"
    name = models.CharField(max_length=255, unique=True)
    sort_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class GroupLanguage(models.Model):
    """Línguas do grupo. A "por omissão" é aquela em que o sistema fala por defeito."""
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, related_name='languages')
    culture_code = models.CharField(max_length=10)          # pt-PT, en-US, fr-FR
    name = models.CharField(max_length=80)                  # Portuguese (Portugal)
    sort_order = models.PositiveIntegerField(default=100)
    legacy_code = models.CharField(max_length=10, blank=True, null=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = 'idn_group_language'
        unique_together = ('group', 'culture_code')
        ordering = ['sort_order']

    def __str__(self):
        return f'{self.culture_code} ({self.name})'


class GroupCurrency(models.Model):
    """Moedas aceites. A taxa é face à moeda base (a que está "por omissão")."""
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, related_name='currencies')
    code = models.CharField(max_length=10)                  # AOA, USD, EUR
    name = models.CharField(max_length=60)
    symbol = models.CharField(max_length=10, blank=True, null=True)
    rate = models.DecimalField(max_digits=14, decimal_places=6, default=1)
    sort_order = models.PositiveIntegerField(default=100)
    is_default = models.BooleanField(default=False)

    class Meta:
        db_table = 'idn_group_currency'
        unique_together = ('group', 'code')
        ordering = ['sort_order']

    def __str__(self):
        return f'{self.code} ({self.rate})'

class Company(models.Model):
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, related_name='companies')
    name = models.CharField(max_length=255)
    tax_id = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} [{self.tax_id}]"

class Hotel(models.Model):
    """A PROPRIEDADE. É a unidade de licença (o sistema vende-se por hotel).

    Os dados LEGAIS/FISCAIS da empresa (NIF, regime, capital social) vivem em
    fiscal.FiscalConfig — é o que sai impresso nas faturas, e tem de ter uma
    única fonte. Aqui ficam os dados OPERACIONAIS da propriedade.
    """
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='hotels')
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, null=True)

    # --- Identificação ---
    stars = models.PositiveSmallIntegerField(default=5)              # classificação (estrelas)
    hotel_type = models.CharField(max_length=40, default='Hotel')    # Hotel, Resort, Lodge, Pousada…
    opened_year = models.PositiveIntegerField(blank=True, null=True)

    # --- Morada e contactos (os que o hóspede usa) ---
    address = models.CharField(max_length=250, blank=True, null=True)
    city = models.CharField(max_length=80, blank=True, null=True)
    province = models.CharField(max_length=80, blank=True, null=True)
    country = models.CharField(max_length=80, default='Angola')
    phone = models.CharField(max_length=60, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    website = models.CharField(max_length=200, blank=True, null=True)

    # --- Operação (usados pelo PMS: night audit, tarifas, check-in/out) ---
    check_in_time = models.TimeField(default='14:00')
    check_out_time = models.TimeField(default='12:00')
    currency = models.CharField(max_length=10, default='AOA')
    timezone = models.CharField(max_length=50, default='Africa/Luanda')

    # --- Identificação técnica (Configuração POS → Empresa) ---
    platform_id = models.UUIDField(default=uuid.uuid4, editable=False)  # id único da instalação
    external_id = models.CharField(max_length=20, blank=True, null=True)   # "Id do hotel" (1020)
    hotel_code = models.CharField(max_length=20, blank=True, null=True)    # "HHSA"
    name2 = models.CharField(max_length=255, blank=True, null=True)        # nome comercial
    nif = models.CharField(max_length=30, blank=True, null=True)
    is_master = models.BooleanField(default=False)   # hotel principal da instalação

    # --- Aparência nos terminais ---
    bg_color = models.CharField(max_length=20, default='#808080')
    text_color = models.CharField(max_length=20, default='white')
    logo_url = models.CharField(max_length=400, blank=True, null=True)

    # --- Contactos (principais e secundários) ---
    address2 = models.CharField(max_length=250, blank=True, null=True)
    postal_code = models.CharField(max_length=30, blank=True, null=True)
    country_code = models.CharField(max_length=5, blank=True, null=True)    # AO
    fax = models.CharField(max_length=60, blank=True, null=True)
    specific_timezone = models.BooleanField(default=False)
    sec_address = models.CharField(max_length=250, blank=True, null=True)
    sec_phone = models.CharField(max_length=60, blank=True, null=True)
    sec_email = models.EmailField(blank=True, null=True)
    pos_location_name = models.CharField(max_length=200, blank=True, null=True)
    license_contact = models.CharField(max_length=200, blank=True, null=True)   # quem trata da licença

    def __str__(self):
        return self.name


class HotelGroupMembership(models.Model):
    """"Membro de" — a que grupos este hotel pertence (um hotel pode estar em vários:
    o grupo hoteleiro, uma cadeia de marca, um consórcio de compras)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='memberships')
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, related_name='members')
    sort_order = models.PositiveIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'idn_hotel_group'
        unique_together = ('hotel', 'group')
        ordering = ['sort_order']

    def __str__(self):
        return f'{self.hotel.name} ∈ {self.group.name}'


class HotelCustomText(models.Model):
    """TEXTOS PERSONALIZADOS — o que sai impresso nos documentos, e com que aspeto.

    Cada texto tem uma ORIGEM (T_HOTEL.Name1, T_HOTEL_CODES.nif…): o valor é lido do
    sistema, não copiado à mão. Assim, mudar o NIF na ficha muda-o em todos os
    documentos — não há dois sítios a discordar um do outro.
    """
    ALIGN = [('LEFT', 'Esquerda'), ('CENTER', 'Centro'), ('RIGHT', 'Direita')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='custom_texts')
    code = models.CharField(max_length=60)                # SYS-HOTEL-NAME-LEGAL
    description = models.CharField(max_length=120)        # Legal Name
    text = models.CharField(max_length=400, blank=True, null=True)
    source = models.CharField(max_length=80, blank=True, null=True)   # T_HOTEL.Name1
    is_active = models.BooleanField(default=True)
    bold = models.BooleanField(default=False)
    italic = models.BooleanField(default=False)
    font_size = models.PositiveIntegerField(default=100)
    font_name = models.CharField(max_length=40, default='Arial')
    alignment = models.CharField(max_length=8, choices=ALIGN, default='LEFT')

    class Meta:
        db_table = 'idn_hotel_custom_text'
        unique_together = ('hotel', 'code')
        ordering = ['code']

    def __str__(self):
        return f'{self.code} = {self.text or ""}'

class UserHotelAccess(models.Model):
    """A que hotéis é que este utilizador tem acesso.

    Sem registos = sem restrição (instalação de hotel único). Com registos, o
    utilizador SÓ vê os dados desses hotéis — em todos os módulos.
    """
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='hotel_access')
    hotel = models.ForeignKey('Hotel', on_delete=models.CASCADE, related_name='user_access')
    is_default = models.BooleanField(default=False)   # hotel que abre por omissão
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'idn_user_hotel_access'
        unique_together = ('user', 'hotel')
        verbose_name = 'Acesso a Hotel'
        verbose_name_plural = 'Acessos a Hotéis'

    def __str__(self):
        return f"{self.user.username} → {self.hotel.name}"


class Building(models.Model):
    """Bloco/torre/edifício de um hotel (estrutura física)."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='buildings')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=120)
    description = models.CharField(max_length=255, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'org_building'
        unique_together = ('hotel', 'code')
        ordering = ['hotel', 'code']

    def __str__(self):
        return f"{self.name} ({self.hotel.name})"


class Floor(models.Model):
    """Piso/ala de um edifício."""
    building = models.ForeignKey(Building, on_delete=models.CASCADE, related_name='floors')
    number = models.IntegerField(default=0)                 # 0 = R/C
    name = models.CharField(max_length=80, blank=True, null=True)   # "Ala Nascente"
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'org_floor'
        ordering = ['building', 'number']

    def __str__(self):
        return f"Piso {self.number} · {self.building.name}"


class ProfitCenter(models.Model):
    """Centro de lucro (dimensão de gestão) — agrupa receita por área de negócio."""
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='profit_centers')
    code = models.CharField(max_length=20)
    name = models.CharField(max_length=120)
    manager = models.CharField(max_length=120, blank=True, null=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'org_profit_center'
        unique_together = ('hotel', 'code')
        ordering = ['hotel', 'code']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class HotelResource(models.Model):
    """Recurso/equipamento do hotel (ativo operacional: viaturas, AVAC, IT, mobiliário)."""
    RES_TYPES = [('EQUIPMENT', 'Equipamento'), ('VEHICLE', 'Viatura'), ('IT', 'Informática'),
                 ('FURNITURE', 'Mobiliário'), ('HVAC', 'AVAC/Climatização'), ('OTHER', 'Outro')]
    STATUS = [('ACTIVE', 'Operacional'), ('MAINTENANCE', 'Em manutenção'), ('RETIRED', 'Abatido')]
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='resources')
    code = models.CharField(max_length=30)
    name = models.CharField(max_length=140)
    resource_type = models.CharField(max_length=12, choices=RES_TYPES, default='EQUIPMENT')
    location = models.CharField(max_length=120, blank=True, null=True)
    status = models.CharField(max_length=12, choices=STATUS, default='ACTIVE')
    is_active = models.BooleanField(default=True)

    class Meta:
        db_table = 'org_resource'
        ordering = ['hotel', 'name']

    def __str__(self):
        return f"[{self.code}] {self.name}"


class Department(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='departments')
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class Area(models.Model):
    department = models.ForeignKey(Department, on_delete=models.CASCADE, related_name='areas')
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class Subarea(models.Model):
    area = models.ForeignKey(Area, on_delete=models.CASCADE, related_name='subareas')
    name = models.CharField(max_length=255)

    def __str__(self):
        return self.name

class Workstation(models.Model):
    subarea = models.ForeignKey(Subarea, on_delete=models.CASCADE, related_name='workstations')
    name = models.CharField(max_length=255) # Ex: POS Bar Piscina 01
    ip_address = models.GenericIPAddressField(blank=True, null=True)

    def __str__(self):
        return self.name

class Shift(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='shifts')
    name = models.CharField(max_length=100) # Ex: Turno Manhã
    start_time = models.TimeField()
    end_time = models.TimeField()

    def __str__(self):
        return f"{self.name} ({self.start_time} - {self.end_time})"

# --- IDENTIDADE FÍSICA E LÓGICA ---

class Collaborator(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Suspended', 'Suspended'),
        ('Terminated', 'Terminated'),
    ]
    
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    photo_url = models.URLField(blank=True, null=True)
    nif = models.CharField(max_length=50, blank=True, null=True)
    passport = models.CharField(max_length=100, blank=True, null=True)
    id_card = models.CharField(max_length=100, blank=True, null=True)
    
    address = models.TextField(blank=True, null=True)
    phones = models.CharField(max_length=255, blank=True, null=True)
    email = models.EmailField(blank=True, null=True)
    
    job_title = models.CharField(max_length=255, blank=True, null=True)
    hotel = models.ForeignKey(Hotel, on_delete=models.SET_NULL, null=True, blank=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    manager = models.ForeignKey('self', on_delete=models.SET_NULL, null=True, blank=True, related_name='subordinates')
    
    admission_date = models.DateField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.code} - {self.name}"

class PosOperator(models.Model):
    # The logical identity that signs into a terminal
    collaborator = models.ForeignKey(Collaborator, on_delete=models.CASCADE, related_name='pos_operators')
    name = models.CharField(max_length=100) # Ex: "Carlos (Caixa Rest)"
    pin_code = models.CharField(max_length=128) # Hashed
    is_active = models.BooleanField(default=True)
    
    def __str__(self):
        return self.name

class OperatorLocationConstraint(models.Model):
    operator = models.ForeignKey(PosOperator, on_delete=models.CASCADE, related_name='location_constraints')
    area = models.ForeignKey(Area, on_delete=models.CASCADE)

class OperatorWorkstationConstraint(models.Model):
    operator = models.ForeignKey(PosOperator, on_delete=models.CASCADE, related_name='workstation_constraints')
    workstation = models.ForeignKey(Workstation, on_delete=models.CASCADE)
    
