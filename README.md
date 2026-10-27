# CropConcept fieldwork dashboard: Next.js + FastAPI

Two deployable parts, exported from the Claude dashboard with the same SQL, charts and design.

```
api/   FastAPI service for Google Cloud Run. Runs the 43 BigQuery queries with a service
       account, caches results for 60 s, requires an API key.
web/   Next.js 15 app for Vercel. Renders the dashboard; a server route proxies data
       requests to the API and adds the key, so browsers never see it.
```

Data flow: SurveyCTO → (Cloud Run job, every 15 min) → BigQuery → **api** → **web** → browser.
The sync job is the one you already deployed; nothing changes there.

## 1. Deploy the API to Cloud Run (about 5 minutes)

In Google Cloud Shell, upload and unzip this package, then:

```bash
cd api
PROJECT_ID=cropconcept-monitoring-2026 bash deploy.sh
```

The script creates a read-only service account, generates an API key in Secret
Manager (it prints the key once), builds the container and deploys it. At the end it
prints the service URL. Keep both; Vercel needs them.

Check: `curl <service-url>/health` returns `{"ok": true, "datasets": 43, ...}`.

After Vercel gives you a URL, lock CORS to it:

```bash
VERCEL_URL=https://your-app.vercel.app PROJECT_ID=cropconcept-monitoring-2026 bash deploy.sh
```

Cost: the service scales to zero. Each dataset is one small BigQuery query (a few MB
scanned), cached for a minute, so a day of normal use costs cents.

## 2. Deploy the frontend to Vercel (about 5 minutes)

1. Push the `web/` folder to a Git repository (GitHub, GitLab or Bitbucket).
2. In Vercel, **Add New Project**, import the repository. Framework preset: Next.js.
   Root directory: `web` if the repo holds both folders.
3. Under **Environment Variables**, add:
   - `API_URL` = the Cloud Run service URL from step 1
   - `API_KEY` = the key `deploy.sh` printed
4. Deploy.

Local run: `cd web && cp .env.example .env.local` (fill in both values), then
`npm install && npm run dev` and open http://localhost:3000.

## Pages and URLs

| URL | Page |
|---|---|
| `/` | Executive summary |
| `/monitoring` | Survey monitoring |
| `/demographics` | Demographics |
| `/traits/et`, `/traits/tz`, `/traits/la` | Trait preferences by study |
| `/wtp/et`, `/wtp/tz`, `/wtp/la` | Willingness to pay by study |

Light/dark mode is remembered per browser. Filters live in memory per visit.

## API

| Endpoint | What it returns |
|---|---|
| `GET /health` | status, no key needed |
| `GET /datasets` | the 43 dataset ids, titles and their filter parameters |
| `GET /datasets/{id}?p_country=Ethiopia&…` | one dataset's rows; filters are query parameters named as in `queries.json` |
| `GET /page/{prefix}` | every dataset whose id starts with a prefix (`p`, `et`, `ew`, `tz`, `tw`, `la`, `lw`) in one call |
| `GET /docs` | interactive OpenAPI documentation |

Every request except `/health` needs the header `X-API-Key`. Filters are sent as
BigQuery query parameters, never pasted into SQL. Dates must be `YYYY-MM-DD`.

## Changing things

- **A query**: edit `api/app/queries.json` (`sql` holds BigQuery SQL with `{{param}}`
  placeholders and `{DS}` for the dataset) and redeploy the API. The same change
  can be made in the Claude dashboard's Sources panel.
- **A chart or page**: `web/lib/pages.js` draws pages, `web/lib/kit.js` holds the chart
  functions, `web/lib/templates.ts` the page markup, `web/styles/dashboard.css` the
  neobrutalist theme and CIMMYT palette. These are the dashboard's own files, ported
  as ES modules.
- **Who can see it**: Vercel deployments are public by default. For CGIAR-only access,
  turn on Vercel Authentication (Deployment Protection) on the project, or put the app
  behind Google Identity-Aware Proxy by hosting it on Cloud Run instead.

## Tests

```bash
cd api && pip install -r requirements.txt pytest httpx && python -m pytest
cd web && npm install && npm run build
```

The API tests run every stored query through the parameter renderer against a fake
BigQuery client; the frontend build type-checks and prerenders all nine routes.
