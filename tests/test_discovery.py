import pytest
from pydantic import ValidationError

from app.discovery.service import DiscoveryService, MockDiscoveryProvider, DronaHQDiscoveryProvider, DiscoveryProviderError, FallbackDiscoveryProvider
from app.schemas import DiscoveryResult


@pytest.mark.asyncio
async def test_mock_discovery_preserves_structured_apollo_contract():
    result=await DiscoveryService(MockDiscoveryProvider()).discover_for_campaign('campaign-1',{'geography':'US','target_roles':['CTO'],'industries':['B2B SaaS'],'company_size':{'min':200,'max':2000}},3)
    assert result.campaign_id=='campaign-1'
    assert result.total_found == len(result.candidates)
    assert all(candidate.source=='APOLLO' and 0 <= candidate.fit_score <= 100 for candidate in result.candidates)

def test_invalid_discovery_fit_score_is_rejected():
    with pytest.raises(ValidationError):
        DiscoveryResult.model_validate({'campaign_id':'c','total_found':1,'candidates':[{'source':'APOLLO','source_id':'a','first_name':'A','title':'CTO','fit_score':101,'confidence':'HIGH'}]})

@pytest.mark.asyncio
async def test_dronahq_provider_validates_wrapped_structured_response():
    class Client:
        async def invoke_agent(self,payload):
            assert payload['input']['campaign_id']=='c'
            return {'result':{'total_found':0,'candidates':[],'search_summary':'No Apollo matches','execution_id':'execution-1'}}
    result=await DronaHQDiscoveryProvider(Client()).discover('c',{},5)
    assert result.execution_id=='execution-1' and result.total_found==0

@pytest.mark.asyncio
async def test_malformed_dronahq_output_has_structured_error():
    class Client:
        async def invoke_agent(self,payload): return {'result':{'candidates':'not-a-list'}}
    with pytest.raises(DiscoveryProviderError) as error:
        await DronaHQDiscoveryProvider(Client()).discover('c',{},5)
    assert error.value.code=='DISCOVERY_MALFORMED_RESPONSE'

@pytest.mark.asyncio
async def test_dronahq_failure_uses_the_web_scraper_fallback_provider():
    class BrokenProvider:
        async def discover(self, *args): raise DiscoveryProviderError('DISCOVERY_TIMEOUT', 'DronaHQ timed out.')
    class ScraperProvider:
        async def discover(self, campaign_id, icp, requested_count):
            return DiscoveryResult(campaign_id=campaign_id, total_found=0, candidates=[], search_summary='scraper fallback')
    result=await FallbackDiscoveryProvider(BrokenProvider(), ScraperProvider()).discover('c', {}, 1)
    assert result.search_summary == 'scraper fallback'
