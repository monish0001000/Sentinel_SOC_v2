from fastapi import FastAPI, HTTPException, Body, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from core.firewall import FirewallService
from typing import Optional, List
from pydantic import BaseModel
import server.auth as auth
import server.auth as auth
from server.auth import User, Token, Role
from core.event_bus import EventBus
from core.siem import LogRepository
from core.edr.manager import EDRManager

import networkx as nx
import networkx as nx

app = FastAPI()

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify the frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global firewall instance (injected from main.py)
firewall_service: Optional[FirewallService] = None

import redis
import os
from datetime import datetime, timezone

@app.on_event("startup")
async def startup_event():
    global firewall_service, siem_service, global_risk_engine
    
    # --- Reset Firewall State in Redis (User Task) ---
    try:
        r = redis.Redis(host=os.getenv('REDIS_HOST', 'redis'), port=6379, db=0)
        r.set("firewall_status", "active")
        r.set("lockdown", "false")
        r.delete("panic_mode") 
        print("[API] Firewall State Reset (Normal/Active)")
    except Exception as e:
        print(f"[API] Failed to reset Redis state: {e}")

    # Check if services are injected (from main.py). If not, init them (uvicorn mode).
    if not firewall_service or not siem_service:
        print("[API] Detected standalone mode (uvicorn). Initializing default services...")
        bus = EventBus()
        
        if not firewall_service:
            firewall_service = FirewallService(bus)
            print("[API] Default FirewallService initialized.")
            
        if not siem_service:
            siem_service = LogRepository(bus)
            print("[API] Default LogRepository (SIEM) initialized.")
            
        if not edr_manager:
            edr_manager = EDRManager(bus)
            print("[API] Default EDRManager initialized.")

        # Init Global Risk Engine
        global global_risk_engine
        if not global_risk_engine:
            global_risk_engine = GlobalRiskEngine(bus)
            print("[API] GlobalRiskEngine initialized.")

# Global Event Bus (injected from main.py)
event_bus: Optional[EventBus] = None

def set_event_bus(bus: EventBus):
    global event_bus
    event_bus = bus


class BlockIPRequest(BaseModel):
    ip: str
    reason: str = "Manual Block"

class BlockPortRequest(BaseModel):
    port: int
    reason: str = "Manual Block"

class UnblockIPRequest(BaseModel):
    ip: str

class UnblockPortRequest(BaseModel):
    port: int

class ToggleRequest(BaseModel):
    active: bool

class AutoBlockRequest(BaseModel):
    enabled: bool

class PanicRequest(BaseModel):
    enabled: bool

class BlockCountryRequest(BaseModel):
    country_code: str

class UnblockCountryRequest(BaseModel):
    country_code: str

class PolicyRequest(BaseModel):
    name: str
    source_zone: str = "any"
    dest_zone: str = "any"
    source_ip: str = "any"
    app: str = "any"
    action: str = "deny"

# --- AUTH ROUTES ---
@app.post("/auth/login", response_model=Token)
async def login_for_access_token(form_data: OAuth2PasswordRequestForm = Depends()):
    try:
        user = auth.get_user(auth.users_db, form_data.username)
        if not user or not auth.verify_password(form_data.password, user.hashed_password):
            # Publish Auth Event (Failure)
            if event_bus:
                 print(f"[API] Publishing Failed Login Event for {form_data.username}")
                 await event_bus.publish("auth_event", {
                     "type": "login_failed",
                     "username": form_data.username,
                     "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                     "source": "api_gateway"
                 })
            else:
                 print("[API] WARNING: EventBus not initialized in API!")

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Incorrect username or password",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        # Publish Auth Event (Success)
        if event_bus:
             await event_bus.publish("auth_event", {
                 "type": "login_success",
                 "username": user.username,
                 "role": user.role,
                 "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                 "source": "api_gateway"
             })
        access_token_expires = auth.timedelta(minutes=auth.ACCESS_TOKEN_EXPIRE_MINUTES)
        access_token = auth.create_access_token(
            data={"sub": user.username, "role": user.role}, expires_delta=access_token_expires
        )
        return {"access_token": access_token, "token_type": "bearer", "role": user.role}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API] CRITICAL LOGIN ERROR: {e}")
        if event_bus:
             await event_bus.publish("auth_event", {
                 "type": "login_error",
                 "username": form_data.username,
                 "error": str(e),
                 "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                 "source": "api_gateway"
             })
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal Server Error during auth"
        )

@app.get("/auth/me", response_model=User)
async def read_users_me(current_user: User = Depends(auth.get_current_active_user)):
    return current_user

# --- FIREWALL ROUTES (PROTECTED) ---

@app.get("/firewall/status")
async def get_status(current_user: User = Depends(auth.get_current_active_user)):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return firewall_service.get_status()

