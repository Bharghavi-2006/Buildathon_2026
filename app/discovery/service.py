"""Single integration boundary for DronaHQ-powered lead discovery."""
from __future__ import annotations

from typing import Protocol
import httpx

from app.core.config import settings
from app.schemas import DiscoveryCandidate, DiscoveryResult
from app.web_scraper import WebScraper, WebScraperError


class DiscoveryProviderError(Exception):
    def __init__(self, code: str, message: str, diagnostic: dict|None=None): self.code, self.message, self.diagnostic = code, message, diagnostic or {}


class DiscoveryProvider(Protocol):
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult: ...


class DronaHQClient:
    """Thin client for a published DronaHQ agent webhook."""
    async def invoke_agent(self, payload: dict, *, webhook_url: str|None=None, api_key: str|None=None) -> dict:
        config=settings()
        if not (webhook_url and api_key):
            raise DiscoveryProviderError('DISCOVERY_PROVIDER_UNAVAILABLE', 'DronaHQ Discovery Agent is not configured.')
        url=webhook_url
        try:
            async with httpx.AsyncClient(timeout=config.dronahq_timeout_seconds) as client:
                # Published DronaHQ agent webhooks validate this exact header.
                # Do not send a bearer token: a webhook API key is not OAuth.
                response=await client.post(url,json=payload,headers={'api-key':api_key})
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
        config=settings()
        payload={'input':{'campaign_id':campaign_id,'icp':icp,'requested_count':requested_count},'response_format':'json'}
        # Test/custom clients own their transport configuration. Production
        # DronaHQClient always receives the configured webhook credentials.
        raw=await (self.client.invoke_agent(payload, webhook_url=config.dronahq_discovery_webhook_url, api_key=config.dronahq_discovery_webhook_api_key) if isinstance(self.client,DronaHQClient) else self.client.invoke_agent(payload))
        # Published agents commonly wrap their final structured output; support the documented boundary only here.
        result=raw.get('result',raw.get('data',raw)) if isinstance(raw,dict) else raw
        try: return DiscoveryResult.model_validate({**result,'campaign_id':campaign_id})
        except Exception as exc:
            # Persist only schema metadata—not the agent response, which can
            # contain prospect data—to make DronaHQ mapping errors actionable.
            errors=exc.errors() if hasattr(exc,'errors') else []
            diagnostic={'top_level_keys':sorted(raw.keys()) if isinstance(raw,dict) else [],'result_keys':sorted(result.keys()) if isinstance(result,dict) else [],'validation_errors':[{'field':'.'.join(str(x) for x in item.get('loc',[])),'message':item.get('msg','invalid')} for item in errors[:8]]}
            raise DiscoveryProviderError('DISCOVERY_MALFORMED_RESPONSE','DronaHQ returned malformed structured discovery output.',diagnostic) from exc


class MockDiscoveryProvider:
    """Local-only stand-in that preserves the DronaHQ → Apollo output contract."""
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        roles=icp.get('target_roles') or ['VP Engineering']; industries=icp.get('industries') or ['B2B SaaS']; geography=icp.get('geography') or 'US'
        candidates=[]
        for index,(name,title,size,score) in enumerate([('Jordan Taylor',roles[0],500,92),('Casey Morgan','Engineering Manager',75,61),('Avery Stone',roles[0],800,88)][:requested_count]):
            first,last=name.split(); candidates.append(DiscoveryCandidate(source='APOLLO',source_id=f'mock-apollo-{index+1}',person_name=name,first_name=first,last_name=last,title=title,email=f'{first.lower()}.{last.lower()}@apollo-demo.example',linkedin_url=f'https://linkedin.example/in/{first.lower()}-{last.lower()}',company_name=f'{last} Systems',company_domain=f'{last.lower()}systems.example',company_size=size,industry=industries[0],fit_score=score,fit_reasons=['Role evaluated against ICP','Industry evaluated against ICP'],matched_criteria=['geography:'+geography,'industry:'+industries[0]],unmatched_criteria=[] if score>=80 else ['company size'],confidence='HIGH' if score>=85 else 'MEDIUM'))
        return DiscoveryResult(campaign_id=campaign_id,candidates=candidates,total_found=len(candidates),search_summary='Demo discovery provider using a synthetic Apollo-compatible contract')


class WebScraperDiscoveryProvider:
    """Conservative public-web fallback when DronaHQ/Apollo cannot complete."""
    def __init__(self, scraper: WebScraper|None=None): self.scraper=scraper or WebScraper()
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        role=(icp.get('target_roles') or ['leader'])[0]
        industry=(icp.get('industries') or ['business'])[0]
        geography=icp.get('geography') or ''
        try:
            results=await self.scraper.search(f'{role} {industry} {geography} LinkedIn', requested_count)
        except WebScraperError as exc:
            raise DiscoveryProviderError('WEB_SCRAPER_UNAVAILABLE', str(exc)) from exc
        candidates=[]
        for index, item in enumerate(results):
            # Search titles are only leads. Keep the source URL and low confidence
            # so the existing approval/research pipeline can verify them.
            lead=item['title'].split('|')[0].split(' - ')
            name=lead[0].strip()
            words=name.split()
            if len(words) < 2 or any(word.lower() in {'linkedin', 'search', 'jobs'} for word in words):
                continue
            title=lead[1].strip() if len(lead) > 1 else role
            candidates.append(DiscoveryCandidate(source='WEB_SCRAPER',source_id=f'web-{index + 1}',person_name=name,first_name=words[0],last_name=' '.join(words[1:]),title=title,linkedin_url=item['url'] if 'linkedin.' in item['url'] else None,company_name=lead[2].strip() if len(lead) > 2 else None,industry=industry,fit_score=50,fit_reasons=['Found by public web-search fallback; requires verification'],matched_criteria=[f'role:{role}', f'industry:{industry}'],unmatched_criteria=['Apollo enrichment unavailable'],confidence='LOW'))
        return DiscoveryResult(campaign_id=campaign_id,candidates=candidates,total_found=len(candidates),search_summary='Public web-search fallback used after DronaHQ discovery failed')


class FallbackDiscoveryProvider:
    def __init__(self, primary: DiscoveryProvider, fallback: DiscoveryProvider|None=None):
        self.primary, self.fallback = primary, fallback or WebScraperDiscoveryProvider()
    async def discover(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        try:
            return await self.primary.discover(campaign_id, icp, requested_count)
        except DiscoveryProviderError as primary_error:
            try:
                return await self.fallback.discover(campaign_id, icp, requested_count)
            except DiscoveryProviderError as fallback_error:
                primary_error.diagnostic['web_scraper_fallback_error'] = fallback_error.code
                raise primary_error


class DiscoveryService:
    def __init__(self, provider: DiscoveryProvider|None=None):
        config=settings()
        # Demo mode never calls external agents. Outside demo mode, preserve the
        # DronaHQ-first architecture but recover with public web search.
        self.provider=provider or (MockDiscoveryProvider() if config.demo_mode else FallbackDiscoveryProvider(DronaHQDiscoveryProvider()))
    async def discover_for_campaign(self, campaign_id: str, icp: dict, requested_count: int) -> DiscoveryResult:
        return await self.provider.discover(campaign_id,icp,requested_count)
