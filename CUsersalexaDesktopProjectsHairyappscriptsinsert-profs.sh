#!/bin/bash

API_URL="https://aujlzfmrtafbmmjybjxz.supabase.co/rest/v1"
API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF1amx6Zm1ydGFmYm1tanlianh6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MjI5NDU3NywiZXhwIjoyMDg3ODcwNTc3fQ.zS5vCJeXDTlfdafNYZ6ct4pbE6Bk7QNyOym79jTzL60"

# Insertar profesionales
curl -X POST "$API_URL/profesionales" \
  -H "apikey: $API_KEY" \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '[
    {"negocio_id":"prueba_46980","nombre":"Carla","color":"#8b5cf6","rol":"Estilista Senior","activo":true},
    {"negocio_id":"prueba_46980","nombre":"Diego","color":"#10b981","rol":"Barbero","activo":true},
    {"negocio_id":"prueba_46980","nombre":"Sofía","color":"#f59e0b","rol":"Colorista","activo":true},
    {"negocio_id":"prueba_46980","nombre":"Marco","color":"#06b6d4","rol":"Barbero Junior","activo":true}
  ]'

echo "Profesionales creados"
