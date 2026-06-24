import sqlite3
import json
import os
import hashlib
from datetime import datetime
from core.event_bus import EventBus
import uuid

DB_FILE = "sentinel_siem.db"

class LogRepository:
    def __init__(self, bus: EventBus):
        self.bus = bus
        self.conn = sqlite3.connect(DB_FILE, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.ensure_schema()
        
        self.bus.subscribe("alert", self.handle_alert)
        self.bus.subscribe("system_event", self.handle_system_event)
        self.bus.subscribe("firewall_event", self.handle_firewall_event)
        self.bus.subscribe("auth_event", self.handle_auth_event)

    def ensure_schema(self):
        cursor = self.conn.cursor()
        
        # Base Table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS logs (
                id TEXT PRIMARY KEY,
                timestamp DATETIME,
                level TEXT,
                message TEXT,
                source TEXT,
                type TEXT,
                metadata TEXT,
                prev_hash TEXT,
                hash TEXT
            )
        ''')
        
        # Check if columns exist (Migration)
        try:
            cursor.execute("SELECT hash FROM logs LIMIT 1")
        except sqlite3.OperationalError:
            print("[SIEM] Migrating Database: Adding hash columns...")
            cursor.execute("ALTER TABLE logs ADD COLUMN prev_hash TEXT")
            cursor.execute("ALTER TABLE logs ADD COLUMN hash TEXT")
            
        self.conn.commit()

    def _calculate_hash(self, log_id, timestamp, prev_hash, message):
        payload = f"{log_id}{timestamp}{prev_hash}{message}"
        return hashlib.sha256(payload.encode()).hexdigest()

    def _get_last_hash(self):
        cursor = self.conn.cursor()
        cursor.execute("SELECT hash FROM logs ORDER BY timestamp DESC LIMIT 1")
        row = cursor.fetchone()
        return row['hash'] if row else "00000000000000000000000000000000"

    async def handle_alert(self, data):
        await self.log_event(
            level=data.get("level", "WARNING"),
            message=data.get("message"),
            source=data.get("source", "System"),
            log_type=data.get("type", "Alert"),
            metadata=data
        )

    async def handle_system_event(self, data):
        # Filter high-freq events
        if data.get("type") == "error":
             await self.log_event("ERROR", f"System Error: {data.get('error')}", "System", "Error", data)

    async def handle_firewall_event(self, data):
        if data.get("type") in ["rule_added", "rule_removed", "panic_change", "status_change", "policy_updated"]:
            await self.log_event(
                level="INFO",
                message=f"Firewall Event: {data.get('type')}",
                source="Firewall",
                log_type="Config",
                metadata=data
            )
            
    async def handle_auth_event(self, data):
        await self.log_event(
            level="INFO" if data.get("type") == "login_success" else "WARNING",
            message=f"Auth: {data.get('type')} - {data.get('username')}",
            source="AuthService",
            log_type="Security",
            metadata=data
        )

    async def log_event(self, level, message, source, log_type, metadata=None):
        try:
            log_id = str(uuid.uuid4())
            timestamp = datetime.utcnow().isoformat()
            meta_json = json.dumps(metadata) if metadata else "{}"
            
            # Chain Logic
            prev_hash = self._get_last_hash()
            current_hash = self._calculate_hash(log_id, timestamp, prev_hash, message)
            
            cursor = self.conn.cursor()
            cursor.execute(
                "INSERT INTO logs (id, timestamp, level, message, source, type, metadata, prev_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (log_id, timestamp, level, message, source, log_type, meta_json, prev_hash, current_hash)
            )
            self.conn.commit()
        except Exception as e:
            print(f"[SIEM] Error logging: {e}")

    def get_logs(self, limit=100, log_type=None, level=None):
        cursor = self.conn.cursor()
        query = "SELECT * FROM logs"
        params = []
        conditions = []
        
        if log_type:
            conditions.append("type = ?")
            params.append(log_type)
        if level:
            conditions.append("level = ?")
            params.append(level)
            
        if conditions:
            query += " WHERE " + " AND ".join(conditions)
            
        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

    def verify_integrity(self):
        """
        Walks the blockchain to verify integrity.
        Returns: {valid: bool, broken_at: id}
        """
        print("[SIEM] Verifying Ledger Integrity...")
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM logs ORDER BY timestamp ASC")
        rows = cursor.fetchall()
        
        prev_hash = "00000000000000000000000000000000"
        
        for row in rows:
            # Re-calc hash
            recalc = self._calculate_hash(row['id'], row['timestamp'], prev_hash, row['message'])
            
            if row['prev_hash'] != prev_hash:
                 print(f"[SIEM] INTEGRITY ERROR: Chain broken at ID {row['id']}. Prev Hash Mismatch.")
                 return {"valid": False, "broken_at": row['id'], "reason": "prev_hash mismatch"}
                 
            if row['hash'] != recalc:
                 print(f"[SIEM] INTEGRITY ERROR: Chain broken at ID {row['id']}. Content Modified.")
                 return {"valid": False, "broken_at": row['id'], "reason": "hash mismatch"}
            
            prev_hash = row['hash']
            
        print("[SIEM] Ledger Integrity Verified. Chain Valid.")
        return {"valid": True}

    def close(self):
        self.conn.close()
