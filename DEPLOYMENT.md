# Deployment Guide

## Overview

Cogentrex deploys to **Azure Container Apps** with the following resource topology:

- **Resource Group**: `rg-cogentrex-<env>`
- **Azure Container Registry (ACR)**: `acrcogentrex<env>`
- **PostgreSQL Flexible Server**: `psql-cogentrex-<env>` (B1ms for DEV)
- **Key Vault**: `kv-cogentrex-<env>`
- **Log Analytics**: `log-cogentrex-<env>`
- **Container App Environment**: `cae-cogentrex-<env>`
- **API Container App**: `ca-cogentrex-api-<env>`
- **Web Container App**: `ca-cogentrex-web-<env>`
- **Scrapling sidecar Container App**: `ca-cogentrex-scrapling-<env>` for research fetch/extraction

Current DEV public endpoints:

- Web custom domain: `https://cogentrex.com`
- API custom domain: `https://api.cogentrex.com`
- Web fallback URL: `https://ca-cogentrex-web-dev.blacksmoke-54283d14.centralus.azurecontainerapps.io`

## Prerequisites

- Azure CLI (`az`) installed and logged in
- `az extension add --upgrade --name containerapp`
- GitHub repository with `AZURE_CREDENTIALS` secret (service principal JSON)
- Domain registered (optional; `.azurecontainerapps.io` URL works for DEV)

## DEV Environment Setup

### 1. Create Azure Resources

Run the helper script:

```bash
chmod +x infra/scripts/deploy.sh
./infra/scripts/deploy.sh dev
```

Or run step-by-step:

```bash
ENV=dev
LOCATION=centralus
RG=rg-cogentrex-$ENV
ACR=acrcogentrexdev
KV=kv-cogentrex-$ENV
PSQL=psql-cogentrex-$ENV
CAE=cae-cogentrex-$ENV
API_APP=ca-cogentrex-api-$ENV
WEB_APP=ca-cogentrex-web-$ENV
SCRAPLING_APP=ca-cogentrex-scrapling-$ENV

# Resource Group
az group create --name $RG --location $LOCATION

# ACR
az acr create --name $ACR --resource-group $RG --sku Basic --admin-enabled true

# PostgreSQL
az postgres flexible-server create \
  --name $PSQL \
  --resource-group $RG \
  --location $LOCATION \
  --tier Burstable \
  --sku-name Standard_B1ms \
  --storage-size 32 \
  --version 16 \
  --admin-user cogentrex \
  --admin-password '<strong-password>' \
  --database-name cogentrex \
  --public-access 0.0.0.0

# Key Vault
az keyvault create --name $KV --resource-group $RG --location $LOCATION

# Log Analytics
az monitor log-analytics workspace create \
  --name log-cogentrex-$ENV \
  --resource-group $RG \
  --location $LOCATION

# Container App Environment
az containerapp env create \
  --name $CAE \
  --resource-group $RG \
  --location $LOCATION \
  --logs-destination log-analytics \
  --logs-workspace-id $(az monitor log-analytics workspace show -n log-cogentrex-$ENV -g $RG --query customerId -o tsv) \
  --logs-workspace-key $(az monitor log-analytics workspace get-shared-keys -n log-cogentrex-$ENV -g $RG --query primarySharedKey -o tsv)
```

### 2. Store Secrets in Key Vault

```bash
az keyvault secret set --vault-name $KV --name jwt-secret --value "<openssl-generated>"
az keyvault secret set --vault-name $KV --name app-encryption-key --value "<openssl-generated>"
az keyvault secret set --vault-name $KV --name firecrawl-api-key --value "<firecrawl-api-key>"
az keyvault secret set --vault-name $KV --name default-provider-base-url --value "https://..."
az keyvault secret set --vault-name $KV --name default-provider-api-key --value "..."
az keyvault secret set --vault-name $KV --name default-provider-model --value "gpt-5.5"
az keyvault secret set --vault-name $KV --name linkedin-client-secret --value "..."
```

### 3. Configure GitHub Actions

