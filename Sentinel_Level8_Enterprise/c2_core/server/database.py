
import sqlite3
import threading
from datetime import datetime
from typing import List, Dict, Optional

DB_PATH = "sentinel.db"

class Database:
    def __init__(self):
        self._local = threading.local()
        self._init_db()

    def _get_conn(self):
        if not hasattr(self._local, "conn"):
            self._local.conn = sqlite3.connect(DB_PATH, check_same_thread=False)
            self._local.conn.row_factory = sqlite3.Row
        return self._local.conn



    def create_incident(self, data: Dict) -> int:
        conn = self._get_conn()
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO incidents (incident_type, severity, source, description, status, risk_score, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.get("type", "SecurityAlert"),
            data.get("severity", "CRITICAL"),
            data.get("source", "Unknown"),
            data.get("description", ""),
            "OPEN",
            data.get("risk_score", 0),
            now,
            now
        ))
        conn.commit()
        return cursor.lastrowid

    def update_incident_status(self, incident_id: int, status: str) -> bool:
        conn = self._get_conn()
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            UPDATE incidents 
            SET status = ?, updated_at = ?
            WHERE id = ?
        """, (status, now, incident_id))
        conn.commit()
        return cursor.rowcount > 0

    def get_incident(self, incident_id: int) -> Optional[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM incidents WHERE id = ?", (incident_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

    def list_incidents(self, status_filter: Optional[str] = None) -> List[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        if status_filter:
            cursor.execute("SELECT * FROM incidents WHERE status = ? ORDER BY created_at DESC", (status_filter,))
        else:
            cursor.execute("SELECT * FROM incidents ORDER BY created_at DESC")
        return [dict(row) for row in cursor.fetchall()]

    def log_audit(self, incident_id: int, action: str, actor: str):
        conn = self._get_conn()
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            INSERT INTO audit_logs (incident_id, action, actor, timestamp)
            VALUES (?, ?, ?, ?)
        """, (incident_id, action, actor, now))
        conn.commit()

    def get_audit_logs(self, incident_id: int) -> List[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM audit_logs WHERE incident_id = ? ORDER BY timestamp ASC", (incident_id,))
        return [dict(row) for row in cursor.fetchall()]

    def _init_db(self):
        # Use a new connection for initialization to avoid thread issues
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Incidents Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS incidents (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_type TEXT,
                severity TEXT,
                source TEXT,
                description TEXT,
                status TEXT DEFAULT 'OPEN',
                risk_score INTEGER,
                created_at TIMESTAMP,
                updated_at TIMESTAMP
            )
        """)

        # Audit Logs Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                incident_id INTEGER,
                action TEXT,
                actor TEXT,
                timestamp TIMESTAMP,
                FOREIGN KEY(incident_id) REFERENCES incidents(id)
            )
        """)

        # Agents Table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS agents (
                agent_id TEXT PRIMARY KEY,
                hostname TEXT,
                ip_address TEXT,
                os TEXT,
                status TEXT,
                local_risk INTEGER DEFAULT 0,
                last_seen TIMESTAMP
            )
        """)
        
        # Enforce "Empty by Default" Policy: Clear agents on boot
        # This ensures no stale/saved agents appear until they actually connect
        cursor.execute("DELETE FROM agents")

        
        conn.commit()
        conn.close()

    # --- Agent Methods ---
    def register_agent(self, agent: Dict):
        conn = self._get_conn()
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        # Check if exists
        cursor.execute("SELECT agent_id FROM agents WHERE agent_id = ?", (agent['id'],))
        exists = cursor.fetchone()
        
        if exists:
            cursor.execute("""
                UPDATE agents SET hostname=?, ip_address=?, os=?, status='ONLINE', last_seen=?
                WHERE agent_id=?
            """, (agent['hostname'], agent['ip'], agent['os'], now, agent['id']))
        else:
            cursor.execute("""
                INSERT INTO agents (agent_id, hostname, ip_address, os, status, last_seen)
                VALUES (?, ?, ?, ?, 'ONLINE', ?)
            """, (agent['id'], agent['hostname'], agent['ip'], agent['os'], now))
            
        conn.commit()

    def update_agent_heartbeat(self, agent_id: str, risk_score: int):
        conn = self._get_conn()
        cursor = conn.cursor()
        now = datetime.utcnow().isoformat()
        
        cursor.execute("""
            UPDATE agents SET status='ONLINE', last_seen=?, local_risk=?
            WHERE agent_id=?
        """, (now, risk_score, agent_id))
        conn.commit()

    def get_agents(self) -> List[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        
        # Check for stale agents using 3-state logic
        cursor.execute("SELECT agent_id, last_seen, status FROM agents")
        rows = cursor.fetchall()
        
        now = datetime.utcnow()
        for row in rows:
            try:
                # Handle ISO format with or without milliseconds
                last_seen_str = row['last_seen']
                if "." in last_seen_str:
                    last_seen = datetime.strptime(last_seen_str, "%Y-%m-%dT%H:%M:%S.%f")
                else:
                    last_seen = datetime.strptime(last_seen_str, "%Y-%m-%dT%H:%M:%S")
                    
                diff = (now - last_seen).total_seconds()
                
                if diff > 60:
                     # STATE: REMOVED (Strict EDR: Delete stale agents)
                     print(f"[DB] Agent {row['agent_id']} dead ({diff}s). REMOVING from EDR.")
                     cursor.execute("DELETE FROM agents WHERE agent_id=?", (row['agent_id'],))
                     conn.commit()
                     
                elif diff > 30:
                    # STATE: IDLE (Warning)
                    if row['status'] != 'IDLE':
                        print(f"[DB] Agent {row['agent_id']} idle ({diff}s). Status -> IDLE.")
                        cursor.execute("UPDATE agents SET status='IDLE' WHERE agent_id=?", (row['agent_id'],))
                        conn.commit()

                else:
                    # STATE: ONLINE (Active)
                    if row['status'] != 'ONLINE':
                         # If it was offline/idle and came back (though update_heartbeat usually handles this)
                         cursor.execute("UPDATE agents SET status='ONLINE' WHERE agent_id=?", (row['agent_id'],))
                         conn.commit()

            except Exception as e:
                print(f"[DB] Error checking agent timeout: {e}")

        # Return updated list
        cursor.execute("SELECT * FROM agents")
        return [dict(row) for row in cursor.fetchall()]

    def get_agent(self, agent_id: str) -> Optional[Dict]:
        conn = self._get_conn()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM agents WHERE agent_id = ?", (agent_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


# Global DB Instance
db = Database()
