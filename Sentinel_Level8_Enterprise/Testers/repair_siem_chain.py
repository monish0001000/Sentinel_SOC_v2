import sqlite3
import hashlib
from pathlib import Path

def _find_siem_db() -> Path | None:
    candidates = [
        Path(__file__).resolve().parent.parent / "c2_core" / "sentinel_siem.db",
        Path(__file__).resolve().parent.parent / "sentinel_siem.db"
    ]
    for c in candidates:
        if c.exists():
            return c
    return None

def _calculate_hash(log_id: str, timestamp: str, prev_hash: str, message: str) -> str:
    payload = f"{log_id}{timestamp}{prev_hash}{message}"
    return hashlib.sha256(payload.encode()).hexdigest()

def repair_chain():
    print("╔══════════════════════════════════════════════════════════════╗")
    print("║  Sentinel SIEM — Blockchain Ledger Repair Tool               ║")
    print("╚══════════════════════════════════════════════════════════════╝")
    
    db_path = _find_siem_db()
    if not db_path:
        print("\n❌ Error: sentinel_siem.db not found.")
        return

    print(f"\n📂 Database located at: {db_path}")
    print("🔧 Initiating cryptographic chain repair...\n")

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    # We select all logs ordered chronologically by timestamp and id to ensure deterministic order.
    # We'll use the table's auto-incrementing id as the primary key for the update.
    cursor.execute("SELECT id, timestamp, message, prev_hash, hash FROM logs ORDER BY timestamp ASC, id ASC")
    rows = cursor.fetchall()

    if not rows:
        print("✅ Ledger is empty. Nothing to repair.")
        conn.close()
        return

    # Genesis block starting hash
    current_prev_hash = "00000000000000000000000000000000"
    repaired_count = 0
    total_logs = len(rows)

    try:
        # We wrap the update in a transaction
        cursor.execute("BEGIN TRANSACTION")
        
        for idx, row in enumerate(rows):
            log_id = row["id"]
            timestamp = row["timestamp"]
            message = row["message"]
            
            # Recalculate hash using the correct prev_hash
            new_hash = _calculate_hash(log_id, timestamp, current_prev_hash, message)
            
            # Update the row if either hash or prev_hash is mismatched
            if row["prev_hash"] != current_prev_hash or row["hash"] != new_hash:
                cursor.execute(
                    "UPDATE logs SET prev_hash = ?, hash = ? WHERE id = ?",
                    (current_prev_hash, new_hash, log_id)
                )
                repaired_count += 1

            # The new_hash becomes the prev_hash for the next log entry
            current_prev_hash = new_hash
            
            if (idx + 1) % 1000 == 0:
                print(f"   Processed {idx + 1}/{total_logs} logs...")

        cursor.execute("COMMIT")
        print(f"\n✅ Repair completed successfully!")
        print(f"   Total logs scanned : {total_logs}")
        print(f"   Mismatched repaired: {repaired_count}")
        print("\n🛡️  The cryptographic chain is now fully unbroken.")

    except Exception as e:
        cursor.execute("ROLLBACK")
        print(f"\n❌ Repair failed! Rolled back changes. Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    repair_chain()
