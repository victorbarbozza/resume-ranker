#!/bin/bash
set -euo pipefail

: "${STATE_STORAGE_ACCOUNT:?set STATE_STORAGE_ACCOUNT to a new, globally unique storage account name, such as stresumerankerstate42}"
: "${PULUMI_CONFIG_PASSPHRASE:?set PULUMI_CONFIG_PASSPHRASE to the passphrase that will encrypt the stack secrets; keep it in a password manager}"
: "${BUDGET_EMAIL:?set BUDGET_EMAIL to the address the budget alerts go to}"
LOCATION=${LOCATION:-brazilsouth}
APP_GROUP=rg-resume-ranker
STATE_GROUP=rg-resume-ranker-state
ROLE=resume-ranker-deployer
SUBSCRIPTION=$(az account show --query id --output tsv)
TENANT=$(az account show --query tenantId --output tsv)

echo "▶ Resource providers the stack uses"
for PROVIDER in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.CognitiveServices Microsoft.Storage Microsoft.Consumption; do
  az provider register --namespace "$PROVIDER" --wait --output none
done

echo "▶ Resource groups $APP_GROUP and $STATE_GROUP"
APP_GROUP_ID=$(az group create --name "$APP_GROUP" --location "$LOCATION" --query id --output tsv)
az group create --name "$STATE_GROUP" --location "$LOCATION" --output none

echo "▶ Storage account $STATE_STORAGE_ACCOUNT for the Pulumi state, with versioning and soft delete"
az storage account create --name "$STATE_STORAGE_ACCOUNT" --resource-group "$STATE_GROUP" \
  --location "$LOCATION" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false --output none
az storage account blob-service-properties update --account-name "$STATE_STORAGE_ACCOUNT" \
  --resource-group "$STATE_GROUP" --enable-versioning true \
  --enable-delete-retention true --delete-retention-days 30 --output none
az storage container create --name pulumi-state --account-name "$STATE_STORAGE_ACCOUNT" \
  --auth-mode key --output none
STATE_CONTAINER_ID="$(az storage account show --name "$STATE_STORAGE_ACCOUNT" \
  --resource-group "$STATE_GROUP" --query id --output tsv)/blobServices/default/containers/pulumi-state"

echo "▶ Role $ROLE: only what the stack creates, only in $APP_GROUP"
ROLE_FILE=$(mktemp)
cat > "$ROLE_FILE" <<JSON
{
  "Name": "$ROLE",
  "Description": "Deploys Resume Ranker: Container Apps, PostgreSQL, storage, Azure OpenAI and a budget, in its resource group only. It cannot grant access.",
  "Actions": [
    "Microsoft.Resources/subscriptions/resourceGroups/read",
    "Microsoft.App/*",
    "Microsoft.DBforPostgreSQL/flexibleServers/*",
    "Microsoft.DBforPostgreSQL/locations/*/read",
    "Microsoft.Storage/storageAccounts/*",
    "Microsoft.Storage/locations/*/read",
    "Microsoft.CognitiveServices/accounts/*",
    "Microsoft.CognitiveServices/locations/*/read",
    "Microsoft.Consumption/budgets/*"
  ],
  "NotActions": [],
  "AssignableScopes": ["$APP_GROUP_ID"]
}
JSON
if [ -n "$(az role definition list --name "$ROLE" --query "[].id" --output tsv)" ]; then
  az role definition update --role-definition "$ROLE_FILE" --output none
else
  az role definition create --role-definition "$ROLE_FILE" --output none
fi
rm -f "$ROLE_FILE"

echo "▶ Service principal resume-ranker-ci, with $ROLE on $APP_GROUP and the state container only"
read -r CLIENT_ID CLIENT_SECRET < <(az ad sp create-for-rbac --name resume-ranker-ci \
  --query "[appId, password]" --output tsv | paste - -)
assign() {
  for _ in $(seq 1 12); do
    if [ -n "$(az role assignment list --assignee "$CLIENT_ID" --role "$1" --scope "$2" --query "[0].id" --output tsv 2>/dev/null)" ]; then
      return 0
    fi
    az role assignment create --assignee "$CLIENT_ID" --role "$1" --scope "$2" --output none 2>/dev/null || sleep 10
  done
  echo "✗ Could not assign $1 on $2; run this again in a minute"
  exit 1
}
assign "$ROLE" "$APP_GROUP_ID"
assign "Storage Blob Data Contributor" "$STATE_CONTAINER_ID"

echo "▶ GitHub secrets"
gh secret set AZURE_CLIENT_ID --body "$CLIENT_ID"
gh secret set AZURE_CLIENT_SECRET --body "$CLIENT_SECRET"
gh secret set AZURE_TENANT_ID --body "$TENANT"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION"
gh secret set STATE_STORAGE_ACCOUNT --body "$STATE_STORAGE_ACCOUNT"
gh secret set PULUMI_CONFIG_PASSPHRASE --body "$PULUMI_CONFIG_PASSPHRASE"
gh secret set BUDGET_EMAIL --body "$BUDGET_EMAIL"

echo "✓ Ready: a push to main deploys. Running this again rotates the client secret and updates the role."