Add the following secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AZURE_CREDENTIALS` | Service principal JSON with Contributor access to the DEV resource group |
| `ACR_USERNAME` | ACR admin username |
| `ACR_PASSWORD` | ACR admin password |
| `REGISTRY_LOGIN_SERVER` | e.g., `acrcogentrexdev.azurecr.io` |
| `BRAVE_SEARCH_API_KEY` | Preferred search adapter key for Deep Research |
| `FIRECRAWL_API_KEY` | Optional fallback search/fetch key |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |

The workflows are in `.github/workflows/`:

- `ci.yml` runs on PRs to `dev`/`main`.
- `deploy-dev.yml` runs on pushes to `dev`, builds API/web/Scrapling images, pushes to ACR, and updates Azure Container Apps.

Workflow actions should stay on Node 24-compatible versions to avoid GitHub Actions runtime deprecation warnings.

### 4. First Deploy

Push to the `dev` branch:

```bash
git checkout -b dev
git push -u origin dev
```

GitHub Actions will build Docker images, push to ACR, and deploy to Azure Container Apps. The web image receives `NEXT_PUBLIC_API_BASE_URL` at build time; setting it only as a Container App runtime env var is too late for client bundles.

After deployment, verify:

```bash
curl -fsS https://api.cogentrex.com/health
curl -I -fsS https://cogentrex.com
```

For authenticated/admin routes, verify with a real browser session.

## Environment Variables (Container Apps)

| Variable | Source | Description |
|----------|--------|-------------|
| `DATABASE_URL` | Key Vault reference | PostgreSQL connection string for the active environment |
| `JWT_SECRET` | Key Vault reference | Signing secret |
| `APP_ENCRYPTION_KEY` | Key Vault reference | AES-256 key for provider API keys |
| `BRAVE_SEARCH_API_KEY` | Key Vault reference | Preferred web search API key |
| `SCRAPLING_BASE_URL` | plain env / internal URL | Preferred web fetch/extract sidecar URL |
| `WEB_SEARCH_ADAPTER` | plain env | `brave`, `scrapling`, `firecrawl`, or `fake` |
| `WEB_FETCH_ADAPTER` | plain env | `scrapling`, `firecrawl`, `simple`, or `fake` |
| `FIRECRAWL_API_KEY` | Key Vault reference | Optional fallback search/fetch API key |
| `DEFAULT_PROVIDER_BASE_URL` | Key Vault reference | Foundry/OpenAI base URL |
| `DEFAULT_PROVIDER_API_KEY` | Key Vault reference | Default provider API key |
| `DEFAULT_PROVIDER_MODEL` | Key Vault reference | Default model name |
| `LINKEDIN_CLIENT_ID` | plain env | LinkedIn OAuth client ID |
| `LINKEDIN_CLIENT_SECRET` | Key Vault reference | LinkedIn app secret |
| `API_PUBLIC_BASE_URL` | plain env | Public API URL for OAuth callbacks, e.g. `https://api.cogentrex.com` |
| `WEB_ORIGIN` | plain env | Comma-separated frontend origins for CORS |
| `NEXT_PUBLIC_API_BASE_URL` | web build arg | Public API URL baked into the web client bundle |

## Custom domains and OAuth callbacks

DEV custom domains:

- Web: `https://cogentrex.com`
- API: `https://api.cogentrex.com`

OAuth callback URLs must match the external API domain, not the internal Container App host. LinkedIn should include:

```text
https://api.cogentrex.com/api/linkedin/callback
```

If a custom domain fails but the Container App fallback works, inspect DNS, Container App custom-domain binding, and managed certificate status before changing app code.

## Scaling

For DEV, containers currently use `minReplicas: 1` for API and web to avoid cold-start login behavior. Earlier scale-to-zero settings caused transient `502`/`503` responses during API warmup, which made the frontend appear logged out after idle periods.

For PROD, increase to `minReplicas: 1` and `maxReplicas: 3` and use a larger PostgreSQL SKU.

## Docker and platform gotchas

- Apple Silicon local builds for Azure must use `linux/amd64` images when building/pushing manually.
- Next.js standalone output must run `apps/web/.next/standalone/apps/web/server.js`; `next start` is not valid for standalone containers.
- Web Container App ingress should target port `3000`, not `80`.
- Keep startup DB schema compatible with both SQLite and PostgreSQL; avoid SQLite-only SQL in shared startup paths.

## Rollback

Re-run the failed workflow or manually update the Container App revision:

```bash
az containerapp revision list --name $API_APP --resource-group $RG
az containerapp update --name $API_APP --resource-group $RG --revision-suffix <previous>
```

## Logs

```bash
# Live API logs
az containerapp logs show --name $API_APP --resource-group $RG --follow

# Live web logs
az containerapp logs show --name $WEB_APP --resource-group $RG --follow
```
