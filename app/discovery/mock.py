from app.schemas import ProspectIn

class MockLeadDiscoveryProvider:
    """Deterministic demo provider; the route only supplies campaign ICP."""
    async def discover(self, icp: dict) -> list[ProspectIn]:
        industry=(icp.get('industries') or ['Technology'])[0]
        role=(icp.get('target_roles') or ['Technology Leader'])[0]
        geography=icp.get('geography') or 'US'
        slug=''.join(x for x in f'{industry}-{role}'.lower() if x.isalnum())[:16]
        return [ProspectIn(first_name='Jordan',last_name='Taylor',email=f'jordan.{slug}@discovery.example',title=role,industry=industry,location=geography,employee_count=250),ProspectIn(first_name='Casey',last_name='Morgan',email=f'casey.{slug}@discovery.example',title=role,industry=industry,location=geography,employee_count=500)]
