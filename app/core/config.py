from functools import lru_cache
from dataclasses import dataclass, field
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode
import os
from dotenv import load_dotenv

# Optional local configuration. The app still runs when no .env file exists.
load_dotenv()

def _normalize_database_url(url: str) -> str:
    """Managed Postgres providers (Render, Heroku, Railway, ...) hand out
    'postgres://...?sslmode=require' connection strings. This app's async engine
    needs the asyncpg driver and asyncpg's own 'ssl' query param, not libpq's
    'sslmode' — without this, a pasted provider URL fails to even connect.
    """
    parts = urlsplit(url)
    if parts.scheme not in ('postgres', 'postgresql'):
        return url
    query = dict(parse_qsl(parts.query))
    sslmode = query.pop('sslmode', None)
    if sslmode and 'ssl' not in query:
        query['ssl'] = 'require' if sslmode not in ('disable', 'allow') else 'disable'
    return urlunsplit(parts._replace(scheme='postgresql+asyncpg', query=urlencode(query)))

@dataclass
class Settings:
    database_url: str = field(default_factory=lambda: _normalize_database_url(os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./sdr.db')))
    db_pool_size: int = field(default_factory=lambda: int(os.getenv('DB_POOL_SIZE', '5')))
    db_max_overflow: int = field(default_factory=lambda: int(os.getenv('DB_MAX_OVERFLOW', '10')))
    db_pool_timeout_seconds: int = field(default_factory=lambda: int(os.getenv('DB_POOL_TIMEOUT_SECONDS', '30')))
    neo4j_uri: str = os.getenv('NEO4J_URI', '')
    neo4j_username: str = os.getenv('NEO4J_USERNAME', 'neo4j')
    neo4j_password: str = os.getenv('NEO4J_PASSWORD', '')
    demo_mode: bool = os.getenv('DEMO_MODE', 'true').lower() == 'true'
    global_kill_switch: bool = os.getenv('GLOBAL_KILL_SWITCH', 'false').lower() == 'true'
    approval_aging_threshold_hours: int = int(os.getenv('APPROVAL_AGING_THRESHOLD_HOURS', '24'))
    capacity_alert_threshold_pct: int = int(os.getenv('CAPACITY_ALERT_THRESHOLD_PCT', '90'))
    llm_provider: str = os.getenv('LLM_PROVIDER', 'mock')
    dronahq_discovery_webhook_url: str = os.getenv('DRONAHQ_DISCOVERY_WEBHOOK_URL', '')
    dronahq_discovery_webhook_api_key: str = os.getenv('DRONAHQ_DISCOVERY_WEBHOOK_API_KEY', '')
    dronahq_research_webhook_url: str = os.getenv('DRONAHQ_RESEARCH_WEBHOOK_URL', '')
    dronahq_research_webhook_api_key: str = os.getenv('DRONAHQ_RESEARCH_WEBHOOK_API_KEY', '')
    dronahq_outreach_strategy_webhook_url: str = os.getenv('DRONAHQ_OUTREACH_STRATEGY_WEBHOOK_URL', '')
    dronahq_outreach_strategy_webhook_api_key: str = os.getenv('DRONAHQ_OUTREACH_STRATEGY_WEBHOOK_API_KEY', '')
    dronahq_personalization_webhook_url: str = os.getenv('DRONAHQ_PERSONALIZATION_WEBHOOK_URL', '')
    dronahq_personalization_webhook_api_key: str = os.getenv('DRONAHQ_PERSONALIZATION_WEBHOOK_API_KEY', '')
    dronahq_conversation_webhook_url: str = os.getenv('DRONAHQ_CONVERSATION_WEBHOOK_URL', '')
    dronahq_conversation_webhook_api_key: str = os.getenv('DRONAHQ_CONVERSATION_WEBHOOK_API_KEY', '')
    dronahq_followup_webhook_url: str = os.getenv('DRONAHQ_FOLLOWUP_WEBHOOK_URL', '')
    dronahq_followup_webhook_api_key: str = os.getenv('DRONAHQ_FOLLOWUP_WEBHOOK_API_KEY', '')
    dronahq_timeout_seconds: int = int(os.getenv('DRONAHQ_TIMEOUT_SECONDS', '30'))
    cors_origins: str = os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')

@lru_cache
def settings() -> Settings: return Settings()
