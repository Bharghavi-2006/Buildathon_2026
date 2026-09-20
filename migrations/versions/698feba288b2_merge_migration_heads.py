"""merge migration heads

Revision ID: 698feba288b2
Revises: 6a3fe36765db, b2c47f0a3191
Create Date: 2026-09-20 22:56:31.357216
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '698feba288b2'
down_revision: Union[str, Sequence[str], None] = ('6a3fe36765db', 'b2c47f0a3191')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
