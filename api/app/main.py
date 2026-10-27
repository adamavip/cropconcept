"""CropConcept dashboard API.

One endpoint per dataset. Each runs a parameterised BigQuery query with the
service's own credentials, caches the result for a short time, and returns
plain JSON rows. The SQL is the same as the Claude dashboard's; see
queries.json.

Settings (environment variables):
  GCP_PROJECT       project that holds the dataset and is billed for queries
  BQ_DATASET        default cropconcept_monitoring
  BQ_LOCATION       default US
  API_KEYS          comma-separated keys; when set, requests need X-API-Key
  ALLOWED_ORIGINS   comma-separated CORS origins (your Vercel URL); default *
  CACHE_SECONDS     default 60
"""
from __future__ import annotations

import datetime as dt
import decimal
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

DATASET = os.environ.get("BQ_DATASET", "cropconcept_monitoring")
PROJECT = os.environ.get("GCP_PROJECT")
LOCATION = os.environ.get("BQ_LOCATION", "US")
CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "60"))
API_KEYS = {k.strip() for k in os.environ.get("API_KEYS", "").split(",") if k.strip()}
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "*").split(",") if o.strip()]

QUERIES: dict[str, dict] = json.loads((Path(__file__).parent / "queries.json").read_text(encoding="utf-8"))
DEFAULT_PARAMS: dict[str, Any] = {"tw_product": "Orange Plus Maize"}
PARAM_RE = re.compile(r"\{\{(\w+)\}\}")
DATE_PARAMS = {"p_start", "p_end"}

app = FastAPI(title="CropConcept dashboard API", version="1.0.0", docs_url="/docs")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["GET"], allow_headers=["X-API-Key", "Content-Type"])

_client = None
_client_lock = threading.Lock()


def bq():
    """BigQuery client, created once. Swapped out in tests."""
    global _client
    with _client_lock:
        if _client is None:
            from google.cloud import bigquery
            _client = bigquery.Client(project=PROJECT, location=LOCATION)
        return _client


def require_key(request: Request):
    if not API_KEYS:
        return
    if request.headers.get("X-API-Key") not in API_KEYS:
        raise HTTPException(401, "Missing or invalid API key")


class Cache:
    def __init__(self):
        self.store: dict[str, tuple[float, Any]] = {}
        self.lock = threading.Lock()

    def get(self, key: str):
        with self.lock:
            hit = self.store.get(key)
            if hit and hit[0] > time.time():
                return hit[1]
            return None

    def put(self, key: str, value: Any):
        with self.lock:
            if len(self.store) > 2000:
                self.store.clear()
            self.store[key] = (time.time() + CACHE_SECONDS, value)


cache = Cache()


def _jsonable(v):
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, bytes):
        return v.decode("utf-8", "replace")
    return v


def render(sql: str, params: dict[str, Any]):
    """Replace {{name}} with @name and build typed BigQuery parameters."""
    from google.cloud import bigquery
    used = sorted(set(PARAM_RE.findall(sql)))
    qp = []
    for name in used:
        value = params.get(name)
        if value in ("", None):
            value = DEFAULT_PARAMS.get(name)
        if name in DATE_PARAMS:
            qp.append(bigquery.ScalarQueryParameter(name, "DATE", value or None))
        else:
            qp.append(bigquery.ScalarQueryParameter(name, "STRING", value if value not in ("", None) else None))
    return PARAM_RE.sub(lambda m: "@" + m.group(1), sql).replace("{DS}", f"{PROJECT}.{DATASET}"), qp


def run_query(key: str, params: dict[str, Any]) -> dict:
    from google.cloud import bigquery
    q = QUERIES[key]
    sql, qp = render(q["sql"], params)
    job = bq().query(sql, job_config=bigquery.QueryJobConfig(query_parameters=qp, use_query_cache=True))
    rows = [{k: _jsonable(v) for k, v in dict(r).items()} for r in job.result(timeout=120)]
    cols = [f.name for f in job.result().schema]
    return {"id": key, "title": q["title"], "columns": cols, "rows": rows,
            "bytes_processed": job.total_bytes_processed, "params": {p: (params.get(p) if params.get(p) not in ("", None) else DEFAULT_PARAMS.get(p)) for p in q["params"]}}


def clean_params(raw: dict[str, str]) -> dict[str, Any]:
    out = {}
    for k, v in raw.items():
        if k not in ALL_PARAMS:
            continue
        v = (v or "").strip()
        if k in DATE_PARAMS and v and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", v):
            raise HTTPException(400, f"{k} must be YYYY-MM-DD")
        if len(v) > 200:
            raise HTTPException(400, f"{k} too long")
        out[k] = v or None
    return out


ALL_PARAMS = sorted({p for q in QUERIES.values() for p in q["params"]})


@app.get("/health")
def health():
    return {"ok": True, "datasets": len(QUERIES), "project": PROJECT, "dataset": DATASET}


@app.get("/datasets", dependencies=[Depends(require_key)])
def list_datasets():
    return [{"id": k, "title": v["title"], "description": v["description"], "params": v["params"]} for k, v in QUERIES.items()]


@app.get("/datasets/{key}", dependencies=[Depends(require_key)])
def dataset(key: str, request: Request):
    if key not in QUERIES:
        raise HTTPException(404, f"No dataset {key}")
    params = clean_params(dict(request.query_params))
    relevant = {p: params.get(p) for p in QUERIES[key]["params"]}
    ck = key + "|" + json.dumps(relevant, sort_keys=True)
    hit = cache.get(ck)
    if hit is not None:
        return JSONResponse(hit, headers={"X-Cache": "hit", "Cache-Control": f"public, max-age={CACHE_SECONDS}"})
    try:
        data = run_query(key, relevant)
    except HTTPException:
        raise
    except Exception as exc:  # surface BigQuery's words, without the SQL
        raise HTTPException(502, f"BigQuery error: {str(exc)[:300]}")
    cache.put(ck, data)
    return JSONResponse(data, headers={"X-Cache": "miss", "Cache-Control": f"public, max-age={CACHE_SECONDS}"})


@app.get("/page/{group}", dependencies=[Depends(require_key)])
def page(group: str, request: Request):
    """All datasets whose ids start with a prefix, in one call (e.g. /page/p for the portfolio pages)."""
    keys = [k for k in QUERIES if k == group or k.startswith(group + "_")]
    if not keys:
        raise HTTPException(404, f"No datasets for {group}")
    params = clean_params(dict(request.query_params))
    out, errors = {}, {}
    for k in keys:
        relevant = {p: params.get(p) for p in QUERIES[k]["params"]}
        ck = k + "|" + json.dumps(relevant, sort_keys=True)
        hit = cache.get(ck)
        if hit is None:
            try:
                hit = run_query(k, relevant)
                cache.put(ck, hit)
            except Exception as exc:
                errors[k] = str(exc)[:300]
                continue
        out[k] = hit
    return {"datasets": out, "errors": errors}
