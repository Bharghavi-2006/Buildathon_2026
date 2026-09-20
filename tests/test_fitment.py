from app.fitment.engine import ICPFitmentEngine

ICP={'industries':['B2B SaaS'],'geography':'India','company_size':{'min':200,'max':2000},'target_roles':['CTO','VP Engineering','Head of Engineering']}
PROSPECT={'title':'CTO','industry':'B2B SaaS','location':'India'}
def evaluate(company=None, person=None, exclusions=None, uncertainties=None):
    return ICPFitmentEngine().evaluate(ICP,{'company_research':company or {},'person_research':person or {},'business_context':[],'uncertainties':uncertainties or []},PROSPECT,exclusions)

def test_full_match_is_deterministically_outreach_eligible():
    result=evaluate({'industry':'B2B SaaS','geography':'India','employee_count':850},{'current_role':'Chief Technology Officer'})
    assert result['overall_fit_score']==100
    assert result['recommended_next_stage']=='OUTREACH_ELIGIBLE'
    assert result['engine_version']=='icp-fitment-v1'

def test_missing_size_is_unverified_not_unmatched():
    result=evaluate({'industry':'B2B SaaS','geography':'India'},{'current_role':'CTO'})
    size=next(x for x in result['organization_criteria'] if x['criterion']=='company_size')
    assert size['status']=='UNVERIFIED' and result['recommended_next_stage']=='NEEDS_RESEARCH'

def test_explicit_size_mismatch_is_not_eligible():
    result=evaluate({'industry':'B2B SaaS','geography':'India','employee_count':50},{'current_role':'CTO'})
    assert next(x for x in result['organization_criteria'] if x['criterion']=='company_size')['status']=='UNMATCHED'
    assert result['recommended_next_stage']=='NOT_A_FIT'

def test_exclusion_is_disqualifying():
    result=evaluate({'industry':'Recruitment agency','geography':'India','employee_count':850,'description':'Recruitment agency'},{'current_role':'CTO'},['recruitment agency'])
    assert result['overall_fit_status']=='NOT_A_FIT' and result['recommended_next_stage']=='NOT_A_FIT'

def test_irrelevant_contact_does_not_inherit_organization_fit():
    result=evaluate({'industry':'B2B SaaS','geography':'India','employee_count':850},{'current_role':'Recruiter'})
    assert result['contact_fit_status']=='UNMATCHED' and result['recommended_next_stage']=='NOT_A_FIT'

def test_unverified_contact_and_contradiction_are_explicit():
    result=evaluate({'industry':'B2B SaaS','geography':'India','employee_count':850},{},uncertainties=['Conflicting current-title sources'])
    assert result['contact_fit_status']=='UNVERIFIED'
    assert result['recommended_next_stage']=='NEEDS_HUMAN_REVIEW'

def test_same_inputs_produce_same_result():
    first=evaluate({'industry':'B2B SaaS','geography':'India','employee_count':850},{'current_role':'CTO'})
    second=evaluate({'industry':'B2B SaaS','geography':'India','employee_count':850},{'current_role':'CTO'})
    assert first==second
