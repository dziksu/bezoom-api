interface Scenario {
  name: string;
  path: string;
  weight: number;
}

interface Sample {
  scenario: string;
  durationMs: number;
  sizeBytes: number;
  status: number;
}

const baseUrl = process.env.LOAD_TEST_BASE_URL ?? 'http://localhost:4000';
const concurrency = positiveInteger('LOAD_TEST_CONCURRENCY', 10);
const durationSeconds = positiveInteger('LOAD_TEST_DURATION_SECONDS', 30);
const requestTimeoutMs = positiveInteger('LOAD_TEST_REQUEST_TIMEOUT_MS', 10_000);
const maxP95Ms = positiveNumber('LOAD_TEST_MAX_P95_MS', 300);
const maxErrorRate = positiveNumber('LOAD_TEST_MAX_ERROR_RATE', 0.01);

const scenarios: Scenario[] = [
  {
    name: 'map',
    path: '/api/events/map?west=20.7&south=52&east=21.3&north=52.5&zoom=10&week=0',
    weight: 5
  },
  {
    name: 'geo-search',
    path: '/api/events/search?lat=52.2297&lng=21.0122&week=0&limit=20',
    weight: 4
  },
  { name: 'health', path: '/api/health/live', weight: 1 }
];

async function main(): Promise<void> {
  for (const scenario of scenarios) await request(scenario);

  const samples: Sample[] = [];
  const deadline = Date.now() + durationSeconds * 1_000;
  await Promise.all(Array.from({ length: concurrency }, (_, worker) => runWorker(worker, deadline, samples)));

  const successful = samples.filter((sample) => sample.status >= 200 && sample.status < 400);
  const failed = samples.length - successful.length;
  const durations = successful.map((sample) => sample.durationMs).sort((left, right) => left - right);
  const elapsedSeconds = durationSeconds;
  const report = {
    target: baseUrl,
    concurrency,
    durationSeconds,
    requests: samples.length,
    requestsPerSecond: round(samples.length / elapsedSeconds),
    errorRate: round(failed / Math.max(1, samples.length)),
    latencyMs: {
      p50: round(percentile(durations, 0.5)),
      p95: round(percentile(durations, 0.95)),
      p99: round(percentile(durations, 0.99)),
      max: round(durations.at(-1) ?? 0)
    },
    averageResponseBytes: round(
      successful.reduce((sum, sample) => sum + sample.sizeBytes, 0) / Math.max(1, successful.length)
    ),
    byScenario: Object.fromEntries(
      scenarios.map((scenario) => {
        const scenarioSamples = samples.filter((sample) => sample.scenario === scenario.name);
        const scenarioSuccess = scenarioSamples.filter((sample) => sample.status >= 200 && sample.status < 400);
        const scenarioDurations = scenarioSuccess.map((sample) => sample.durationMs).sort((a, b) => a - b);
        return [
          scenario.name,
          {
            requests: scenarioSamples.length,
            p95Ms: round(percentile(scenarioDurations, 0.95)),
            errorRate: round((scenarioSamples.length - scenarioSuccess.length) / Math.max(1, scenarioSamples.length)),
            averageResponseBytes: round(
              scenarioSuccess.reduce((sum, sample) => sum + sample.sizeBytes, 0) / Math.max(1, scenarioSuccess.length)
            )
          }
        ];
      })
    )
  };

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.latencyMs.p95 > maxP95Ms || report.errorRate > maxErrorRate) process.exitCode = 1;
}

async function runWorker(worker: number, deadline: number, samples: Sample[]): Promise<void> {
  let iteration = worker;
  while (Date.now() < deadline) {
    const scenario = weightedScenario(iteration);
    samples.push(await request(scenario));
    iteration += 1;
  }
}

async function request(scenario: Scenario): Promise<Sample> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  const startedAt = performance.now();
  try {
    const response = await fetch(`${baseUrl}${scenario.path}`, {
      headers: { Accept: 'application/json', 'Accept-Encoding': 'gzip, br' },
      signal: controller.signal
    });
    const body = await response.arrayBuffer();
    return {
      scenario: scenario.name,
      durationMs: performance.now() - startedAt,
      sizeBytes: body.byteLength,
      status: response.status
    };
  } catch {
    return { scenario: scenario.name, durationMs: performance.now() - startedAt, sizeBytes: 0, status: 0 };
  } finally {
    clearTimeout(timeout);
  }
}

function weightedScenario(iteration: number): Scenario {
  const totalWeight = scenarios.reduce((sum, scenario) => sum + scenario.weight, 0);
  let slot = iteration % totalWeight;
  for (const scenario of scenarios) {
    if (slot < scenario.weight) return scenario;
    slot -= scenario.weight;
  }
  return scenarios[0];
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * quantile) - 1))];
}

function positiveInteger(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1) throw new Error(`${name}_INVALID`);
  return value;
}

function positiveNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name}_INVALID`);
  return value;
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}

void main();
