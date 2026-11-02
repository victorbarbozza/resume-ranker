#!/bin/bash
set -euo pipefail

: "${STATE_STORAGE_ACCOUNT:?set STATE_STORAGE_ACCOUNT to a new, globally unique storage account name, such as stresumerankerstate42}"
: "${PULUMI_CONFIG_PASSPHRASE:?set PULUMI_CONFIG_PASSPHRASE to the passphrase that will encrypt the stack secrets; keep it in a password manager}"
: "${BUDGET_EMAIL:?set BUDGET_EMAIL to the address the budget alerts go to}"
LOCATION=${LOCATION:-brazilsouth}
STATE_GROUP=rg-resume-ranker-state
SUBSCRIPTION=$(az account show --query id --output tsv)
TENANT=$(az account show --query tenantId --output tsv)

echo "▶ Resource providers the stack uses"
for PROVIDER in Microsoft.App Microsoft.DBforPostgreSQL Microsoft.CognitiveServices Microsoft.Storage Microsoft.Consumption; do
  az provider register --namespace "$PROVIDER" --wait --output none
done

echo "▶ Resource group $STATE_GROUP"
az group create --name "$STATE_GROUP" --location "$LOCATION" --output none

echo "▶ Storage account $STATE_STORAGE_ACCOUNT, with versioning and soft delete"
az storage account create --name "$STATE_STORAGE_ACCOUNT" --resource-group "$STATE_GROUP" \
  --location "$LOCATION" --sku Standard_LRS --kind StorageV2 \
  --min-tls-version TLS1_2 --allow-blob-public-access false --output none
az storage account blob-service-properties update --account-name "$STATE_STORAGE_ACCOUNT" \
  --resource-group "$STATE_GROUP" --enable-versioning true \
  --enable-delete-retention true --delete-retention-days 30 --output none
az storage container create --name pulumi-state --account-name "$STATE_STORAGE_ACCOUNT" \
  --auth-mode key --output none
STATE_ACCOUNT_ID=$(az storage account show --name "$STATE_STORAGE_ACCOUNT" \
  --resource-group "$STATE_GROUP" --query id --output tsv)

echo "▶ Service principal resume-ranker-ci: Contributor on the subscription, and the state container"
read -r CLIENT_ID CLIENT_SECRET < <(az ad sp create-for-rbac --name resume-ranker-ci \
  --role Contributor --scopes "/subscriptions/$SUBSCRIPTION" \
  --query "[appId, password]" --output tsv | paste - -)
az role assignment create --assignee "$CLIENT_ID" --role "Storage Blob Data Contributor" \
  --scope "$STATE_ACCOUNT_ID" --output none

echo "▶ GitHub secrets"
gh secret set AZURE_CLIENT_ID --body "$CLIENT_ID"
gh secret set AZURE_CLIENT_SECRET --body "$CLIENT_SECRET"
gh secret set AZURE_TENANT_ID --body "$TENANT"
gh secret set AZURE_SUBSCRIPTION_ID --body "$SUBSCRIPTION"
gh secret set STATE_STORAGE_ACCOUNT --body "$STATE_STORAGE_ACCOUNT"
gh secret set PULUMI_CONFIG_PASSPHRASE --body "$PULUMI_CONFIG_PASSPHRASE"
gh secret set BUDGET_EMAIL --body "$BUDGET_EMAIL"

echo "✓ Ready: a push to main deploys. Running this again rotates the client secret."
