import sys
import json
import sqlite3
import urllib.request

sys.stdout.reconfigure(encoding='utf-8')

SUPABASE_URL = "https://gideypynmhpjucgszyce.supabase.co"
ANON_KEY = "sb_publishable_pLF_neZMUjj3G7PsiH_tuw_rfRuu8eP"

headers = {
    "apikey": ANON_KEY,
    "Authorization": f"Bearer {ANON_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation"
}

def post_rows(rows):
    if not rows:
        return []
    data = json.dumps(rows).encode('utf-8')
    req = urllib.request.Request(f"{SUPABASE_URL}/rest/v1/delivery_schedules", data=data, headers=headers, method="POST")
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

# Connect to local SQLite
conn = sqlite3.connect(r'C:\antigravity\오뺀\data\band_club.db')
conn.row_factory = sqlite3.Row
cur = conn.cursor()

print("--- 1. Migrating Settings ---")
cur.execute("SELECT * FROM system_settings")
settings_rows = []
for row in cur.fetchall():
    settings_rows.append({
        "source_sheet": "OBAND_CONFIG",
        "customer_name": row["setting_key"],
        "memo_full": row["setting_value"],
        "memo_special": row["description"] or ""
    })
res = post_rows(settings_rows)
print(f"Uploaded {len(res)} settings rows.")

print("--- 2. Migrating Reservations ---")
cur.execute("SELECT * FROM reservations ORDER BY id ASC")
reservation_rows = []
for row in cur.fetchall():
    memo_payload = {
        "original_id": row["id"],
        "res_date": row["res_date"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "member_name": row["member_name"],
        "band_team": row["band_team"],
        "part": row["part"],
        "purpose": row["purpose"] or "",
        "pin": row["pin"],
        "created_at": row["created_at"],
        "status": row["status"]
    }
    reservation_rows.append({
        "source_sheet": "OBAND_RESERVATION",
        "delivery_date": row["res_date"],
        "visit_time": row["start_time"],
        "contract_no": row["end_time"],
        "customer_name": row["member_name"],
        "driver_name": row["band_team"],
        "items": row["part"],
        "contact": row["pin"],
        "status": row["status"],
        "memo_special": row["purpose"] or "",
        "memo_full": json.dumps(memo_payload, ensure_ascii=False)
    })
res = post_rows(reservation_rows)
print(f"Uploaded {len(res)} reservation rows (including 최두성 ID 93).")

print("--- 3. Migrating Notices ---")
cur.execute("SELECT * FROM notices ORDER BY id ASC")
notice_rows = []
for row in cur.fetchall():
    notice_rows.append({
        "source_sheet": "OBAND_NOTICE",
        "driver_name": row["title"],
        "customer_name": row["author"],
        "category": row["category"],
        "contact": row["pin"],
        "stop_order": row["is_pinned"],
        "memo_full": row["content"],
        "memo_special": row["created_at"]
    })
res = post_rows(notice_rows)
print(f"Uploaded {len(res)} notice rows.")

print("--- 4. Migrating Setlists ---")
cur.execute("SELECT * FROM setlists ORDER BY id ASC")
setlist_rows = []
for row in cur.fetchall():
    setlist_rows.append({
        "source_sheet": "OBAND_SETLIST",
        "driver_name": row["title"],
        "customer_name": row["artist"],
        "items": row["key_info"] or "",
        "visit_time": row["tempo"] or "",
        "contract_no": row["sheet_url"] or "",
        "address": row["youtube_url"] or "",
        "status": row["status"] or "연습중",
        "memo_full": row["memo"] or "",
        "memo_special": row["created_at"]
    })
res = post_rows(setlist_rows)
print(f"Uploaded {len(res)} setlist rows.")

print("--- 5. Migrating Members ---")
cur.execute("SELECT * FROM members ORDER BY id ASC")
member_rows = []
for row in cur.fetchall():
    member_rows.append({
        "source_sheet": "OBAND_MEMBER",
        "customer_name": row["name"],
        "items": row["part"],
        "contact": row["phone"] or "",
        "category": row["role"] or "회원",
        "memo_special": row["created_at"]
    })
res = post_rows(member_rows)
print(f"Uploaded {len(res)} member rows.")

conn.close()
print("Migration to Supabase completed successfully!")
