from django.db import models

class TelemetryEvent(models.Model):
    SEVERITY_CHOICES = [
        ('INFO', 'Informação'),
        ('WARNING', 'Aviso'),
        ('CRITICAL', 'Crítico'),
    ]

    service = models.CharField(max_length=100) # Ex: POS_API, ERP_CORE, EAE
    event_type = models.CharField(max_length=100) # Ex: ENDPOINT_HIT, EXCEPTION, HEAVY_QUERY
    severity = models.CharField(max_length=20, choices=SEVERITY_CHOICES, default='INFO')
    
    payload = models.JSONField(blank=True, null=True)
    identity_ref = models.CharField(max_length=255, blank=True, null=True) # Quem provocou o evento
    
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    execution_time_ms = models.IntegerField(blank=True, null=True) # Para monitorizar performance
    
    timestamp = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"[{self.severity}] {self.service} - {self.event_type} at {self.timestamp}"

class SystemAlert(models.Model):
    title = models.CharField(max_length=255)
    description = models.TextField()
    is_resolved = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    resolved_at = models.DateTimeField(blank=True, null=True)

    def __str__(self):
        return f"ALERT: {self.title} (Resolved: {self.is_resolved})"
