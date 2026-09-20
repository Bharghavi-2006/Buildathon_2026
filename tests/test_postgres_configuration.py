from app.core.config import Settings


def test_postgres_url_and_pool_settings_are_configurable(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql+asyncpg://user:token@example.test:5432/postgres?ssl=require')
    monkeypatch.setenv('DB_POOL_SIZE', '7')
    config = Settings()
    assert config.database_url.startswith('postgresql+asyncpg://')
    assert config.db_pool_size == 7


def test_managed_provider_url_is_normalized_to_asyncpg(monkeypatch):
    """Render/Heroku/Railway hand out 'postgres://...?sslmode=require'; the async
    engine needs the asyncpg driver and asyncpg's 'ssl' param, not libpq's 'sslmode'."""
    monkeypatch.setenv('DATABASE_URL', 'postgres://user:pass@dpg-example.render.com/mydb?sslmode=require')
    config = Settings()
    assert config.database_url == 'postgresql+asyncpg://user:pass@dpg-example.render.com/mydb?ssl=require'


def test_plain_postgresql_url_gets_asyncpg_driver(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'postgresql://user:pass@host:5432/db')
    config = Settings()
    assert config.database_url == 'postgresql+asyncpg://user:pass@host:5432/db'


def test_sqlite_url_is_left_untouched(monkeypatch):
    monkeypatch.setenv('DATABASE_URL', 'sqlite+aiosqlite:///./sdr.db')
    config = Settings()
    assert config.database_url == 'sqlite+aiosqlite:///./sdr.db'


def test_initial_alembic_migration_is_present():
    from pathlib import Path
    revisions = list(Path('migrations/versions').glob('*_initial_postgresql_schema.py'))
    assert len(revisions) == 1
