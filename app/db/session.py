from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings
from app.db.models import Base
def _engine_options() -> dict:
    """Keep database construction in one place and avoid pooling SQLite files."""
    config=settings()
    if config.database_url.startswith('sqlite'):
        return {'future': True}
    return {'future': True, 'pool_pre_ping': True, 'pool_size': config.db_pool_size, 'max_overflow': config.db_max_overflow, 'pool_timeout': config.db_pool_timeout_seconds}

engine = create_async_engine(settings().database_url, **_engine_options())
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
async def get_session():
    async with SessionLocal() as session: yield session
async def init_db():
    # SQLite remains zero-setup local development. PostgreSQL schemas are
    # exclusively managed by Alembic (run `python -m alembic upgrade head`).
    if engine.dialect.name == 'sqlite':
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await _apply_sqlite_additive_schema(conn)
            if settings().demo_mode:
                await conn.execute(text('UPDATE campaigns SET demo_mode = 1'))
        return
    async with engine.connect() as conn:
        try:
            await conn.execute(text('SELECT version_num FROM alembic_version LIMIT 1'))
        except Exception as exc:
            raise RuntimeError('PostgreSQL schema is not migrated. Run `python -m alembic upgrade head` before starting the API.') from exc


async def _apply_sqlite_additive_schema(conn):
    additions = {
        'access_profiles': {
            'supported_channels': 'JSON',
            'timezone': "VARCHAR NOT NULL DEFAULT ''",
            'working_hours': 'JSON',
        },
        'campaign_assignments': {
            'daily_send_limit': 'INTEGER',
            'assigned_lead_limit': 'INTEGER',
            'working_hours': 'JSON',
            'routing_rule': 'JSON',
        },
        'campaigns': {
            'demo_mode': 'BOOLEAN NOT NULL DEFAULT 1',
            'demo_recipient_email': 'VARCHAR',
        },
        'delivery_records': {
            'conversation_id': 'VARCHAR',
        },
    }
    for table, columns in additions.items():
        rows = await conn.execute(text(f'PRAGMA table_info({table})'))
        existing = {row[1] for row in rows}
        for name, definition in columns.items():
            if name not in existing:
                await conn.execute(text(f'ALTER TABLE {table} ADD COLUMN {name} {definition}'))
