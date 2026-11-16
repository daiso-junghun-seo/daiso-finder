#!/usr/bin/env bash
# Deploy the budget kill switch (docs/deploy/gcp-e2-micro.md §1).
#
#   bash deploy/gcp-killswitch/deploy.sh
#
# Idempotent: re-running updates the function in place. The service account must already hold
# roles/billing.projectManager on the project (see the runbook). BUDGET_DISPLAY_NAME must match the
# budget exactly, because that string is the only thing separating this budget from any other alert.
set -euo pipefail

PROJECT="${PROJECT:-daiso-finder-prod}"
REGION="${REGION:-us-west1}"
TOPIC="${TOPIC:-budget-killswitch}"
FUNCTION="${FUNCTION:-budget-killswitch}"
SA="${SA:-budget-killswitch@${PROJECT}.iam.gserviceaccount.com}"
BUDGET_DISPLAY_NAME="${BUDGET_DISPLAY_NAME:-daiso-finder-prod 2000 KRW monthly}"

cd "$(dirname "$0")"

# gen2 + nodejs24: nodejs20 is past support on 2nd gen (gcloud refuses it, 2026-11).
gcloud functions deploy "${FUNCTION}" \
  --project="${PROJECT}" \
  --region="${REGION}" \
  --gen2 \
  --runtime=nodejs24 \
  --source=. \
  --trigger-topic="${TOPIC}" \
  --entry-point=killSwitch \
  --service-account="${SA}" \
  --set-env-vars="GCP_PROJECT=${PROJECT},BUDGET_DISPLAY_NAME=${BUDGET_DISPLAY_NAME},KILL_THRESHOLD=1" \
  --memory=256MB \
  --timeout=60s \
  --max-instances=1 \
  --quiet
