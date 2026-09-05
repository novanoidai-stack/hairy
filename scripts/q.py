#!/usr/bin/env python3
"""Ejecuta SQL contra produccion via Management API. Uso: python scripts/q.py "sql ..." """
import json, os, subprocess, sys, tempfile

tok = subprocess.run(
    ['powershell', '-NoProfile', '-Command', 'Get-Content $env:TEMP\\sb_token.txt'],
    capture_output=True, text=True).stdout.strip()
body = json.dumps({'query': sys.argv[1]})
f = os.path.join(tempfile.gettempdir(), 'q_body.json')
with open(f, 'w', encoding='utf-8') as fh:
    fh.write(body)
os.system(f'curl -s -X POST "https://api.supabase.com/v1/projects/vtrggiogjrhqtwbhbgia/database/query" '
          f'-H "Authorization: Bearer {tok}" -H "Content-Type: application/json" '
          f'--data-binary @{f.replace(os.sep, "/")}')
print()
