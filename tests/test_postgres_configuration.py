from app.core.config import Settings


def test_postgres_url_and_pool_settings_are_configurable(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+asyncpg://user:token@example.test:5432/postgres?ssl=require')
    monkeypatch.setenv('DB_POOL_SIZE', '7')
    config = Settings()
    assert config.database_url.startswith('postgresql+asyncpg://')
    assert config.db_pool_size == 7


def test_initial_alembic_migration_is_present():
    from pathlib import Path
    revisions = list(Path('migrations/versions').glob('*_initial_postgresql_schema.py'))
    assert len(revisions) == 1
