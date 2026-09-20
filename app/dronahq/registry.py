"""Single safe registry for external DronaHQ agents; never returns secrets."""
from dataclasses import dataclass
from app.core.config import settings
from app.discovery.service import DronaHQClient, DiscoveryProviderError

@dataclass(frozen=True)
class AgentConfig:
    name: str
    webhook_url: str
    api_key: str
    timeout_seconds: int
    response_format: str = 'json'
    @property
    def configured(self): return bool(self.webhook_url and self.api_key)

def agent_registry():
    c=settings(); timeout=c.dronahq_timeout_seconds
    return {
        'discovery': AgentConfig('Discovery', c.dronahq_discovery_webhook_url, c.dronahq_discovery_webhook_api_key, timeout),
        'research': AgentConfig('Research', c.dronahq_research_webhook_url, c.dronahq_research_webhook_api_key, timeout),
        'outreach_strategy': AgentConfig('Outreach Strategy', c.dronahq_outreach_strategy_webhook_url, c.dronahq_outreach_strategy_webhook_api_key, timeout),
        'personalization': AgentConfig('Personalization', c.dronahq_personalization_webhook_url, c.dronahq_personalization_webhook_api_key, timeout),
        'conversation': AgentConfig('Conversation', c.dronahq_conversation_webhook_url, c.dronahq_conversation_webhook_api_key, timeout),
        'followup': AgentConfig('Follow-up', c.dronahq_followup_webhook_url, c.dronahq_followup_webhook_api_key, timeout),
    }

def public_agent_status():
    if settings().demo_mode:
        return {key: 'DEMO' for key in agent_registry()}
    return {key: 'CONFIGURED' if config.configured else 'NOT_CONFIGURED' for key, config in agent_registry().items()}

async def run_agent(agent: str, payload: dict) -> dict:
    """Invoke a configured published agent through the one HTTP boundary.

    This deliberately has no delivery side effects; callers persist and govern
    returned proposals in their own pipeline stage.
    """
    if settings().demo_mode:
        prospect=payload.get('prospect', {})
        first_name=prospect.get('first_name', 'there')
        if agent == 'personalization':
            return {'result': {'channel': 'email', 'subject': f'Idea for {first_name}\'s team', 'draft': f'Hi {first_name},\n\nThis is a demo outreach draft. Please review before sending.\n\nBest,\nThe GTM team', 'provider': 'demo'}}
        return {'result': {'summary': f'Demo {agent.replace("_", " ")} result.', 'provider': 'demo'}}
    config = agent_registry().get(agent)
    if not config or not config.configured:
        raise DiscoveryProviderError('AGENT_NOT_CONFIGURED', f'DronaHQ {agent} agent is not configured.')
    return await DronaHQClient().invoke_agent(
        {'input': payload, 'response_format': config.response_format}, webhook_url=config.webhook_url, api_key=config.api_key,
    )
