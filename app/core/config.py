from functools import lru_cache
from dataclasses import dataclass
import os
from dotenv import load_dotenv

# Optional local configuration. The app still runs when no .env file exists.
load_dotenv()

@dataclass
class Settings:
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./sdr.db')
    neo4j_uri: str = os.getenv('NEO4J_URI', '')
    neo4j_username: str = os.getenv('NEO4J_USERNAME', 'neo4j')
    neo4j_password: str = os.getenv('NEO4J_PASSWORD', '')
    demo_mode: bool = os.getenv('DEMO_MODE', 'true').lower() == 'true'
    global_kill_switch: bool = os.getenv('GLOBAL_KILL_SWITCH', 'false').lower() == 'true'
    approval_aging_threshold_hours: int = int(os.getenv('APPROVAL_AGING_THRESHOLD_HOURS', '24'))
    llm_provider: str = os.getenv('LLM_PROVIDER', 'mock')
    dronahq_base_url: str = os.getenv('DRONAHQ_BASE_URL', '')
    dronahq_discovery_agent_id: str = os.getenv('DRONAHQ_DISCOVERY_AGENT_ID', '')
    dronahq_api_key: str = os.getenv('DRONAHQ_API_KEY', '')
    dronahq_discovery_invoke_path: str = os.getenv('DRONAHQ_DISCOVERY_INVOKE_PATH', '/api/agents/{agent_id}/invoke')
    dronahq_research_webhook_url: str = os.getenv('DRONAHQ_RESEARCH_WEBHOOK_URL', '')
    dronahq_research_webhook_api_key: str = os.getenv('DRONAHQ_RESEARCH_WEBHOOK_API_KEY', '')
    dronahq_research_agent_id: str = os.getenv('DRONAHQ_RESEARCH_AGENT_ID', '')
    cors_origins: str = os.getenv('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173')

@lru_cache
def settings() -> Settings: return Settings()
