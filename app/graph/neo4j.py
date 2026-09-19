class Neo4jService:
    """Best-effort graph projection; PostgreSQL remains authoritative."""
    async def sync_target(self, campaign_id: str, prospect_id: str):
        return {'synced': False, 'reason': 'Neo4j is optional in demo mode'}
