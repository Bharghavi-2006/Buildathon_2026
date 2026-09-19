"""Single integration boundary for DronaHQ-powered lead discovery."""
from __future__ import annotations

from typing import Protocol
import httpx

from app.core.config import settings
from app.schemas import DiscoveryCandidate, DiscoveryResult


class DiscoveryProviderError(Exception):
    def __init__(self, code: str, message: str): self.code, self.message = code, message


class DiscoveryProvider(Protocol):
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult: ...


class DronaHQClient:
    """Thin HTTP client. The configured path accommodates tenant-specific published-agent URLs."""
    async def invoke_agent(self, payload: dict, *, agent_id: str|None=None, webhook_url: str|None=None, api_key: str|None=None) -> dict:
        config=settings()
        agent_id=agent_id or config.dronahq_discovery_agent_id; api_key=api_key or config.dronahq_api_key
        if not ((webhook_url or config.dronahq_base_url) and agent_id and api_key):
            raise DiscoveryProviderError('DISCOVERY_PROVIDER_UNAVAILABLE', 'DronaHQ Discovery Agent is not configured.')
        path=config.dronahq_discovery_invoke_path.format(agent_id=agent_id)
        url=webhook_url or f'{config.dronahq_base_url.rstrip("/")}/{path.lstrip("/")}'
        try:
            async with httpx.AsyncClient(timeout=30) as client:
                response=await client.post(url,json=payload,headers={'Authorization':f'Bearer {api_key}','X-API-Key':api_key})
        except httpx.TimeoutException as exc:
            raise DiscoveryProviderError('DISCOVERY_TIMEOUT','Lead discovery timed out.') from exc
        except httpx.HTTPError as exc:
            raise DiscoveryProviderError('DISCOVERY_PROVIDER_UNAVAILABLE','Lead discovery is temporarily unavailable.') from exc
        if response.status_code in (401,403): raise DiscoveryProviderError('DISCOVERY_PROVIDER_AUTH_FAILED','DronaHQ or Apollo credentials were rejected.')
        if response.status_code == 429: raise DiscoveryProviderError('DISCOVERY_RATE_LIMITED','DronaHQ or Apollo rate limit reached.')
        if response.is_error: raise DiscoveryProviderError('DISCOVERY_PROVIDER_UNAVAILABLE','Lead discovery is temporarily unavailable.')
        try: return response.json()
        except ValueError as exc: raise DiscoveryProviderError('DISCOVERY_MALFORMED_RESPONSE','DronaHQ returned invalid JSON.') from exc


class DronaHQDiscoveryProvider:
    def __init__(self, client: DronaHQClient|None=None): self.client=client or DronaHQClient()
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        raw=await self.client.invoke_agent({'input':{'campaign_id':campaign_id,'icp':icp,'requested_count':requested_count},'response_format':'json'})
        # Published agents commonly wrap their final structured output; support the documented boundary only here.
        result=raw.get('result',raw.get('data',raw))
        try: return DiscoveryResult.model_validate({**result,'campaign_id':campaign_id})
        except Exception as exc: raise DiscoveryProviderError('DISCOVERY_MALFORMED_RESPONSE','DronaHQ returned malformed structured discovery output.') from exc


class MockDiscoveryProvider:
    """Local-only stand-in that preserves the DronaHQ → Apollo output contract."""
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        roles=icp.get('target_roles') or ['VP Engineering']; industries=icp.get('industries') or ['B2B SaaS']; geography=icp.get('geography') or 'US'
        candidates=[]
        for index,(name,title,size,score) in enumerate([('Jordan Taylor',roles[0],500,92),('Casey Morgan','Engineering Manager',75,61),('Avery Stone',roles[0],800,88)][:requested_count]):
            first,last=name.split(); candidates.append(DiscoveryCandidate(source='APOLLO',source_id=f'mock-apollo-{index+1}',person_name=name,first_name=first,last_name=last,title=title,email=f'{first.lower()}.{last.lower()}@apollo-demo.example',linkedin_url=f'https://linkedin.example/in/{first.lower()}-{last.lower()}',company_name=f'{last} Systems',company_domain=f'{last.lower()}systems.example',company_size=size,industry=industries[0],fit_score=score,fit_reasons=['Role evaluated against ICP','Industry evaluated against ICP'],matched_criteria=['geography:'+geography,'industry:'+industries[0]],unmatched_criteria=[] if score>=80 else ['company size'],confidence='HIGH' if score>=85 else 'MEDIUM'))
        return DiscoveryResult(campaign_id=campaign_id,candidates=candidates,total_found=len(candidates),search_summary='Mock DronaHQ Discovery Agent using Apollo contract')


class DiscoveryService:
    def __init__(self, provider: DiscoveryProvider|None=None):
        self.provider=provider or (DronaHQDiscoveryProvider() if settings().dronahq_base_url else MockDiscoveryProvider())
    async def discover_for_campaign(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        return await self.provider.discover(campaign_id,icp,requested_count)
