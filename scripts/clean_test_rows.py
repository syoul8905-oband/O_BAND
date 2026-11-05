import sys
import json
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://gideypynmhpjucgszyce.supabase.co"
ANON_KEY = "sb_publishable_pLF_neZMUjj3G7PsiH_tuw_rfRuu8eP"

headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json"
}

# Clean up test rows
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/delivery_schedules?source_sheet=eq.OBAND_RESERVATION&customer_name=eq.%EC%9E%90%EB%8F%99%EA%B2%80%EC%A6%9D%EB%B6%80%EC%9B%90", headers=headers, method="DELETE")
with urllib.request.urlopen(req) as resp:
    print("Cleaned up test reservations:", resp.status)

# Also verify remaining reservations
req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/delivery_schedules?source_sheet=eq.OBAND_RESERVATION&order=id.asc", headers=headers)
with urllib.request.urlopen(req) as resp:
    rows = json.loads(resp.read().decode('utf-8'))
    print(f"\nCurrent reservations in Supabase ({len(rows)}):")
    for r in rows:
        print(f"  [{r['id']}] {r['delivery_date']} {r['visit_time']}~{r['contract_no']} : {r['customer_name']} ({r['driver_name']}) status={r['status']}")
