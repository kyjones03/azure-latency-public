# Azure Latency Public Dashboard (GitHub Pages)

Static GitHub Pages site that publishes an Event Hub snapshot (`data/snapshot.json`) every 5 minutes.

## Why This Shape

GitHub Pages is static hosting only. It cannot hold a runtime managed identity or safely use a service principal secret in browser code.

So we authenticate in **GitHub Actions** and publish data files for the page.

## Auth Recommendation

Use **federated credentials (OIDC)** from GitHub Actions to Azure Entra ID.

- No client secret stored in GitHub
- Short-lived tokens
- Least privilege RBAC on Event Hub receiver

## Required Azure Setup

1. Create Entra app registration for this repo's workflow identity.
2. Add **federated credential** scoped to repo + branch/environment.
3. Assign RBAC on Event Hub namespace:
   - `Azure Event Hubs Data Receiver`
4. Add GitHub repository variables:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_SUBSCRIPTION_ID`
   - `EVENTHUB_NAMESPACE`
   - `EVENTHUB_NAME` (optional; defaults to `probe-events`)
   - `HOPS_EVENTHUB_NAMESPACE` (optional)
   - `HOPS_EVENTHUB_NAME` (optional)

## Local Run

```bash
npm install
az login
export EVENTHUB_NAMESPACE="<namespace>.servicebus.windows.net"
npm run snapshot
# open index.html with a static server
```

## Workflow

`.github/workflows/publish-pages.yml`

- Runs every 5 minutes
- Logs in to Azure with OIDC (`azure/login`)
- Reads recent Event Hub events (`scripts/build-snapshot.mjs`)
- Writes `data/snapshot.json`
- Publishes the repo root to GitHub Pages

## Notes

- Snapshot job reads with a lookback window (`SNAPSHOT_LOOKBACK_MINUTES`, default `90`).
- If you want true real-time streaming, move to a backend/API host (Function App, Container Apps, etc.) and keep Pages as frontend only.