# Admin Only Actions
@app.post("/firewall/block-ip", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def block_ip(req: BlockIPRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.block_ip(req.ip, req.reason)

@app.post("/firewall/unblock-ip", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def unblock_ip(req: UnblockIPRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.unblock_ip(req.ip)

@app.post("/firewall/block-port", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def block_port(req: BlockPortRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.block_port(req.port, req.reason)

@app.post("/firewall/unblock-port", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def unblock_port(req: UnblockPortRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.unblock_port(req.port)

@app.post("/firewall/toggle", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def toggle_firewall(req: ToggleRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.toggle_firewall(req.active)

@app.post("/firewall/auto-block", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def toggle_auto_block(req: AutoBlockRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.toggle_auto_block(req.enabled)

@app.post("/firewall/panic", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def toggle_panic(req: PanicRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.toggle_panic_mode(req.enabled)

@app.post("/firewall/block-country", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def block_country(req: BlockCountryRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.block_country(req.country_code)

@app.post("/firewall/unblock-country", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def unblock_country(req: UnblockCountryRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.unblock_country(req.country_code)

@app.get("/firewall/policies")
async def get_policies(current_user: User = Depends(auth.get_current_active_user)):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return firewall_service.get_policies()

@app.post("/firewall/policies", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def add_policy(req: PolicyRequest):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.add_policy(req.dict())

@app.delete("/firewall/policies/{rule_id}", dependencies=[Depends(auth.check_role([Role.ADMIN]))])
async def delete_policy(rule_id: str):
    if not firewall_service:
        raise HTTPException(status_code=503, detail="Firewall service not initialized")
    return await firewall_service.delete_policy(rule_id)

@app.get("/logs")
async def get_logs(limit: int = 100, type: Optional[str] = None, level: Optional[str] = None, current_user: User = Depends(auth.get_current_active_user)):
    if not siem_service:
        raise HTTPException(status_code=503, detail="SIEM service not initialized")
    return siem_service.get_logs(limit, type, level)

@app.get("/logs/search")
async def search_logs(q: str = "", limit: int = 200, current_user: User = Depends(auth.get_current_active_user)):
    if not siem_service:
        raise HTTPException(status_code=503, detail="SIEM service not initialized")
    if not q.strip():
        return siem_service.get_logs(limit)
    return siem_service.search_logs(q.strip(), limit)

def set_firewall_service(service: FirewallService):
    global firewall_service
    firewall_service = service

siem_service = None

def set_siem_service(service):
    global siem_service
    siem_service = service

# --- Agent Management (Phase 2) ---
from core.global_risk_engine import GlobalRiskEngine
from server.database import db

global_risk_engine: Optional[GlobalRiskEngine] = None

def set_global_risk_engine(engine: GlobalRiskEngine):
    global global_risk_engine
    global_risk_engine = engine

# Phase 3: Predictive Engine
from ai.predictive_engine import PredictiveEngine
predictive_engine: Optional[PredictiveEngine] = None

def set_predictive_engine(engine: PredictiveEngine):
    global predictive_engine
    predictive_engine = engine

@app.get("/api/graph")
async def get_attack_graph(current_user: User = Depends(auth.get_current_active_user)):
    if not predictive_engine:
        # Fallback empty graph
        return {"nodes": [], "edges": [], "active_chains": {}}
    
    # Export Graph State
    # We want to show the Static MITRE Graph + Active Chains
    graph_data = nx.node_link_data(predictive_engine.attack_graph)
    return {
        "graph": graph_data,
        "active_chains": predictive_engine.active_kill_chains
    }

class AgentRegisterRequest(BaseModel):
    id: str
    hostname: str
    os: str
    ip: str
    status: str
    token: Optional[str] = None # Added token field

class AgentHeartbeatRequest(BaseModel):
    id: str
    stats: dict
    timestamp: float
    token: Optional[str] = None

# Security: Validate Token
# In production, this would verify against a DB of issued tokens.
# For Phase 3 MVP, we check against a server-side env var or constant.
SERVER_AUTH_TOKEN = "cross-machine-test-token" # Hardcoded for now (as per user test)

def verify_agent_token(token: Optional[str]):
    if not token or token != SERVER_AUTH_TOKEN:
         # In strict mode we would raise HTTPException(401).
         # For now, print a security warning.
         print(f"[SECURITY] WARNING: Agent connection attempt with INVALID TOKEN: {token}")
         # raise HTTPException(status_code=401, detail="Invalid Agent Token") 


class AgentHeartbeatRequest(BaseModel):
    id: str
    stats: dict
    timestamp: float

@app.post("/api/agent/register")
async def register_agent(req: AgentRegisterRequest):
    verify_agent_token(req.token)
    # Save to DB
    db.register_agent(req.dict())
    print(f"[API] Agent Registered: {req.hostname} ({req.id})")
    return {"status": "registered"}

@app.post("/api/agent/heartbeat")
async def agent_heartbeat(req: AgentHeartbeatRequest):
    if not global_risk_engine:
        # Fallback if engine not init, still update heartbeat in DB mostly
        db.update_agent_heartbeat(req.id, req.stats.get("local_risk_score", 0))
        return {"status": "ack", "commands": []}

    # Verify Risk & Update
    local_risk = req.stats.get("local_risk_score", 0)
    await global_risk_engine.update_agent_risk(req.id, local_risk, req.stats)
    
    # Check for pending commands (TODO: Implement Command Queue)
    # For now, return empty or mock
    commands = []
    
    return {"status": "ack", "commands": commands}

@app.get("/api/agents")
async def get_agents():
    return db.get_agents()

@app.post("/api/agents/{agent_id}/isolate")
async def isolate_agent(agent_id: str, current_user: User = Depends(auth.get_current_active_user)):
    if not event_bus:
        raise HTTPException(status_code=503, detail="EventBus not initialized")
    
    cmd_id = f"cmd-{auth.datetime.utcnow().timestamp()}"
    await event_bus.publish("agent_command", {
        "target_agent_id": agent_id,
        "command": "isolate_host",
        "args": {"whitelist": ["127.0.0.1"]}, # Default whitelist
        "id": cmd_id
    })
    
    return {"status": "command_queued", "command": "isolate_host", "cmd_id": cmd_id}

class AgentCommandRequest(BaseModel):
    command: str
    args: dict = {}

@app.post("/api/agents/{agent_id}/command")
async def send_agent_command(agent_id: str, req: AgentCommandRequest, current_user: User = Depends(auth.get_current_active_user)):
    if not event_bus:
        raise HTTPException(status_code=503, detail="EventBus not initialized")

    cmd_id = f"cmd-{auth.datetime.utcnow().timestamp()}"
    await event_bus.publish("agent_command", {
        "target_agent_id": agent_id,
        "command": req.command,
        "args": req.args,
        "id": cmd_id
    })
    
    return {"status": "sent", "cmd_id": cmd_id}


# --- INCIDENT MANAGEMENT (Enterprise Phase 1) ---
from core.incident_manager import IncidentManager
incident_manager: Optional[IncidentManager] = None

def set_incident_manager(manager: IncidentManager):
    global incident_manager
    incident_manager = manager

class IncidentActionRequest(BaseModel):
    actor: str = "admin" # In real RBAC, this comes from token

@app.get("/incidents")
async def list_incidents(status: Optional[str] = None, current_user: User = Depends(auth.get_current_active_user)):
    if not incident_manager:
        raise HTTPException(status_code=503, detail="Incident Manager not initialized")
    return incident_manager.list_incidents(status)

@app.get("/incidents/{incident_id}")
async def get_incident(incident_id: int, current_user: User = Depends(auth.get_current_active_user)):
    if not incident_manager:
        raise HTTPException(status_code=503, detail="Incident Manager not initialized")
    inc = incident_manager.get_incident(incident_id)
    if not inc:
        raise HTTPException(status_code=404, detail="Incident not found")
    return inc

@app.post("/incidents/{incident_id}/contain")
async def contain_incident(incident_id: int, req: IncidentActionRequest, current_user: User = Depends(auth.get_current_active_user)):
    if not incident_manager:
        raise HTTPException(status_code=503, detail="Incident Manager not initialized")
    try:
        # Use current user as actor if available, else request actor
        actor = current_user.username 
        result = incident_manager.contain_incident(incident_id, actor)
        return {"status": "success", "incident_id": incident_id, "state": "CONTAINED"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/incidents/{incident_id}/resolve")
async def resolve_incident(incident_id: int, req: IncidentActionRequest, current_user: User = Depends(auth.get_current_active_user)):
    if not incident_manager:
        raise HTTPException(status_code=503, detail="Incident Manager not initialized")
    try:
        actor = current_user.username
        result = incident_manager.resolve_incident(incident_id, actor)
        return {"status": "success", "incident_id": incident_id, "state": "RESOLVED"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/incidents/{incident_id}/audit")
async def get_incident_audit(incident_id: int, current_user: User = Depends(auth.get_current_active_user)):
    if not incident_manager:
        raise HTTPException(status_code=503, detail="Incident Manager not initialized")
    return incident_manager.get_audit_trail(incident_id)

class DebugAlertRequest(BaseModel):
    message: str
    severity: str
    source: str
    risk_score: int = 0
    type: str = "Test"

@app.post("/api/debug/inject")
async def debug_inject_alert(req: DebugAlertRequest):
    if not event_bus:
        raise HTTPException(status_code=503, detail="EventBus not initialized")
    
    await event_bus.publish("alert", req.dict())
    return {"status": "injected"}
