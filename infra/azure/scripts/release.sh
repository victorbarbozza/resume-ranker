#!/bin/bash
set -euo pipefail

: "${IMAGE:?set IMAGE, the image to release, such as ghcr.io/owner/resume-ranker:<sha>}"
GROUP=rg-resume-ranker
APP=ca-resume-ranker
MIGRATE_JOB=caj-resume-ranker-migrate
az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors

echo "▶ Migrations with $IMAGE"
az containerapp job update --name "$MIGRATE_JOB" --resource-group "$GROUP" --image "$IMAGE" --output none
EXECUTION=$(az containerapp job start --name "$MIGRATE_JOB" --resource-group "$GROUP" --query name --output tsv)
STATUS=Running
for _ in $(seq 1 60); do
  STATUS=$(az containerapp job execution show --name "$MIGRATE_JOB" --resource-group "$GROUP" \
    --job-execution-name "$EXECUTION" --query properties.status --output tsv)
  [ "$STATUS" = "Succeeded" ] && break
  [ "$STATUS" = "Failed" ] && { echo "✗ Migrations failed: execution $EXECUTION"; exit 1; }
  sleep 10
done
[ "$STATUS" = "Succeeded" ] || { echo "✗ Migrations did not finish in 10 minutes"; exit 1; }
echo "✓ Migrations applied"

echo "▶ App with $IMAGE"
az containerapp update --name "$APP" --resource-group "$GROUP" --image "$IMAGE" --output none
LATEST=""
READY="-"
for _ in $(seq 1 60); do
  read -r LATEST READY < <(az containerapp show --name "$APP" --resource-group "$GROUP" \
    --query "[properties.latestRevisionName, properties.latestReadyRevisionName]" --output tsv | paste - -)
  [ "$LATEST" = "$READY" ] && break
  sleep 10
done
[ "$LATEST" = "$READY" ] || { echo "✗ Revision $LATEST did not become ready in 10 minutes"; exit 1; }

URL=https://$(az containerapp show --name "$APP" --resource-group "$GROUP" \
  --query properties.configuration.ingress.fqdn --output tsv)
curl --fail --silent --show-error --retry 5 --retry-delay 5 --retry-all-errors "$URL/api/health" > /dev/null
echo "✓ Released $LATEST at $URL"
