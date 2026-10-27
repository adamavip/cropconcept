import os, re
os.environ["GCP_PROJECT"] = "test-project"
os.environ["API_KEYS"] = "k1"
from fastapi.testclient import TestClient
from app import main


class FakeField:
    def __init__(self, n): self.name = n

class FakeJob:
    def __init__(self, sql, qp):
        self.sql, self.qp = sql, qp
        self.total_bytes_processed = 1
        self._rows = [{"a": 1, "b": "x"}]
    def result(self, timeout=None):
        class R(list):
            schema = [FakeField("a"), FakeField("b")]
        return R(self._rows)

class FakeClient:
    def __init__(self): self.calls = []
    def query(self, sql, job_config=None):
        assert "{{" not in sql and "{DS}" not in sql
        assert "`test-project.cropconcept_monitoring." in sql
        for p in job_config.query_parameters:
            assert re.search(r"@" + p.name + r"\b", sql)
        self.calls.append((sql, job_config.query_parameters))
        return FakeJob(sql, job_config.query_parameters)


def setup_module(m):
    main._client = FakeClient()
    main.cache.store.clear()

def test_health_and_auth():
    c = TestClient(main.app)
    assert c.get("/health").json()["datasets"] == 43
    assert c.get("/datasets").status_code == 401
    assert c.get("/datasets", headers={"X-API-Key": "k1"}).status_code == 200

def test_every_dataset_renders():
    c = TestClient(main.app)
    for k in main.QUERIES:
        r = c.get(f"/datasets/{k}", headers={"X-API-Key": "k1"})
        assert r.status_code == 200, (k, r.text)
        assert r.json()["rows"] == [{"a": 1, "b": "x"}]

def test_params_and_cache():
    c = TestClient(main.app)
    n = len(main._client.calls)
    r1 = c.get("/datasets/p_kpis?p_country=Ethiopia&p_start=2026-09-01&bogus=1", headers={"X-API-Key": "k1"})
    assert r1.headers["X-Cache"] == "miss"
    sql, qp = main._client.calls[-1]
    names = {p.name: (p.type_, p.value) for p in qp}
    assert names["p_country"] == ("STRING", "Ethiopia") and str(names["p_start"][1]) == "2026-09-01" and names["p_end"] == ("DATE", None)
    r2 = c.get("/datasets/p_kpis?p_country=Ethiopia&p_start=2026-09-01", headers={"X-API-Key": "k1"})
    assert r2.headers["X-Cache"] == "hit" and len(main._client.calls) == n + 1
    assert c.get("/datasets/p_kpis?p_start=nope", headers={"X-API-Key": "k1"}).status_code == 400
    # tw_product default applies
    main.cache.store.clear()
    c.get("/datasets/tz_wtp_kpi", headers={"X-API-Key": "k1"})
    assert {p.name: p.value for p in main._client.calls[-1][1]}["tw_product"] == "Orange Plus Maize"

def test_page_bundle():
    c = TestClient(main.app)
    r = c.get("/page/et", headers={"X-API-Key": "k1"})
    assert set(r.json()["datasets"]) == {k for k in main.QUERIES if k.startswith("et_")}
