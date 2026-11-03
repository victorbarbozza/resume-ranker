#!/bin/bash
set -euo pipefail

: "${STATE_STORAGE_ACCOUNT:?set STATE_STORAGE_ACCOUNT, the storage account bootstrap.sh created}"
: "${PULUMI_CONFIG_PASSPHRASE:?set PULUMI_CONFIG_PASSPHRASE, the passphrase bootstrap.sh stored}"
STACK=${STACK:-prod}

cd "$(dirname "$0")/.."
export AZURE_STORAGE_ACCOUNT=$STATE_STORAGE_ACCOUNT
pulumi login "azblob://pulumi-state?storage_account=$STATE_STORAGE_ACCOUNT"
pulumi stack select "$STACK" --create

if [ "${PULUMI_PREVIEW:-}" = "true" ] && [ -n "${PULUMI_PREVIEW_JSON:-}" ]; then
  pulumi preview --json --stack "$STACK" > "$PULUMI_PREVIEW_JSON"
elif [ "${PULUMI_PREVIEW:-}" = "true" ]; then
  pulumi preview --diff --stack "$STACK"
else
  pulumi up --stack "$STACK" ${CI:+--yes --non-interactive}
fi
