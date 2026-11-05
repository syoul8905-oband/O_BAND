import sys
import json
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://gideypynmhpjucgszyce.supabase.co"
ANON_KEY = "sb_publishable_pLF_neZMUjj3G7PsiH_tuw_rfRuu8eP"

headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Accept": "application/json"
}

for sheet in ["OBAND_CONFIG", "OBAND_RESERVATION", "OBAND_NOTICE", "OBAND_SETLIST", "OBAND_MEMBER"]:
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/delivery_schedules?source_sheet=eq.{sheet}&select=id,customer_name,driver_name,delivery_date,status", headers=headers)
    with urllib.request.urlopen(req) as resp:
        rows = json.loads(resp.read().decode('utf-8'))
        print(f"[{sheet}] Count: {len(rows)}")
        for r in rows:
            print("  ", r)
