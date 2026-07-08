from django.db import models
from django.contrib.auth.models import User
from identity.models import PosOperator, Workstation

class UserSession(models.Model):
    STATUS_CHOICES = [
        ('Active', 'Active'),
        ('Suspended', 'Suspended'), # Para Fast User Switching
        ('Expired', 'Expired'),
        ('Logged_Out', 'Logged_Out')
    ]

    # Pode ser uma sessão de Backoffice (User) ou de POS (PosOperator)
    user = models.ForeignKey(User, on_delete=models.CASCADE, blank=True, null=True, related_name='sessions')
    pos_operator = models.ForeignKey(PosOperator, on_delete=models.CASCADE, blank=True, null=True, related_name='sessions')
    
    workstation = models.ForeignKey(Workstation, on_delete=models.SET_NULL, blank=True, null=True)
    
    token_jti = models.CharField(max_length=255, unique=True, blank=True, null=True) # ID único do JWT
    
    login_time = models.DateTimeField(auto_now_add=True)
    last_activity = models.DateTimeField(auto_now=True)
    logout_time = models.DateTimeField(blank=True, null=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='Active')
    
    # Payload para Hibernação de Sessão (Ex: "A Maria estava a registar na Mesa 12")
    suspended_state = models.JSONField(blank=True, null=True)

    def __str__(self):
        return f"Session: {self.pos_operator.name if self.pos_operator else self.user.username} - {self.status}"

class AuthEventLog(models.Model):
    EVENT_CHOICES = [
        ('LOGIN_SUCCESS', 'Login Success'),
        ('LOGIN_FAILED_PASSWORD', 'Login Failed (Bad Password)'),
        ('LOGIN_FAILED_PIN', 'Login Failed (Bad PIN)'),
        ('LOGIN_FAILED_RFID', 'Login Failed (Bad RFID)'),
        ('LOGIN_FAILED_CONSTRAINT', 'Login Failed (Constraint)'),
        ('LOGOUT', 'Logout'),
        ('SESSION_SUSPENDED', 'Session Suspended'),
        ('SESSION_RESUMED', 'Session Resumed'),
    ]

    event_type = models.CharField(max_length=50, choices=EVENT_CHOICES)
    identity_attempt = models.CharField(max_length=255, blank=True, null=True) # Username ou Operador Code tentado
    workstation = models.ForeignKey(Workstation, on_delete=models.SET_NULL, blank=True, null=True)
    ip_address = models.GenericIPAddressField(blank=True, null=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    details = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.event_type} - {self.identity_attempt} at {self.timestamp}"
