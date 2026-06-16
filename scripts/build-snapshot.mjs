import { readFile, writeFile, mkdir } from "node:fs/promises";
import { EventHubConsumerClient, earliestEventPosition } from "@azure/event-hubs";
import { AzureCliCredential } from "@azure/identity";

const namespace = process.env.EVENTHUB_NAMESPACE;
const eventHubName = process.env.EVENTHUB_NAME ?? "probe-events";
const hopsNamespace = process.env.HOPS_EVENTHUB_NAMESPACE ?? namespace;
const hopsEventHubName = process.env.HOPS_EVENTHUB_NAME ?? "probe-hops";
const consumerGroup = process.env.EVENTHUB_CONSUMER_GROUP ?? "$Default";
const lookbackMinutes = Number(process.env.SNAPSHOT_LOOKBACK_MINUTES ?? "90");
const readSeconds = Number(process.env.SNAPSHOT_READ_SECONDS ?? "45");

if (!namespace) {
  console.error("Missing EVENTHUB_NAMESPACE");
  process.exit(1);
}

function pairKey(event) {
  return `${event.sourceRegion}->${event.destinationRegion}`;
}

async function collectLatestEvents({ fqns, hubName, validate }) {
  const credential = new AzureCliCredential();
  const client = new EventHubConsumerClient(consumerGroup, fqns, hubName, credential);
  const latest = new Map();
  const startPosition = Number.isFinite(lookbackMinutes) && lookbackMinutes > 0
    ? { enqueuedOn: new Date(Date.now() - lookbackMinutes * 60 * 1000) }
    : earliestEventPosition;

  const subscription = client.subscribe(
    {
      processEvents: async (events) => {
        for (const eventData of events) {
          const body = eventData.body;
          if (!validate(body)) continue;

          const key = pairKey(body);
          const previous = latest.get(key);
          if (!previous || new Date(body.timestamp) > new Date(previous.timestamp)) {
            latest.set(key, body);
          }
        }
      },
      processError: async (err) => {
        console.error(`[${hubName}] consumer error: ${err.message}`);
      },
    },
    { startPosition }
  );

  await new Promise((resolve) => setTimeout(resolve, readSeconds * 1000));
  await subscription.close();
  await client.close();

  return Array.from(latest.values()).sort((a, b) => {
    if (a.sourceRegion === b.sourceRegion) {
      return a.destinationRegion.localeCompare(b.destinationRegion);
    }
    return a.sourceRegion.localeCompare(b.sourceRegion);
  });
}

function isProbeEvent(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.sourceRegion === "string" &&
    typeof value.destinationRegion === "string" &&
    typeof value.latencyMs === "number" &&
    typeof value.timestamp === "string"
  );
}

function isHopEvent(value) {
  return (
    value &&
    typeof value === "object" &&
    typeof value.sourceRegion === "string" &&
    typeof value.destinationRegion === "string" &&
    typeof value.timestamp === "string" &&
    Array.isArray(value.hops)
  );
}

async function main() {
  const [probeResults, hopResults, regionsRaw] = await Promise.all([
    collectLatestEvents({ fqns: namespace, hubName: eventHubName, validate: isProbeEvent }),
    collectLatestEvents({ fqns: hopsNamespace, hubName: hopsEventHubName, validate: isHopEvent }),
    readFile(new URL("../data/regions.json", import.meta.url), "utf-8"),
  ]);

  const regions = JSON.parse(regionsRaw);
  const sources = regions.map((r) => r.name);
  const matrix = Object.fromEntries(sources.map((src) => [src, {}]));

  for (const event of probeResults) {
    if (!matrix[event.sourceRegion]) matrix[event.sourceRegion] = {};
    matrix[event.sourceRegion][event.destinationRegion] = event;
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    lookbackMinutes,
    probe: {
      count: probeResults.length,
      results: probeResults,
    },
    hops: {
      count: hopResults.length,
      results: hopResults,
    },
    matrix,
  };

  await mkdir(new URL("../data", import.meta.url), { recursive: true });
  await writeFile(
    new URL("../data/snapshot.json", import.meta.url),
    JSON.stringify(payload, null, 2),
    "utf-8"
  );

  console.log(
    `Snapshot written: probe=${probeResults.length} hop=${hopResults.length} lookback=${lookbackMinutes}m`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
