from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.core.config import settings
from app.db.models import Base
engine = create_async_engine(settings().database_url, future=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
async def get_session():
    async with SessionLocal() as session: yield session
async def init_db():
    async with engine.begin() as conn: await conn.run_sync(Base.metadata.create_all)
