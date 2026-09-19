from app.schemas import QualificationResult, OutreachDecision, PersonalizedOutreach
def qualify(prospect, campaign, facts):
    roles=[x.lower() for x in campaign.target_roles]; title=prospect.title.lower(); industry=prospect.industry.lower()
    role_match=not roles or any(r in title for r in roles); industry_match=not campaign.target_industries or any(i.lower() in industry for i in campaign.target_industries)
    score=round((.55 if role_match else .15)+(.3 if industry_match else .05)+(.15 if facts else 0),2)
    return QualificationResult(qualified=score>=.65,score=score,reasons=['Role matches ICP' if role_match else 'Role does not match ICP','Industry matches ICP' if industry_match else 'Industry needs validation'],evidence=[f.title for f in facts],missing_information=[] if facts else ['Recent business signal'])
def strategy(prospect, campaign): return OutreachDecision(should_contact=True,channel=campaign.active_channels[0],objective='Start a discovery conversation',message_angle=f'Relevance for {prospect.title}',reasoning='Qualified prospect with campaign-aligned role and industry')
def personalize(prospect, campaign, facts, knowledge, channel):
    fact=facts[0].fact if facts else f'{prospect.company_id or "their company"} operates in {prospect.industry}'
    return PersonalizedOutreach(channel=channel,subject=f'Idea for {prospect.first_name}\'s team',body=f'Hi {prospect.first_name},\n\nI noticed {fact}. We help teams like yours turn GTM signals into focused outreach without losing human control. Would a 15-minute conversation next week be useful?\n\nBest,\nThe GTM team',personalization_facts=[fact],cta='15-minute conversation',reasoning=f'Grounded in research and {len(knowledge)} knowledge documents')
