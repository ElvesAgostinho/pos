from django.db import migrations

# Os 14 alergénios de declaração obrigatória na UE (Reg. 1169/2011).
ALLERGENS = [
    ("GLUTEN", "Cereais com glúten"),
    ("CRUSTACEANS", "Crustáceos"),
    ("EGGS", "Ovos"),
    ("FISH", "Peixe"),
    ("PEANUTS", "Amendoins"),
    ("SOY", "Soja"),
    ("MILK", "Leite"),
    ("NUTS", "Frutos de casca rija"),
    ("CELERY", "Aipo"),
    ("MUSTARD", "Mostarda"),
    ("SESAME", "Sementes de sésamo"),
    ("SULPHITES", "Dióxido de enxofre e sulfitos"),
    ("LUPIN", "Tremoço"),
    ("MOLLUSCS", "Moluscos"),
]


def seed(apps, schema_editor):
    Allergen = apps.get_model('production', 'Allergen')
    for code, name in ALLERGENS:
        Allergen.objects.get_or_create(code=code, defaults={'name': name})


def unseed(apps, schema_editor):
    Allergen = apps.get_model('production', 'Allergen')
    Allergen.objects.filter(code__in=[c for c, _ in ALLERGENS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('production', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
