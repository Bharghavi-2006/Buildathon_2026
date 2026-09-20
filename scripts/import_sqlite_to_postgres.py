"""Import the existing SQLite SDR database into an already-migrated PostgreSQL DB."""
from __future__ import annotations

import argparse
import asyncio
from pathlib import Path

from sqlalchemy import create_engine, delete, func, select
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.models import Base


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', default='sdr.db', help='Path to the source SQLite database.')
    parser.add_argument('--replace', action='store_true', help='Delete existing target rows before importing.')
    return parser.parse_args()


async def import_database(source_path: Path, replace: bool = False) -> dict[str, int]:
    target_url = settings().database_url
    if not target_url.startswith('postgresql+'):
        raise ValueError('DATABASE_URL must be a PostgreSQL async SQLAlchemy URL for import.')
    if not source_path.is_file():
        raise FileNotFoundError(f'SQLite source database not found: {source_path}')
    source = create_engine(f'sqlite:///{source_path.resolve()}')
    target = create_async_engine(target_url, pool_pre_ping=True)
    counts: dict[str, int] = {}
    try:
        with source.connect() as source_connection:
            async with target.begin() as target_connection:
                existing = await target_connection.scalar(select(func.count()).select_from(Base.metadata.tables['campaigns']))
                if existing and not replace:
                    raise RuntimeError('Target contains campaign data. Re-run with --replace only after confirming it is safe to overwrite.')
                if replace:
                    for table in reversed(Base.metadata.sorted_tables):
                        await target_connection.execute(delete(table))
                for table in Base.metadata.sorted_tables:
                    rows = [dict(row) for row in source_connection.execute(select(table)).mappings()]
                    if rows:
                        await target_connection.execute(table.insert(), rows)
                    counts[table.name] = len(rows)
    finally:
        source.dispose()
        await target.dispose()
    return counts


async def main() -> None:
    args = parse_args()
    counts = await import_database(Path(args.source), args.replace)
    print(f"Imported {sum(counts.values())} rows across {len(counts)} tables.")
    for table, count in counts.items(): print(f'{table}: {count}')


if __name__ == '__main__':
    asyncio.run(main())
