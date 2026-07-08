from django.db import models
from identity.models import Hotel, Workstation

class Peripheral(models.Model):
    TYPE_CHOICES = [
        ('Printer', 'Impressora'),
        ('Drawer', 'Gaveta de Dinheiro'),
        ('Scanner', 'Leitor de Códigos de Barras'),
        ('Display', 'Display de Cliente'),
        ('Scale', 'Balança'),
        ('PaymentTerminal', 'Terminal de Pagamento (TPA)'),
        ('RFIDReader', 'Leitor RFID'),
        ('Biometric', 'Leitor Biométrico'),
    ]

    STATUS_CHOICES = [
        ('Available', 'Disponível'),
        ('InUse', 'Em Uso'),
        ('Offline', 'Offline'),
        ('Broken', 'Avariado'),
        ('Repair', 'Em Reparação'),
    ]

    CONNECTION_CHOICES = [
        ('Network', 'Rede (TCP/IP)'),
        ('USB', 'USB'),
        ('Serial', 'Série (RS232)'),
        ('Bluetooth', 'Bluetooth'),
    ]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name='peripherals')
    
    peripheral_type = models.CharField(max_length=50, choices=TYPE_CHOICES)
    brand = models.CharField(max_length=100)
    model = models.CharField(max_length=100)
    serial_number = models.CharField(max_length=100, unique=True, blank=True, null=True)
    
    mac_address = models.CharField(max_length=50, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    
    connection_type = models.CharField(max_length=20, choices=CONNECTION_CHOICES, default='Network')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Available')
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"[{self.get_peripheral_type_display()}] {self.brand} {self.model} - {self.status}"

class WorkstationPeripheral(models.Model):
    PURPOSE_CHOICES = [
        ('Receipt', 'Faturas/Talões'),
        ('Kitchen_Hot', 'Cozinha Quente'),
        ('Kitchen_Cold', 'Cozinha Fria'),
        ('Bar_Drinks', 'Bar Bebidas'),
        ('Drawer_1', 'Gaveta Principal'),
        ('Customer_Display', 'Display Cliente'),
        ('Payment_Primary', 'TPA Principal'),
        ('Scanner_Primary', 'Scanner Principal'),
        ('Auth_Reader', 'Leitor de Autenticação (RFID/Bio)'),
    ]

    workstation = models.ForeignKey(Workstation, on_delete=models.CASCADE, related_name='attached_peripherals')
    peripheral = models.ForeignKey(Peripheral, on_delete=models.CASCADE, related_name='attachments')
    
    logical_purpose = models.CharField(max_length=50, choices=PURPOSE_CHOICES)
    connection_params = models.JSONField(blank=True, null=True) # Ex: {"baud_rate": 9600, "com_port": "COM3"}
    
    is_active = models.BooleanField(default=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('workstation', 'peripheral')

    def __str__(self):
        return f"{self.workstation.name} -> {self.peripheral.brand} ({self.get_logical_purpose_display()})"
