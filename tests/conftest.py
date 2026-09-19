import pytest_asyncio
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.db.models import Base
@pytest_asyncio.fixture
async def db():
    e=create_async_engine('sqlite+aiosqlite:///:memory:')
    async with e.begin() as c: await c.run_sync(Base.metadata.create_all)
    async with async_sessionmaker(e,expire_on_commit=False)() as s: yield s
    await e.dispose()
