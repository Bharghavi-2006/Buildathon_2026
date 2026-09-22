import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import init_db
from app.db.session import SessionLocal
from app.seed.data import seed
from app.db.models import Campaign, User

@pytest.mark.asyncio
async def test_full_new_campaign_wizard_flow():
    # Initialize DB and seed
    await init_db()
    async with SessionLocal() as db:
        await seed(db)

    transport = ASGITransport(app=app)
    headers = {'X-User-Email': 'manager@demo.local'}

    async with AsyncClient(transport=transport, base_url='http://test') as client:
        # 18. Existing Dashboard and seeded campaigns continue working
        dash_res = await client.get('/api/manager/dashboard', headers=headers)
        assert dash_res.status_code == 200
        dash_data = dash_res.json()
        assert 'campaigns' in dash_data
        camp_names = [c['name'] for c in dash_data['campaigns']]
        assert 'US Enterprise SaaS Engineering Leaders' in camp_names
        assert 'US SaaS Enterprise CTOs' in camp_names
        assert 'India BFSI Digital Transformation Leaders' in camp_names

        # Check seeded statuses
        seeded_hero = next(c for c in dash_data['campaigns'] if c['name'] == 'US Enterprise SaaS Engineering Leaders')
        assert seeded_hero['status'] == 'LIVE'
        seeded_a = next(c for c in dash_data['campaigns'] if c['name'] == 'US SaaS Enterprise CTOs')
        assert seeded_a['status'] == 'LIVE'
        seeded_b = next(c for c in dash_data['campaigns'] if c['name'] == 'India BFSI Digital Transformation Leaders')
        assert seeded_b['status'] == 'PAUSED'

        # Get available managers for Step 1
        mgr_res = await client.get('/team/managers', headers=headers)
        assert mgr_res.status_code == 200
        managers = mgr_res.json()
        assert len(managers) > 0
        owner_id = managers[0]['user']['id']

        # 1. Cannot continue Step 1 without name
        # 3. Step 1 creates a real draft campaign
        create_res = await client.post('/api/manager/campaigns', json={'name': 'DevOps Scale-Up Campaign', 'description': 'Targeting DevOps leaders'}, headers=headers)
        assert create_res.status_code == 200
        camp = create_res.json()
        campaign_id = camp['id']
        assert camp['status'] == 'DRAFT'
        assert camp['name'] == 'DevOps Scale-Up Campaign'

        # 1 & 2. Cannot update identity without valid name or owner
        bad_name_res = await client.patch(f'/api/manager/campaigns/{campaign_id}/identity', json={'name': '   ', 'description': 'desc', 'owner_id': owner_id}, headers=headers)
        assert bad_name_res.status_code == 422

        bad_owner_res = await client.patch(f'/api/manager/campaigns/{campaign_id}/identity', json={'name': 'Valid Name', 'description': 'desc', 'owner_id': 'invalid-owner-id'}, headers=headers)
        assert bad_owner_res.status_code == 422

        # 4. Refreshing after Step 1 does not create duplicate campaign - updates existing draft
        ident_res = await client.patch(f'/api/manager/campaigns/{campaign_id}/identity', json={'name': 'DevOps Scale-Up 2026', 'description': 'Targeting DevOps leaders', 'owner_id': owner_id}, headers=headers)
        assert ident_res.status_code == 200
        assert ident_res.json()['name'] == 'DevOps Scale-Up 2026'

        # Check identity endpoint
        get_ident_res = await client.get(f'/api/manager/campaigns/{campaign_id}/identity', headers=headers)
        assert get_ident_res.status_code == 200
        assert get_ident_res.json()['owner_id'] == owner_id

        # 16. Backend rejects invalid activation early
        premature_act = await client.post(f'/api/manager/campaigns/{campaign_id}/activate', headers=headers)
        assert premature_act.status_code == 422
        assert premature_act.json()['detail']['message'] == 'Launch validation failed'

        # 5. Step 2 persists ICP
        icp_payload = {
            'geography': 'US & Canada',
            'target_roles': ['Head of DevOps', 'VP Platform Engineering', 'CTO'],
            'industries': ['Cloud Infrastructure', 'Enterprise Software'],
            'company_size': {'min': 50, 'max': 1500},
            'revenue_range': {'min': '10M', 'max': '100M'},
            'funding_stage': ['Series B', 'Series C'],
            'technologies': ['Kubernetes', 'Terraform', 'AWS'],
            'exclusion_criteria': ['Recruiting Agencies', 'Consultancies'],
            'reference_profiles': [],
            'custom_criteria': {},
        }
        icp_res = await client.patch(f'/api/manager/campaigns/{campaign_id}/icp', json=icp_payload, headers=headers)
        assert icp_res.status_code == 200
        get_icp_res = await client.get(f'/api/manager/campaigns/{campaign_id}/icp', headers=headers)
        assert get_icp_res.status_code == 200
        saved_icp = get_icp_res.json()
        assert saved_icp['geography'] == 'US & Canada'
        assert 'Head of DevOps' in saved_icp['target_roles']

        # 6. Step 3 persists enabled agents
        agents_res = await client.get(f'/api/manager/campaigns/{campaign_id}/agents', headers=headers)
        assert agents_res.status_code == 200
        agents_list = agents_res.json()
        assert len(agents_list) == 8

        # Enable DISCOVERY, ICP_FITMENT, RESEARCH, PERSONALIZATION, CONVERSATION
        for a in agents_list:
            atype = a['agent']['agent_type']
            if atype in ['DISCOVERY', 'ICP_FITMENT', 'RESEARCH', 'PERSONALIZATION', 'CONVERSATION']:
                aid = a['agent']['id']
                patch_agent = await client.patch(
                    f'/api/manager/campaigns/{campaign_id}/agents/{aid}',
                    json={'enabled': True, 'responsibilities': ['Autonomous execution'], 'decision_thresholds': {}, 'escalation_rules': {}, 'prompt_version_id': None},
                    headers=headers,
                )
                assert patch_agent.status_code == 200
                assert patch_agent.json()['enabled'] is True

        # 7. Auto-discovery uses the campaign's ICP
        # 8. Prospect preview displays backend fitment/conflict information
        disc_res = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/discover', json={'requested_count': 15}, headers=headers)
        assert disc_res.status_code == 200
        disc_data = disc_res.json()
        assert 'prospects' in disc_data
        candidates = disc_data['prospects']
        assert len(candidates) > 0
        assert 'fit_score' in candidates[0]
        assert 'fit_reasons' in candidates[0]
        assert 'conflict' in candidates[0]

        # 9. Manager can manually select prospects
        # 10. Only selected prospects are approved
        eligible_ids = [c['prospect_id'] for c in candidates if c['fit_score'] >= 60 and not c['conflict'] and not c['suppressed']]
        assert len(eligible_ids) >= 2
        selected_subset = eligible_ids[:3]

        # Approve batch
        app_batch_res = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/approve-batch', headers=headers)
        assert app_batch_res.status_code == 200

        # Select subset
        select_res = await client.post(f'/api/manager/campaigns/{campaign_id}/prospects/select', json={'prospect_ids': selected_subset}, headers=headers)
        assert select_res.status_code == 200
        sel_data = select_res.json()
        assert len(sel_data['selected']) == len(selected_subset)

        # Verify enrolled in campaign prospects
        prosp_res = await client.get(f'/campaigns/{campaign_id}/prospects', headers=headers)
        assert prosp_res.status_code == 200
        assert len(prosp_res.json()) == len(selected_subset)

        # 11. Channel configuration persists
        channels_payload = {
            'channels': [
                {'channel': 'email', 'enabled': True, 'daily_limit': 30, 'approval_required': True},
                {'channel': 'linkedin', 'enabled': True, 'daily_limit': 20, 'approval_required': True},
                {'channel': 'message', 'enabled': False, 'daily_limit': 10, 'approval_required': True},
                {'channel': 'voice', 'enabled': False, 'daily_limit': 5, 'approval_required': True},
            ]
        }
        chan_res = await client.patch(f'/api/manager/campaigns/{campaign_id}/channels', json=channels_payload, headers=headers)
        assert chan_res.status_code == 200
        get_chan_res = await client.get(f'/api/manager/campaigns/{campaign_id}/channels', headers=headers)
        assert get_chan_res.status_code == 200
        saved_channels = get_chan_res.json()
        assert any(c['channel'] == 'email' and c['enabled'] for c in saved_channels)

        # 12. Prompt configuration persists & activates
        prompt_res = await client.post(
            f'/api/manager/campaigns/{campaign_id}/prompts',
            json={'agent_type': 'PERSONALIZATION', 'prompt_text': 'Draft consultative outreach for DevOps leaders referencing active cloud challenges.'},
            headers=headers,
        )
        assert prompt_res.status_code == 200
        prompt_id = prompt_res.json()['id']

        act_prompt_res = await client.post(f'/api/manager/campaigns/{campaign_id}/prompts/{prompt_id}/activate', headers=headers)
        assert act_prompt_res.status_code == 200
        assert act_prompt_res.json()['active'] is True

        # 13. Rep assignment persists
        # 14. Capacity warning does not hard-block assignment
        rep_matches_res = await client.get(f'/api/manager/campaigns/{campaign_id}/rep-matches', headers=headers)
        assert rep_matches_res.status_code == 200
        rep_matches = rep_matches_res.json()
        assert len(rep_matches) > 0

        assigned_rep_id = rep_matches[0]['representative_id']
        assign_res = await client.post(
            f'/campaigns/{campaign_id}/representatives',
            json={
                'representative_id': assigned_rep_id,
                'daily_send_limit': 25,
                'assigned_lead_limit': 20,
                'working_hours': {'start': 9, 'end': 18},
                'routing_rule': {'strategy': 'round_robin'},
            },
            headers=headers,
        )
        assert assign_res.status_code == 200

        # Persist rep config
        rep_cfg_res = await client.patch(
            f'/api/manager/campaigns/{campaign_id}/representatives-config',
            json={'routing_strategy': 'round_robin', 'rep_limits': {assigned_rep_id: {'daily_send_limit': 25, 'assigned_lead_limit': 20}}},
            headers=headers,
        )
        assert rep_cfg_res.status_code == 200

        # Check assigned reps endpoint
        get_reps_res = await client.get(f'/campaigns/{campaign_id}/representatives', headers=headers)
        assert get_reps_res.status_code == 200
        assert len(get_reps_res.json()) >= 1

        # 15. Launch checklist verification
        check_res = await client.get(f'/api/manager/campaigns/{campaign_id}/launch-check', headers=headers)
        assert check_res.status_code == 200
        checks = check_res.json()
        assert checks['ready'] is True, f"Checklist not ready: {checks['checks']}"

        # 17. Successful activation changes DRAFT → LIVE
        activate_res = await client.post(f'/api/manager/campaigns/{campaign_id}/activate', headers=headers)
        assert activate_res.status_code == 200
        final_camp = activate_res.json()
        assert final_camp['status'] == 'LIVE'

        # Verify campaign in main listing is LIVE
        get_final = await client.get(f'/campaigns/{campaign_id}', headers=headers)
        assert get_final.status_code == 200
        assert get_final.json()['status'] == 'LIVE'
