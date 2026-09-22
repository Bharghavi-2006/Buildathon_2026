import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db.session import init_db, SessionLocal
from app.seed.data import seed


async def _ready():
    await init_db()
    async with SessionLocal() as db:
        await seed(db)


async def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url='http://test')


@pytest.mark.asyncio
async def test_demo_login_manager_succeeds():
    await _ready()
    async with await _client() as client:
        res = await client.post('/auth/demo-login', json={'email': 'manager@demo.local', 'password': 'manager123'})
        assert res.status_code == 200
        body = res.json()
        assert body['authenticated'] is True
        assert body['user']['email'] == 'manager@demo.local'
        assert body['user']['role'] == 'manager'
        assert body['user']['representative_id'] is None


@pytest.mark.asyncio
async def test_demo_login_representative_succeeds():
    await _ready()
    async with await _client() as client:
        res = await client.post('/auth/demo-login', json={'email': 'aisha@demo.local', 'password': 'aisha123'})
        assert res.status_code == 200
        body = res.json()
        assert body['user']['role'] == 'representative'
        assert body['user']['representative_id']

        res2 = await client.post('/auth/demo-login', json={'email': 'vikram@demo.local', 'password': 'vikram123'})
        assert res2.status_code == 200
        assert res2.json()['user']['role'] == 'representative'


@pytest.mark.asyncio
async def test_demo_login_rejects_wrong_password():
    await _ready()
    async with await _client() as client:
        res = await client.post('/auth/demo-login', json={'email': 'manager@demo.local', 'password': 'wrong'})
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_demo_login_rejects_unknown_email():
    await _ready()
    async with await _client() as client:
        res = await client.post('/auth/demo-login', json={'email': 'nobody@demo.local', 'password': 'whatever'})
        assert res.status_code == 401


@pytest.mark.asyncio
async def test_demo_login_is_case_insensitive_on_email():
    await _ready()
    async with await _client() as client:
        res = await client.post('/auth/demo-login', json={'email': 'MANAGER@DEMO.LOCAL', 'password': 'manager123'})
        assert res.status_code == 200
