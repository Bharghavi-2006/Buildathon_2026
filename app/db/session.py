from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings
from app.db.models import Base
engine = create_async_engine(settings().database_url, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
async def get_session():
    async with SessionLocal() as session: yield session
async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # The demo deployment predates Alembic and keeps a SQLite file between
        # runs.  Apply these additive columns so existing local rosters remain
        # usable; production databases should apply equivalent DDL via their
        # normal migration process.
        if engine.dialect.name == 'sqlite':
            await _apply_sqlite_additive_schema(conn)
        # A demo deployment must not leave pre-existing campaigns capable of
        # non-demo delivery merely because they were created before this flag.
        if settings().demo_mode:
            await conn.execute(text('UPDATE campaigns SET demo_mode = 1'))


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
