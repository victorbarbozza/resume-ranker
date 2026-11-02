#!/bin/bash
set -euo pipefail

: "${IMAGE:?set IMAGE, the image to release, such as ghcr.io/owner/resume-ranker:<sha>}"
: "${STATE_STORAGE_ACCOUNT:?set STATE_STORAGE_ACCOUNT, the storage account bootstrap.sh created}"
STACK=${STACK:-prod}

cd "$(dirname "$0")/.."
export AZURE_STORAGE_ACCOUNT=$STATE_STORAGE_ACCOUNT
GROUP=$(pulumi stack output resourceGroup --stack "$STACK")
APP=$(pulumi stack output appName --stack "$STACK")
MIGRATE_JOB=$(pulumi stack output migrateJobName --stack "$STACK")
az config set extension.use_dynamic_install=yes_without_prompt --only-show-errors

echo "▶ Migrations with $IMAGE"
az containerapp job update --name "$MIGRATE_JOB" --resource-group "$GROUP" --image "$IMAGE" --output none
EXECUTION=$(az containerapp job start --name "$MIGRATE_JOB" --resource-group "$GROUP" --query name --output tsv)
STATUS=""
for _ in $(seq 1 60); do
  STATUS=$(az containerapp job execution show --name "$MIGRATE_JOB" --resource-group "$GROUP" \
    --job-execution-name "$EXECUTION" --query properties.status --output tsv)
  case "$STATUS" in
    Succeeded) break ;;
    Running | Processing | "") sleep 10 ;;
    *) echo "✗ Migrations ended as $STATUS: execution $EXECUTION"; exit 1 ;;
  esac
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

URL=$(pulumi stack output url --stack "$STACK")
curl --fail --silent --show-error --retry 5 --retry-delay 5 --retry-all-errors "$URL/api/health" > /dev/null
echo "✓ Released $LATEST at $URL"
