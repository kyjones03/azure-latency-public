# Azure Region Latency Matrix

A public dashboard showing **live TCP round-trip times between Azure U.S. regions** — measured from real Azure infrastructure, refreshed every 30 minutes.

> **Baseline reference:** [Azure network latency tables](https://learn.microsoft.com/en-us/azure/networking/azure-network-latency) — Microsoft's published P50 values for comparison.

---

## What You're Looking At

The matrix shows how long it takes for a TCP connection to travel from one Azure region to another, measured over Microsoft's own backbone network. Each cell is the **median RTT from 15 samples** taken by a probe running inside Azure.

### Color bands

| Color | TCP RTT |
|-------|---------|
| 🟩 Green | < 30 ms |
| 🟨 Yellow | 30 – 79 ms |
| 🟥 Red | ≥ 80 ms |

Hover over a cell to see the raw measurement and timestamp.

---

## How It Works

Probe workers are deployed as Azure Function Apps — one per U.S. region. Every 5 minutes, each probe connects to a region-pinned target in all other regions, runs 15 TCP samples, and publishes the results to Azure Event Hubs.

A GitHub Actions workflow picks that up every 30 minutes, reads the most recent results for each region pair, and publishes them as a static data file. The page reads that file on load.

```
Azure Function Apps (9 regions)
    │  measure TCP RTT every 5 min
    ▼
Azure Event Hubs
    │  GitHub Actions reads via OIDC (every 30 min)
    ▼
data/snapshot.json
    │  served as static file
    ▼
GitHub Pages (this site)
```

### Probe details

- **Source regions:** East US, East US 2, Central US, North Central US, South Central US, West Central US, West US, West US 2, West US 3
- **Samples per pair:** 15, aggregated to median (P50)
- **Metrics captured:** TCP RTT, DNS, TLS, TTFB, and full HTTP timings
- **Target hosts:** region-pinned Azure Blob Storage endpoints accessed over HTTPS within Azure's network

---

## Keeping the Data Fresh

The page data is static — it does not stream live. A GitHub Actions workflow re-publishes it every 30 minutes from the latest Event Hub snapshot.

If you're seeing stale or empty data, the most likely cause is the probe pipeline being paused or the snapshot workflow not running. Check the [Actions tab](../../actions) for recent workflow runs.

---

## Source

Probe infrastructure and dashboard code live in the private `azure-latency` repository. This public repo contains only the static site and the Actions workflow to populate it.
