#!/usr/bin/env bash
# Deploy the dashboard API to Cloud Run. Run in Cloud Shell from this folder:
#   PROJECT_ID=cropconcept-monitoring-2026 VERCEL_URL=https://your-app.vercel.app bash deploy.sh
set -euo pipefail
: "${PROJECT_ID:?Set PROJECT_ID}"
REGION="${REGION:-europe-west1}"
DATASET="${DATASET:-cropconcept_monitoring}"
BQ_LOCATION="${BQ_LOCATION:-US}"
VERCEL_URL="${VERCEL_URL:-*}"
SERVICE="cropconcept-api"
SA="cropconcept-api@${PROJECT_ID}.iam.gserviceaccount.com"
gcloud config set project "$PROJECT_ID" >/dev/null
gcloud services enable run.googleapis.com secretmanager.googleapis.com bigquery.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com

echo "Service account (read-only on the dataset)"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create cropconcept-api --display-name="CropConcept dashboard API"
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA}" --role=roles/bigquery.jobUser --condition=None >/dev/null
bq add-iam-policy-binding --member="serviceAccount:${SA}" --role=roles/bigquery.dataViewer "${PROJECT_ID}:${DATASET}" >/dev/null 2>&1 || \
  gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:${SA}" --role=roles/bigquery.dataViewer --condition=None >/dev/null

echo "API key (the Next.js server sends it; browsers never see it)"
if ! gcloud secrets describe cropconcept-api-key >/dev/null 2>&1; then
  KEY=$(python3 -c 'import secrets;print(secrets.token_urlsafe(32))')
  printf '%s' "$KEY" | gcloud secrets create cropconcept-api-key --data-file=- --replication-policy=automatic
  echo "  Generated API key. Save it as API_KEY in Vercel:"; echo "  $KEY"
fi
gcloud secrets add-iam-policy-binding cropconcept-api-key --member="serviceAccount:${SA}" --role=roles/secretmanager.secretAccessor >/dev/null

echo "Deploying"
gcloud run deploy "$SERVICE" --source . --region "$REGION" --service-account "$SA" --allow-unauthenticated \
  --cpu 1 --memory 512Mi --min-instances 0 --max-instances 5 --concurrency 40 --timeout 120 \
  --set-env-vars "GCP_PROJECT=${PROJECT_ID},BQ_DATASET=${DATASET},BQ_LOCATION=${BQ_LOCATION},ALLOWED_ORIGINS=${VERCEL_URL},CACHE_SECONDS=60" \
  --set-secrets "API_KEYS=cropconcept-api-key:latest"
URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format 'value(status.url)')
echo; echo "API URL (save as API_URL in Vercel): $URL"
echo "Check: curl $URL/health"
