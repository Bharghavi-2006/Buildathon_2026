"""Pure, reproducible evaluation of discovery/research evidence against campaign ICP."""
from __future__ import annotations
from typing import Any

ENGINE_VERSION='icp-fitment-v1'
VALUES={'MATCHED':1.0,'UNVERIFIED':.5,'UNMATCHED':0.0}

def _text(value: Any) -> str: return str(value or '').strip()
def _norm(value: Any) -> str: return _text(value).lower()
def _contains(value: Any, expected: Any) -> bool:
    return _norm(expected) in _norm(value) or _norm(value) in _norm(expected)
def _title_match(title: str, targets: list[str]) -> bool:
    aliases={'cto':'chief technology officer','vp engineering':'vice president engineering','head engineering':'head of engineering','head technology':'head of technology'}
    actual=_norm(title)
    return any(_norm(target) in actual or actual in _norm(target) or (aliases.get(_norm(target)) and aliases[_norm(target)] in actual) for target in targets)

class ICPFitmentEngine:
    """Scores MATCHED/UNVERIFIED/UNMATCHED as 1/.5/0 with equal criterion weights.

    Exclusions and explicit role/organization mismatches override numeric scores. This
    keeps a high organization score from making an irrelevant contact eligible.
    """
    version=ENGINE_VERSION
    def _criterion(self,name,expected,actual,reason=None):
        if actual is None or actual=='': return {'criterion':name,'status':'UNVERIFIED','expected_value':expected,'actual_value':None,'reason':reason or 'No reliable research evidence was provided.'}
        matched=any(_contains(actual,value) for value in expected) if isinstance(expected,list) else _contains(actual,expected)
        return {'criterion':name,'status':'MATCHED' if matched else 'UNMATCHED','expected_value':expected,'actual_value':actual,'reason':reason or ('Research evidence satisfies campaign ICP.' if matched else 'Research evidence does not satisfy campaign ICP.')}
    def _score(self,criteria): return round(100*sum(VALUES[x['status']] for x in criteria)/len(criteria),2) if criteria else 50.0
    def _status(self,score,criteria,disqualified=False):
        states={x['status'] for x in criteria}
        if disqualified or 'UNMATCHED' in states: return 'NOT_A_FIT' if score<50 or disqualified else 'WEAK_FIT'
        if not criteria or states=={'UNVERIFIED'}: return 'UNVERIFIED'
        if score>=80: return 'STRONG_FIT'
        if score>=60: return 'PARTIAL_FIT'
        return 'WEAK_FIT'
    def evaluate(self,icp:dict,research:dict,prospect:dict,exclusions:list[str]|None=None)->dict:
        company=research.get('company_research') or {}; person=research.get('person_research') or {}; uncertainties=list(research.get('uncertainties') or [])
        org=[]; contact=[]; exclusions=exclusions or []
        # Only configured campaign criteria are evaluated; unknown data remains UNVERIFIED.
        if icp.get('industries'): org.append(self._criterion('industry',icp['industries'],company.get('industry') or prospect.get('industry')))
        if icp.get('geography'): org.append(self._criterion('geography',icp['geography'],company.get('geography') or prospect.get('location')))
        size=icp.get('company_size') or {}
        if size:
            actual=company.get('employee_count',company.get('company_size'))
            if actual in (None,'',0): org.append(self._criterion('company_size',f"{size.get('min','?')}-{size.get('max','?')} employees",None))
            else:
                try: actual=int(actual); matched=size.get('min',0)<=actual<=size.get('max',10**12); org.append({'criterion':'company_size','status':'MATCHED' if matched else 'UNMATCHED','expected_value':f"{size.get('min','?')}-{size.get('max','?')} employees",'actual_value':actual,'reason':'Research employee-count evidence was evaluated against the configured range.'})
                except (TypeError,ValueError): org.append(self._criterion('company_size',f"{size.get('min','?')}-{size.get('max','?')} employees",None,'Employee-count evidence is not numeric.'))
        company_text=' '.join(_text(x) for x in [company.get('industry'),company.get('business_model'),company.get('description'),*research.get('business_context',[])])
        exclusion_hit=next((term for term in exclusions if _norm(term) and _norm(term) in _norm(company_text)),None)
        if exclusion_hit: org.append({'criterion':'exclusion','status':'UNMATCHED','expected_value':f'Not {exclusion_hit}','actual_value':exclusion_hit,'reason':'Research explicitly indicates a configured exclusion.'})
        title=person.get('current_role') or person.get('title')
        if icp.get('target_roles'):
            if not _text(title): contact.append(self._criterion('target_role',icp['target_roles'],None,'No reliable current-role evidence was provided.'))
            else: contact.append({'criterion':'target_role','status':'MATCHED' if _title_match(title,icp['target_roles']) else 'UNMATCHED','expected_value':icp['target_roles'],'actual_value':title,'reason':'Current role was evaluated against the configured target roles.'})
        # Explicit uncertainty/contradictory research is surfaced rather than resolved by the engine.
        contradictory=any('conflict' in _norm(item) or 'contradict' in _norm(item) for item in uncertainties)
        if contradictory: uncertainties.append('Contradictory research evidence requires human review.')
        org_score=self._score(org); contact_score=self._score(contact); overall=round((org_score+contact_score)/2,2)
        org_status=self._status(org_score,org,bool(exclusion_hit)); contact_status='UNVERIFIED' if not contact or all(x['status']=='UNVERIFIED' for x in contact) else ('UNMATCHED' if any(x['status']=='UNMATCHED' for x in contact) else 'MATCHED')
        overall_status=self._status(overall,org+contact,bool(exclusion_hit))
        if exclusion_hit or any(x['status']=='UNMATCHED' for x in org+contact): next_stage='NOT_A_FIT'
        elif contradictory: next_stage='NEEDS_HUMAN_REVIEW'
        elif any(x['status']=='UNVERIFIED' for x in org+contact): next_stage='NEEDS_RESEARCH'
        else: next_stage='OUTREACH_ELIGIBLE'
        return {'organization_fit_score':org_score,'organization_fit_status':org_status,'organization_criteria':org,'contact_fit_score':contact_score,'contact_fit_status':contact_status,'contact_criteria':contact,'overall_fit_score':overall,'overall_fit_status':overall_status,'recommended_next_stage':next_stage,'key_fit_signals':[x['reason'] for x in org+contact if x['status']=='MATCHED'],'key_risk_factors':[x['reason'] for x in org+contact if x['status']=='UNMATCHED'],'uncertainties':uncertainties,'engine_version':self.version}
