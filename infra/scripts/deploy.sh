#!/usr/bin/env bash
set -euo pipefail

ENV=${1:-dev}
LOCATION="centralus"
RG="rg-cogentrex-$ENV"
ACR="acrcogentrex${ENV}"
KV="kv-cogentrex-$ENV"
PSQL="psql-cogentrex-$ENV"
CAE="cae-cogentrex-$ENV"
API_APP="ca-cogentrex-api-$ENV"
WEB_APP="ca-cogentrex-web-$ENV"

echo "=== Creating Cogentrex $ENV environment ==="

# Resource Group
az group create --name "$RG" --location "$LOCATION" --output none

# ACR
az acr create \
  --name "$ACR" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --sku Basic \
  --admin-enabled true \
  --output none

echo "ACR: $ACR.azurecr.io"

# PostgreSQL
echo "Creating PostgreSQL Flexible Server (this may take a few minutes)..."
az postgres flexible-server create \
  --name "$PSQL" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --admin-user cogentrex \
  --admin-password "$(openssl rand -base64 24)" \
  --database-name cogentrex \
  --public-access 0.0.0.0 \
  --output none

# Key Vault
az keyvault create \
  --name "$KV" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --output none

# Log Analytics
az monitor log-analytics workspace create \
  --name "log-cogentrex-$ENV" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --output none

LAW_ID=$(az monitor log-analytics workspace show -n "log-cogentrex-$ENV" -g "$RG" --query customerId -o tsv)
LAW_KEY=$(az monitor log-analytics workspace get-shared-keys -n "log-cogentrex-$ENV" -g "$RG" --query primarySharedKey -o tsv)

# Container App Environment
az containerapp env create \
  --name "$CAE" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --logs-destination log-analytics \
  --logs-workspace-id "$LAW_ID" \
  --logs-workspace-key "$LAW_KEY" \
  --output none

# Generate placeholder secrets and store in Key Vault
JWT_SECRET=$(openssl rand -base64 32)
ENC_KEY=$(openssl rand -base64 32)

az keyvault secret set --vault-name "$KV" --name jwt-secret --value "$JWT_SECRET" --output none
az keyvault secret set --vault-name "$KV" --name app-encryption-key --value "$ENC_KEY" --output none

echo "=== Infrastructure created ==="
echo "Resource Group: $RG"
echo "ACR: $ACR.azurecr.io"
echo "PostgreSQL: $PSQL.postgres.database.azure.com"
echo "Key Vault: $KV"
echo ""
echo "Next steps:"
echo "1. Add remaining secrets to Key Vault (firecrawl-api-key, default-provider-api-key, linkedin-client-secret)"
echo "2. Run the GitHub Actions workflow or deploy manually"
echo "3. Connect to PostgreSQL and run migrations when ready"
