"""add representative hurdles

Revision ID: b2c47f0a3191
Revises: 94f0719a8d8f
"""
from alembic import op
import sqlalchemy as sa

revision = 'b2c47f0a3191'
down_revision = '94f0719a8d8f'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('representative_hurdles', sa.Column('id', sa.String(), primary_key=True), sa.Column('representative_id', sa.String(), nullable=False), sa.Column('campaign_id', sa.String()), sa.Column('prospect_id', sa.String()), sa.Column('agent_run_id', sa.String()), sa.Column('source_type', sa.String(), nullable=False), sa.Column('source_id', sa.String(), nullable=False), sa.Column('channel', sa.String(), nullable=False), sa.Column('category', sa.String(), nullable=False), sa.Column('severity', sa.String(), nullable=False), sa.Column('diagnostic', sa.Text(), nullable=False), sa.Column('recommended_resolution', sa.Text(), nullable=False), sa.Column('status', sa.String(), nullable=False), sa.Column('details', sa.JSON(), nullable=False), sa.Column('knowledge_gap', sa.Boolean(), nullable=False), sa.Column('created_at', sa.DateTime(), nullable=False), sa.Column('updated_at', sa.DateTime(), nullable=False), sa.ForeignKeyConstraint(['representative_id'], ['users.id']), sa.ForeignKeyConstraint(['campaign_id'], ['campaigns.id']), sa.ForeignKeyConstraint(['prospect_id'], ['prospects.id']), sa.ForeignKeyConstraint(['agent_run_id'], ['agent_runs.id']))

def downgrade():
    op.drop_table('representative_hurdles')
