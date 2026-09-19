import pytest
from pydantic import ValidationError

from app.discovery.service import DiscoveryProviderError
from app.research.service import DronaHQResearchProvider, MockResearchProvider
from app.schemas import ResearchResult


@pytest.mark.asyncio
async def test_mock_research_returns_evidence_not_a_final_score():
    result=await MockResearchProvider().research('campaign-1','Campaign',{'target_roles':['CTO']},{'source_id':'apollo-1','title':'CTO','company_name':'Acme','industry':'SaaS'})
    assert result.candidate_status=='partially_verified'
    assert result.icp_evidence[0].status=='MATCHED'
    assert not hasattr(result,'fit_score')

def test_invalid_research_candidate_status_is_rejected():
    with pytest.raises(ValidationError):
        ResearchResult.model_validate({'campaign_id':'c','candidate_status':'confirmed','research_summary':'x'})

@pytest.mark.asyncio
async def test_research_provider_parses_json_encoded_array_fields():
    class Client:
        async def invoke_agent(self,*args,**kwargs):
            return {'result':{'candidate_status':'verified','research_summary':'Verified.','person_research':{},'company_research':{},'icp_evidence':'[{"criterion":"Role","status":"MATCHED","evidence":"CTO","source":"https://example.test"}]','business_context':'["Growth signal"]','personalization_signals':'[]','sources':'["https://example.test"]','uncertainties':'[]','execution_id':'run-1'}}
    result=await DronaHQResearchProvider(Client()).research('c','Campaign',{}, {'source_id':'source-1'})
    assert result.execution_id=='run-1' and result.icp_evidence[0].criterion=='Role'

@pytest.mark.asyncio
async def test_malformed_json_encoded_array_is_rejected():
    class Client:
        async def invoke_agent(self,*args,**kwargs):
            return {'result':{'candidate_status':'verified','research_summary':'Verified.','icp_evidence':'not json'}}
    with pytest.raises(DiscoveryProviderError) as error:
        await DronaHQResearchProvider(Client()).research('c','Campaign',{}, {'source_id':'source-1'})
    assert error.value.code=='RESEARCH_MALFORMED_RESPONSE'
