import os
import glob

search_dir = r"c:\Users\DELL\Desktop\POS\backend"

for root, _, _ in os.walk(search_dir):
    for f in glob.glob(os.path.join(root, '*.py')):
        with open(f, 'r', encoding='utf-8') as file:
            content = file.read()
        
        new_content = content.replace('identity.models import Company, Department', 'identity.models import Company, Department')
        new_content = new_content.replace('identity.models import Company', 'identity.models import Company')
        new_content = new_content.replace('identity.models import Department', 'identity.models import Department')
        
        if content != new_content:
            with open(f, 'w', encoding='utf-8') as file:
                file.write(new_content)
            print(f"Updated {f}")
