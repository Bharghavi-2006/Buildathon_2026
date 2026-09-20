"""DronaHQ Research Agent orchestration boundary; FastAPI never performs web research itself."""
from __future__ import annotations
import json
from typing import Protocol
from app.core.config import settings
from app.discovery.service import DronaHQClient, DiscoveryProviderError
from app.schemas import ResearchResult
from app.web_scraper import WebScraper, WebScraperError

class ResearchProvider(Protocol):
    async def research(self, campaign_id: str, campaign_name: str, icp: dict, candidate: dict) -> ResearchResult: ...

def _array(value, field: str) -> list:
    if isinstance(value,list): return value
    if isinstance(value,str):
        try:
            parsed=json.loads(value)
        except json.JSONDecodeError as exc: raise DiscoveryProviderError('RESEARCH_MALFORMED_RESPONSE',f'{field} must be an array, not malformed JSON text.') from exc
        if isinstance(parsed,list): return parsed
    raise DiscoveryProviderError('RESEARCH_MALFORMED_RESPONSE',f'{field} must be an array.')

class DronaHQResearchProvider:
    def __init__(self, client: DronaHQClient|None=None): self.client=client or DronaHQClient()
    async def research(self,campaign_id,campaign_name,icp,candidate) -> ResearchResult:
        config=settings()
        if isinstance(self.client,DronaHQClient) and not (config.dronahq_research_webhook_url and config.dronahq_research_webhook_api_key):
            raise DiscoveryProviderError('RESEARCH_PROVIDER_UNAVAILABLE','DronaHQ Research Agent is not configured.')
        try:
            raw=await self.client.invoke_agent({'input':{'campaign_id':campaign_id,'campaign_name':campaign_name,'icp':icp,'candidate':candidate},'response_format':'json'},webhook_url=config.dronahq_research_webhook_url,api_key=config.dronahq_research_webhook_api_key)
        except DiscoveryProviderError as exc:
            code=exc.code.replace('DISCOVERY_','RESEARCH_')
            raise DiscoveryProviderError(code,exc.message.replace('Lead discovery','Prospect research').replace('Discovery Agent','Research Agent')) from exc
        result=raw.get('result',raw.get('data',raw))
        try:
            normalized={**result,'campaign_id':campaign_id}
            for field in ['icp_evidence','business_context','personalization_signals','sources','uncertainties']:
                if field in normalized: normalized[field]=_array(normalized[field],field)
            return ResearchResult.model_validate(normalized)
        except DiscoveryProviderError: raise
        except Exception as exc: raise DiscoveryProviderError('RESEARCH_MALFORMED_RESPONSE','DronaHQ returned malformed structured research output.') from exc

class MockResearchProvider:
    async def research(self,campaign_id,campaign_name,icp,candidate) -> ResearchResult:
        title=candidate.get('title',''); industry=candidate.get('industry','')
        return ResearchResult(campaign_id=campaign_id,candidate_status='partially_verified',research_summary='Demo research data; verify with a configured provider before production use.',person_research={'current_role':title,'verification':'Demo source'},company_research={'company_name':candidate.get('company_name',''),'industry':industry},icp_evidence=[{'criterion':'Role','status':'MATCHED' if title in (icp.get('target_roles') or []) else 'UNVERIFIED','evidence':'Demo provider does not independently verify search results.','source':''}],business_context=['Demo provider: no real web search performed.'],personalization_signals=[],sources=[],uncertainties=['Demo mode is not external verification.'])


class WebScraperResearchProvider:
    """Public-web research fallback; its output is deliberately unverified."""
    def __init__(self, scraper: WebScraper|None=None): self.scraper=scraper or WebScraper()
    async def research(self,campaign_id,campaign_name,icp,candidate) -> ResearchResult:
        query=' '.join(filter(None, [candidate.get('person_name'), candidate.get('company_name'), candidate.get('company_domain')]))
        try:
            results=await self.scraper.search(query or candidate.get('title','company'), 5)
        except WebScraperError as exc:
            raise DiscoveryProviderError('WEB_SCRAPER_UNAVAILABLE', str(exc)) from exc
        sources=[item['url'] for item in results]
        context=[item['title'] for item in results]
        return ResearchResult(campaign_id=campaign_id,candidate_status='partially_verified' if results else 'unverified',research_summary='Public web-search fallback used after DronaHQ research failed; all findings require verification.',person_research={'current_role':candidate.get('title',''),'verification':'Public web-search fallback; unverified'},company_research={'company_name':candidate.get('company_name',''),'industry':candidate.get('industry','')},icp_evidence=[{'criterion':'Public web presence','status':'UNVERIFIED','evidence':'Search-result references were collected as leads, not verified facts.','source':sources[0] if sources else ''}],business_context=context,personalization_signals=[],sources=sources,uncertainties=['DronaHQ research failed; public web-search results may be stale or ambiguous.'])


class FallbackResearchProvider:
    def __init__(self, primary: ResearchProvider, fallback: ResearchProvider|None=None): self.primary, self.fallback=primary, fallback or WebScraperResearchProvider()
    async def research(self,campaign_id,campaign_name,icp,candidate) -> ResearchResult:
        try:
            return await self.primary.research(campaign_id,campaign_name,icp,candidate)
        except DiscoveryProviderError as primary_error:
            try: return await self.fallback.research(campaign_id,campaign_name,icp,candidate)
            except DiscoveryProviderError as fallback_error:
                primary_error.diagnostic['web_scraper_fallback_error']=fallback_error.code
                raise primary_error

class ResearchService:
    def __init__(self,provider:ResearchProvider|None=None):
        config=settings(); self.provider=provider or (MockResearchProvider() if config.demo_mode else FallbackResearchProvider(DronaHQResearchProvider()))
    async def research_candidate(self,campaign_id,campaign_name,icp,candidate): return await self.provider.research(campaign_id,campaign_name,icp,candidate)
