from django.db import models
from identity.models import Workstation

class SoftwareRelease(models.Model):
    TARGET_CHOICES = [
        ('POS_FRONTEND', 'Frontend POS (React/Flutter)'),
        ('POS_SERVICE', 'Serviço Local POS (Spooler/Hardware)'),
        ('BACKEND', 'Servidor ERP (Django)'),
    ]

    version_number = models.CharField(max_length=50, unique=True)
    target_module = models.CharField(max_length=50, choices=TARGET_CHOICES)
    release_date = models.DateTimeField()
    release_notes = models.TextField(blank=True, null=True)
    
    download_url = models.URLField(blank=True, null=True)
    checksum = models.CharField(max_length=255, blank=True, null=True) # SHA256
    
    is_mandatory = models.BooleanField(default=False)
    
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.target_module} v{self.version_number}"

class WorkstationUpdateStatus(models.Model):
    STATUS_CHOICES = [
        ('Pending', 'Pendente'),
        ('Downloading', 'A Transferir'),
        ('Installed', 'Instalado'),
        ('Failed', 'Falha na Instalação'),
    ]

    workstation = models.ForeignKey(Workstation, on_delete=models.CASCADE, related_name='update_statuses')
    release = models.ForeignKey(SoftwareRelease, on_delete=models.CASCADE)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Pending')
    last_checked = models.DateTimeField(auto_now=True)
    error_log = models.TextField(blank=True, null=True)

    class Meta:
        unique_together = ('workstation', 'release')

    def __str__(self):
        return f"{self.workstation.name} - v{self.release.version_number} ({self.status})"
