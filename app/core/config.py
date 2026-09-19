from functools import lru_cache
from dataclasses import dataclass
import os

@dataclass
class Settings:
    database_url: str = os.getenv('DATABASE_URL', 'sqlite+aiosqlite:///./sdr.db')
    neo4j_uri: str = os.getenv('NEO4J_URI', '')
    neo4j_username: str = os.getenv('NEO4J_USERNAME', 'neo4j')
    neo4j_password: str = os.getenv('NEO4J_PASSWORD', '')
    demo_mode: bool = os.getenv('DEMO_MODE', 'true').lower() == 'true'
    global_kill_switch: bool = os.getenv('GLOBAL_KILL_SWITCH', 'false').lower() == 'true'
    llm_provider: str = os.getenv('LLM_PROVIDER', 'mock')

@lru_cache
def settings() -> Settings: return Settings()
