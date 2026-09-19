"""DronaHQ Research Agent orchestration boundary; FastAPI never performs web research itself."""
from __future__ import annotations
import json
from typing import Protocol
from app.core.config import settings
from app.discovery.service import DronaHQClient, DiscoveryProviderError
from app.schemas import ResearchResult

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
        if isinstance(self.client,DronaHQClient) and not (config.dronahq_research_webhook_url and config.dronahq_research_webhook_api_key and config.dronahq_research_agent_id):
            raise DiscoveryProviderError('RESEARCH_PROVIDER_UNAVAILABLE','DronaHQ Research Agent is not configured.')
        try:
            raw=await self.client.invoke_agent({'input':{'campaign_id':campaign_id,'campaign_name':campaign_name,'icp':icp,'candidate':candidate},'response_format':'json'},agent_id=config.dronahq_research_agent_id,webhook_url=config.dronahq_research_webhook_url,api_key=config.dronahq_research_webhook_api_key)
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
        return ResearchResult(campaign_id=campaign_id,candidate_status='partially_verified',research_summary='Mock research data; verify with configured DronaHQ Web Search before production use.',person_research={'current_role':title,'verification':'Mock source'},company_research={'company_name':candidate.get('company_name',''),'industry':industry},icp_evidence=[{'criterion':'Role','status':'MATCHED' if title in (icp.get('target_roles') or []) else 'UNVERIFIED','evidence':'Mock provider does not independently verify search results.','source':''}],business_context=['Mock provider: no real Web Search performed.'],personalization_signals=[],sources=[],uncertainties=['Local mock mode is not external verification.'])

class ResearchService:
    def __init__(self,provider:ResearchProvider|None=None):
        config=settings(); self.provider=provider or (DronaHQResearchProvider() if config.dronahq_research_webhook_url else MockResearchProvider())
    async def research_candidate(self,campaign_id,campaign_name,icp,candidate): return await self.provider.research(campaign_id,campaign_name,icp,candidate)
