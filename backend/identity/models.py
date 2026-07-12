from django.db import models
from django.contrib.auth.models import User
import uuid

# --- HIERARQUIA ORGANIZACIONAL ---

class EnterpriseGroup(models.Model):
    name = models.CharField(max_length=255, unique=True)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name

class Company(models.Model):
    group = models.ForeignKey(EnterpriseGroup, on_delete=models.CASCADE, related_name='companies')
    name = models.CharField(max_length=255)
    tax_id = models.CharField(max_length=50, blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} [{self.tax_id}]"

class Hotel(models.Model):
    company = models.ForeignKey(Company, on_delete=models.CASCADE, related_name='hotels')
    name = models.CharField(max_length=255)
    location = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return self.name

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
    
