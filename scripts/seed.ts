import { createHash } from 'node:crypto';
import { Client as MinioClient } from 'minio';
import { Client, type PoolClient, type QueryResult } from 'pg';
import {
  categories,
  cities,
  commentBodies,
  eventCopy,
  firstNames,
  interests,
  lastNames,
  type CityDefinition,
  type EventCategory
} from './seed/catalog';

type ScaleName = 'demo' | 'development' | 'performance';

interface ScaleDefinition {
  profiles: number;
  creators: number;
  events: number;
  likes: number;
  saves: number;
  participants: number;
  comments: number;
  friendships: number;
  notifications: number;
  blocks: number;
  reports: number;
}

interface SeedOptions {
  scale: ScaleName;
  randomSeed: string;
  referenceNow: Date;
  withMedia: boolean;
  dryRun: boolean;
  allowProduction: boolean;
}

interface GeneratedEvent {
  id: string;
  index: number;
  organizerSub: string;
  category: EventCategory;
  city: CityDefinition;
  startDate: Date;
  createdAt: Date;
  publiclyAvailable: boolean;
  popularity: number;
}

type SqlValue = string | number | boolean | Date | string[] | null;

const seedPrefix = 'seed:v1:';
const batchSize = 2_000;
const dayMs = 86_400_000;

const scales: Record<ScaleName, ScaleDefinition> = {
  demo: {
    profiles: 1_000,
    creators: 80,
    events: 1_200,
    likes: 12_000,
    saves: 5_000,
    participants: 7_000,
    comments: 2_000,
    friendships: 3_000,
    notifications: 5_000,
    blocks: 100,
    reports: 50
  },
  development: {
    profiles: 5_000,
    creators: 300,
    events: 8_000,
    likes: 120_000,
    saves: 50_000,
    participants: 80_000,
    comments: 25_000,
    friendships: 35_000,
    notifications: 60_000,
    blocks: 500,
    reports: 250
  },
  performance: {
    profiles: 25_000,
    creators: 1_500,
    events: 40_000,
    likes: 600_000,
    saves: 260_000,
    participants: 380_000,
    comments: 120_000,
    friendships: 200_000,
    notifications: 350_000,
    blocks: 2_000,
    reports: 1_000
  }
};

const categoryColors: Record<EventCategory, [string, string]> = {
  ARTS_AND_CULTURE: ['#7c3aed', '#ec4899'],
  ENTERTAINMENT: ['#f97316', '#ef4444'],
  SPORT_AND_RECREATION: ['#16a34a', '#14b8a6'],
  EDUCATION_AND_DEVELOPMENT: ['#2563eb', '#06b6d4'],
  SOCIAL_MEETUPS: ['#db2777', '#f59e0b'],
  FESTIVALS_AND_FAIRS: ['#9333ea', '#f97316'],
  TRADE_AND_MARKETS: ['#0f766e', '#84cc16'],
  FAMILY_AND_KIDS: ['#0284c7', '#eab308'],
  BUSINESS_AND_CAREER: ['#334155', '#2563eb'],
  COMMUNITY_AND_ACTIVISM: ['#15803d', '#65a30d'],
  MUSIC_AND_NIGHTLIFE: ['#111827', '#8b5cf6'],
  HEALTH_AND_WELLNESS: ['#0d9488', '#22c55e'],
  FOOD_AND_CULINARY: ['#b45309', '#dc2626']
};

function parseOptions(argv: string[]): SeedOptions {
  const valueOf = (name: string): string | undefined => {
    const inline = argv.find((argument) => argument.startsWith(`--${name}=`));
    if (inline) return inline.slice(name.length + 3);
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };

  const scaleValue = valueOf('scale') ?? 'development';
  if (!(scaleValue in scales)) {
    throw new Error(`Nieznana skala "${scaleValue}". Dostępne: ${Object.keys(scales).join(', ')}.`);
  }

  const referenceValue = valueOf('reference-date');
  const referenceNow = referenceValue ? new Date(`${referenceValue}T12:00:00.000Z`) : new Date();
  if (Number.isNaN(referenceNow.getTime())) throw new Error('Niepoprawne --reference-date. Użyj formatu YYYY-MM-DD.');

  return {
    scale: scaleValue as ScaleName,
    randomSeed: valueOf('random-seed') ?? 'bezoom-polska-growth-v1',
    referenceNow,
    withMedia: !argv.includes('--skip-media'),
    dryRun: argv.includes('--dry-run'),
    allowProduction: argv.includes('--allow-production')
  };
}

function databaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const user = process.env.POSTGRES_USER ?? 'bezoom';
  const password = process.env.POSTGRES_PASSWORD ?? 'bezoom_dev';
  const host = process.env.POSTGRES_HOST ?? 'localhost';
  const port = process.env.POSTGRES_PORT ?? '5432';
  const database = process.env.POSTGRES_DB ?? 'bezoom';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`;
}

function uuid(name: string): string {
  const hex = createHash('sha256').update(name).digest('hex').slice(0, 32).split('');
  hex[12] = '4';
  hex[16] = ((Number.parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const value = hex.join('');
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function createRandom(seed: string): () => number {
  let state = 2_166_136_261;
  for (const character of seed) {
    state ^= character.charCodeAt(0);
    state = Math.imul(state, 16_777_619);
  }
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function pick<T>(random: () => number, values: readonly T[]): T {
  return values[Math.floor(random() * values.length)];
}

function weightedPick<T>(random: () => number, values: readonly T[], weight: (value: T) => number): T {
  const total = values.reduce((sum, value) => sum + weight(value), 0);
  let cursor = random() * total;
  for (const value of values) {
    cursor -= weight(value);
    if (cursor <= 0) return value;
  }
  return values[values.length - 1];
}

function normal(random: () => number): number {
  const first = Math.max(random(), Number.EPSILON);
  return Math.sqrt(-2 * Math.log(first)) * Math.cos(2 * Math.PI * random());
}

function profileSub(index: number): string {
  return `${seedPrefix}profile:${index.toString().padStart(6, '0')}`;
}

function daysAgo(reference: Date, days: number): Date {
  return new Date(reference.getTime() - days * dayMs);
}

function randomPastDate(random: () => number, reference: Date, maxDays: number): Date {
  return new Date(reference.getTime() - random() * maxDays * dayMs);
}

function activityDate(random: () => number, reference: Date, createdAt: Date, maxDays: number): Date {
  const candidate = randomPastDate(random, reference, maxDays);
  return new Date(Math.max(candidate.getTime(), createdAt.getTime() + 60_000));
}

function eventDayOffset(random: () => number): number {
  const roll = random();
  if (roll < 0.2) return -1 - Math.floor(random() * 365);
  if (roll < 0.25) return 0;
  if (roll < 0.65) return 1 + Math.floor(random() * 14);
  if (roll < 0.87) return 15 + Math.floor(random() * 46);
  if (roll < 0.95) return 61 + Math.floor(random() * 120);
  return 181 + Math.floor(random() * 185);
}

function eventState(random: () => number): {
  status: string;
  mediaStatus: string | null;
  verification: string;
  archived: boolean;
} {
  const roll = random();
  if (roll < 0.86) return { status: 'PUBLISHED', mediaStatus: 'READY', verification: 'VERIFIED', archived: false };
  if (roll < 0.91) return { status: 'DRAFT', mediaStatus: null, verification: 'UNVERIFIED', archived: false };
  if (roll < 0.94) return { status: 'READY', mediaStatus: 'READY', verification: 'VERIFIED', archived: false };
  if (roll < 0.96) return { status: 'UPLOADED', mediaStatus: 'UPLOADED', verification: 'UNVERIFIED', archived: false };
  if (roll < 0.98) return { status: 'CANCELLED', mediaStatus: 'READY', verification: 'VERIFIED', archived: false };
  if (roll < 0.99) return { status: 'REJECTED', mediaStatus: 'REJECTED', verification: 'REJECTED', archived: false };
  return { status: 'PUBLISHED', mediaStatus: 'READY', verification: 'VERIFIED', archived: true };
}

function price(random: () => number): {
  type: string;
  min: number | null;
  max: number | null;
  notes: string | null;
} {
  const roll = random();
  if (roll < 0.55) return { type: 'FREE', min: null, max: null, notes: 'Wstęp wolny' };
  if (roll < 0.83) {
    const amount = pick(random, [15, 20, 25, 30, 39, 49, 59, 79, 99, 129]);
    return { type: 'FIXED', min: amount, max: amount, notes: null };
  }
  if (roll < 0.95) {
    const minimum = pick(random, [10, 20, 30, 40, 50]);
    return { type: 'RANGE', min: minimum, max: minimum + pick(random, [20, 30, 40, 50]), notes: null };
  }
  return { type: 'DONATION', min: null, max: null, notes: 'Dobrowolna wpłata na miejscu' };
}

function allocateCapped(total: number, weights: number[], cap: number): number[] {
  if (total > weights.length * cap) throw new Error('Skala aktywności przekracza liczbę możliwych unikalnych relacji.');
  const counts = new Array<number>(weights.length).fill(0);
  let remaining = total;

  while (remaining > 0) {
    const active = weights.map((weight, index) => ({ weight, index })).filter(({ index }) => counts[index] < cap);
    const weightSum = active.reduce((sum, item) => sum + item.weight, 0);
    const proposals = active.map((item) => ({
      ...item,
      exact: (remaining * item.weight) / weightSum
    }));
    let assigned = 0;
    for (const proposal of proposals) {
      const addition = Math.min(cap - counts[proposal.index], Math.floor(proposal.exact));
      counts[proposal.index] += addition;
      assigned += addition;
    }
    remaining -= assigned;
    if (remaining === 0) break;

    proposals.sort((left, right) => (right.exact % 1) - (left.exact % 1) || right.weight - left.weight);
    for (const proposal of proposals) {
      if (remaining === 0) break;
      if (counts[proposal.index] >= cap) continue;
      counts[proposal.index] += 1;
      remaining -= 1;
    }
  }
  return counts;
}

function gcd(left: number, right: number): number {
  let a = left;
  let b = right;
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function coprimeStep(candidate: number, size: number): number {
  let step = Math.max(1, candidate % size);
  while (gcd(step, size) !== 1) step += 1;
  return step;
}

function actorIndex(eventIndex: number, relationIndex: number, profileCount: number, salt: number): number {
  const start = (eventIndex * 104_729 + salt * 15_485_863) % profileCount;
  const step = coprimeStep(eventIndex * 2 + salt * 97 + 1, profileCount);
  return (start + relationIndex * step) % profileCount;
}

async function insertRows(
  client: PoolClient | Client,
  table: string,
  columns: string[],
  rows: SqlValue[][]
): Promise<void> {
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const chunk = rows.slice(offset, offset + batchSize);
    const values: SqlValue[] = [];
    const tuples = chunk.map((row) => {
      const placeholders = row.map((value) => {
        values.push(value);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES ${tuples.join(', ')}`, values);
  }
}

async function cleanPreviousSeed(client: Client): Promise<void> {
  await client.query(`
    DELETE FROM moderation_reports
    WHERE reported_by_keycloak_sub LIKE '${seedPrefix}%'
       OR event_id IN (SELECT id FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%');
    DELETE FROM locations
    WHERE event_id IN (SELECT id FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%');
    DELETE FROM event_outbox
    WHERE aggregate_id IN (SELECT id FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%');
    DELETE FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM event_likes WHERE keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM event_saves WHERE keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM event_participants WHERE keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM event_comments WHERE author_keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM notifications WHERE keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM friendships WHERE keycloak_sub_1 LIKE '${seedPrefix}%' OR keycloak_sub_2 LIKE '${seedPrefix}%';
    DELETE FROM user_blocks WHERE blocker_keycloak_sub LIKE '${seedPrefix}%' OR blocked_keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM businesses WHERE keycloak_sub LIKE '${seedPrefix}%';
    DELETE FROM profiles WHERE keycloak_sub LIKE '${seedPrefix}%';
  `);
}

function mediaPublicUrl(): string {
  return (process.env.MINIO_PUBLIC_URL ?? 'http://localhost:9000').replace(/\/$/, '');
}

function coverSvg(category: EventCategory, variant: number): Buffer {
  const [first, second] = categoryColors[category];
  const label = category.replaceAll('_AND_', ' &amp; ').replaceAll('_', ' ');
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${first}"/><stop offset="1" stop-color="${second}"/></linearGradient></defs>
      <rect width="1200" height="675" rx="36" fill="url(#g)"/>
      <circle cx="${180 + variant * 130}" cy="130" r="210" fill="#fff" opacity=".09"/>
      <circle cx="1030" cy="580" r="310" fill="#fff" opacity=".08"/>
      <path d="M0 ${500 - variant * 25} Q300 360 600 510 T1200 430 V675 H0Z" fill="#fff" opacity=".1"/>
      <text x="72" y="485" fill="#fff" font-family="system-ui,sans-serif" font-size="28" font-weight="600" opacity=".82">BEZOOM • POLSKA</text>
      <text x="72" y="550" fill="#fff" font-family="system-ui,sans-serif" font-size="48" font-weight="800">${label}</text>
    </svg>
  `);
}

function avatarSvg(index: number): Buffer {
  const palettes = Object.values(categoryColors);
  const [first, second] = palettes[index % palettes.length];
  return Buffer.from(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${first}"/><stop offset="1" stop-color="${second}"/></linearGradient></defs>
      <rect width="256" height="256" rx="128" fill="url(#a)"/>
      <circle cx="128" cy="100" r="44" fill="#fff" opacity=".9"/>
      <path d="M48 232c8-58 38-86 80-86s72 28 80 86" fill="#fff" opacity=".9"/>
    </svg>
  `);
}

async function uploadSeedMedia(): Promise<void> {
  const endpoint = process.env.MINIO_ENDPOINT ?? 'localhost';
  const port = Number(process.env.MINIO_PORT ?? process.env.MINIO_API_PORT ?? 9000);
  const client = new MinioClient({
    endPoint: endpoint,
    port,
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: process.env.MINIO_ACCESS_KEY ?? process.env.MINIO_ROOT_USER ?? 'minioadmin',
    secretKey: process.env.MINIO_SECRET_KEY ?? process.env.MINIO_ROOT_PASSWORD ?? 'minioadmin_dev'
  });
  const mediaBucket = process.env.MINIO_MEDIA_BUCKET ?? 'media';
  const avatarBucket = process.env.MINIO_AVATAR_BUCKET ?? 'avatars';

  for (const bucket of [mediaBucket, avatarBucket]) {
    if (!(await client.bucketExists(bucket))) await client.makeBucket(bucket, 'us-east-1');
  }
  for (const category of categories) {
    for (let variant = 0; variant < 3; variant += 1) {
      const body = coverSvg(category, variant);
      await client.putObject(
        mediaBucket,
        `seed/v1/covers/${category.toLowerCase()}-${variant}.svg`,
        body,
        body.length,
        {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'public, max-age=31536000, immutable'
        }
      );
    }
  }
  for (let index = 0; index < 32; index += 1) {
    const body = avatarSvg(index);
    await client.putObject(avatarBucket, `seed/v1/avatars/avatar-${index}.svg`, body, body.length, {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=31536000, immutable'
    });
  }
}

async function seedProfiles(client: Client, config: ScaleDefinition, options: SeedOptions): Promise<void> {
  const random = createRandom(`${options.randomSeed}:profiles`);
  const publicUrl = mediaPublicUrl();
  const rows: SqlValue[][] = [];
  for (let index = 0; index < config.profiles; index += 1) {
    const creator = index < config.creators;
    const firstName = pick(random, firstNames);
    const lastName = pick(random, lastNames);
    const username = `${creator ? 'seed_creator' : 'seed_user'}_${index.toString().padStart(5, '0')}`;
    const createdAt = daysAgo(options.referenceNow, Math.floor(1 + random() ** 2 * 540));
    const statusRoll = creator ? 0 : random();
    const accountStatus = statusRoll < 0.98 ? 'ACTIVE' : 'DEACTIVATED';
    const selectedInterests = [...interests].sort(() => random() - 0.5).slice(0, 2 + Math.floor(random() * 4));
    rows.push([
      uuid(`profile:${index}`),
      profileSub(index),
      'personal',
      firstName,
      lastName,
      username,
      `${username}@seed.bezoom.local`,
      creator
        ? `Organizuję ciekawe wydarzenia w okolicy. ${pick(random, eventCopy[pick(random, categories)].details)}.`
        : 'Lubię odkrywać lokalne miejsca i poznawać ludzi.',
      options.withMedia
        ? `${publicUrl}/${process.env.MINIO_AVATAR_BUCKET ?? 'avatars'}/seed/v1/avatars/avatar-${index % 32}.svg`
        : null,
      selectedInterests,
      creator || random() < 0.65,
      creator ? Math.floor(20 + Math.exp(Math.min(7, 2 + normal(random)))) : Math.floor(random() * 25),
      Math.floor(random() * 120),
      random() < 0.08,
      accountStatus,
      accountStatus !== 'ACTIVE',
      createdAt,
      activityDate(random, options.referenceNow, createdAt, 10)
    ]);
  }
  await insertRows(
    client,
    'profiles',
    [
      'id',
      'keycloak_sub',
      'account_type',
      'first_name',
      'last_name',
      'username',
      'email',
      'bio',
      'avatar_url',
      'interests',
      'is_phone_verified',
      'followers_count',
      'following_count',
      'is_private',
      'account_status',
      'is_deactivated',
      'created_at',
      'updated_at'
    ],
    rows
  );
}

async function seedEvents(client: Client, config: ScaleDefinition, options: SeedOptions): Promise<GeneratedEvent[]> {
  const random = createRandom(`${options.randomSeed}:events`);
  const generated: GeneratedEvent[] = [];
  const eventRows: SqlValue[][] = [];
  const locationRows: SqlValue[][] = [];
  const photoRows: SqlValue[][] = [];
  const outboxRows: SqlValue[][] = [];

  for (let index = 0; index < config.events; index += 1) {
    const id = uuid(`event:${index}`);
    const category = weightedPick(random, categories, (value) =>
      value === 'MUSIC_AND_NIGHTLIFE' || value === 'FOOD_AND_CULINARY' ? 1.35 : 1
    );
    const city = weightedPick(random, cities, (value) => value.weight);
    const district = pick(random, city.districts);
    const venue = pick(random, city.venues);
    const copy = eventCopy[category];
    const dayOffset = eventDayOffset(random);
    const startDate = new Date(
      options.referenceNow.getTime() + dayOffset * dayMs + (1 + Math.floor(random() * 17)) * 3_600_000
    );
    const durationHours = pick(random, [1.5, 2, 2.5, 3, 4, 6, 8]);
    const endDate = new Date(startDate.getTime() + durationHours * 3_600_000);
    const state = eventState(random);
    const organizerIndex = index < config.creators ? index : Math.floor(random() ** 2.2 * config.creators);
    const organizerSub = profileSub(organizerIndex);
    const candidateCreatedAt = daysAgo(options.referenceNow, 1 + Math.floor(random() ** 2 * 540));
    const createdAt = new Date(Math.min(candidateCreatedAt.getTime(), startDate.getTime() - 2 * dayMs));
    const pricing = price(random);
    const radiusKm = Math.sqrt(random()) * 9;
    const angle = random() * Math.PI * 2;
    const latitude = city.latitude + (radiusKm * Math.cos(angle)) / 111;
    const longitude = city.longitude + (radiusKm * Math.sin(angle)) / (111 * Math.cos((city.latitude * Math.PI) / 180));
    const archivedAt = state.archived ? activityDate(random, options.referenceNow, createdAt, 90) : null;
    const publiclyAvailable =
      state.status === 'PUBLISHED' && state.mediaStatus === 'READY' && state.verification === 'VERIFIED' && !archivedAt;
    const popularity = Math.max(0.05, Math.exp(normal(random) * 1.15) * (dayOffset >= 0 && dayOffset <= 30 ? 1.4 : 1));
    const title = `${pick(random, copy.nouns)} — ${district}`;
    const mediaKey = `seed/v1/covers/${category.toLowerCase()}-${index % 3}.svg`;

    eventRows.push([
      id,
      title,
      `${title} w ${city.name}. Spotykamy się w miejscu ${venue}. Wydarzenie ${pick(random, copy.details)}. Szczegóły organizacyjne i aktualizacje pojawią się w aplikacji.`,
      category,
      startDate,
      endDate,
      organizerSub,
      options.withMedia ? `${mediaPublicUrl()}/${process.env.MINIO_MEDIA_BUCKET ?? 'media'}/${mediaKey}` : null,
      pricing.type,
      pricing.min,
      pricing.max,
      'PLN',
      pricing.type === 'FREE' || pricing.type === 'DONATION' ? null : `https://tickets.seed.bezoom.local/events/${id}`,
      pricing.notes,
      [
        pick(random, ['parking', 'bike_parking', 'public_transport']),
        pick(random, ['accessible', 'outdoor', 'indoor'])
      ],
      state.status,
      state.mediaStatus,
      state.mediaStatus ? Number((random() * 0.08).toFixed(4)) : null,
      state.mediaStatus ? activityDate(random, options.referenceNow, createdAt, 30) : null,
      'PUBLIC',
      5,
      state.verification,
      state.verification === 'REJECTED' ? 'Treść wymaga poprawy przed ponownym zgłoszeniem.' : null,
      state.verification === 'VERIFIED' ? activityDate(random, options.referenceNow, createdAt, 30) : null,
      archivedAt,
      Math.floor(random() * 5),
      createdAt,
      activityDate(random, options.referenceNow, createdAt, 5)
    ]);
    locationRows.push([
      uuid(`location:${index}`),
      latitude.toFixed(7),
      longitude.toFixed(7),
      `${venue}, ${district}`,
      city.name,
      'PL',
      id
    ]);
    if (options.withMedia) {
      photoRows.push([
        uuid(`photo:${index}`),
        id,
        organizerSub,
        `seed/v1/raw/${id}.svg`,
        mediaKey,
        'READY',
        0,
        'image/svg+xml',
        24_000,
        createdAt,
        createdAt
      ]);
    }
    outboxRows.push([
      uuid(`outbox:event:${index}`),
      id,
      'event.created',
      JSON.stringify({ eventId: id, seeded: true }),
      createdAt,
      createdAt,
      1
    ]);
    generated.push({ id, index, organizerSub, category, city, startDate, createdAt, publiclyAvailable, popularity });
  }

  await insertRows(
    client,
    'events',
    [
      'id',
      'title',
      'description',
      'category',
      'start_date',
      'end_date',
      'organizer_keycloak_sub',
      'image_url',
      'price_type',
      'price_min',
      'price_max',
      'currency',
      'ticket_url',
      'price_notes',
      'amenities',
      'status',
      'media_pipeline_status',
      'moderation_score_max',
      'moderated_at',
      'visibility',
      'radius_km',
      'verification_status',
      'verification_rejection_reason',
      'verified_at',
      'archived_at',
      'version',
      'created_at',
      'updated_at'
    ],
    eventRows
  );
  await insertRows(
    client,
    'locations',
    ['id', 'latitude', 'longitude', 'address', 'city', 'country', 'event_id'],
    locationRows
  );
  if (photoRows.length > 0) {
    await insertRows(
      client,
      'event_photos',
      [
        'id',
        'event_id',
        'owner_keycloak_sub',
        'raw_key',
        'media_key',
        'status',
        'position',
        'mime_type',
        'size_bytes',
        'created_at',
        'updated_at'
      ],
      photoRows
    );
  }
  await insertRows(
    client,
    'event_outbox',
    ['id', 'aggregate_id', 'event_type', 'payload', 'occurred_at', 'processed_at', 'attempts'],
    outboxRows
  );
  return generated;
}

async function seedEngagement(
  client: Client,
  config: ScaleDefinition,
  options: SeedOptions,
  events: GeneratedEvent[]
): Promise<void> {
  const eligible = events.filter((event) => event.publiclyAvailable);
  const weights = eligible.map((event) => event.popularity);
  const cap = config.profiles - 1;
  const likeCounts = allocateCapped(config.likes, weights, cap);
  const saveCounts = allocateCapped(config.saves, weights, cap);
  const participantCounts = allocateCapped(config.participants, weights, cap);
  const commentCounts = allocateCapped(config.comments, weights, Math.min(cap, 500));
  const activeCommentCounts = new Array<number>(eligible.length).fill(0);
  const confirmedCounts = new Array<number>(eligible.length).fill(0);
  const eligiblePositionByEventIndex = new Map(eligible.map((event, position) => [event.index, position]));

  const flushableInsert = async (table: string, columns: string[], rows: SqlValue[][]): Promise<void> => {
    if (rows.length === 0) return;
    await insertRows(client, table, columns, rows);
    rows.length = 0;
  };

  const likeRows: SqlValue[][] = [];
  const saveRows: SqlValue[][] = [];
  const participantRows: SqlValue[][] = [];
  for (let eventPosition = 0; eventPosition < eligible.length; eventPosition += 1) {
    const event = eligible[eventPosition];
    for (let index = 0; index < likeCounts[eventPosition]; index += 1) {
      const actor = actorIndex(event.index, index, config.profiles, 11);
      likeRows.push([
        uuid(`like:${event.index}:${actor}`),
        event.id,
        profileSub(actor),
        activityDate(
          createRandom(`${options.randomSeed}:like-date:${event.index}:${index}`),
          options.referenceNow,
          event.createdAt,
          180
        )
      ]);
      if (likeRows.length >= batchSize)
        await flushableInsert('event_likes', ['id', 'event_id', 'keycloak_sub', 'created_at'], likeRows);
    }
    for (let index = 0; index < saveCounts[eventPosition]; index += 1) {
      const actor = actorIndex(event.index, index, config.profiles, 23);
      saveRows.push([
        uuid(`save:${event.index}:${actor}`),
        event.id,
        profileSub(actor),
        activityDate(
          createRandom(`${options.randomSeed}:save-date:${event.index}:${index}`),
          options.referenceNow,
          event.createdAt,
          120
        )
      ]);
      if (saveRows.length >= batchSize)
        await flushableInsert('event_saves', ['id', 'event_id', 'keycloak_sub', 'saved_at'], saveRows);
    }
    for (let index = 0; index < participantCounts[eventPosition]; index += 1) {
      const actor = actorIndex(event.index, index, config.profiles, 37);
      const status = index % 100 < 72 ? 'CONFIRMED' : index % 100 < 93 ? 'MAYBE' : 'DECLINED';
      if (status === 'CONFIRMED') confirmedCounts[eventPosition] += 1;
      participantRows.push([
        uuid(`participant:${event.index}:${actor}`),
        event.id,
        profileSub(actor),
        status,
        activityDate(
          createRandom(`${options.randomSeed}:participant-date:${event.index}:${index}`),
          options.referenceNow,
          event.createdAt,
          120
        )
      ]);
      if (participantRows.length >= batchSize) {
        await flushableInsert(
          'event_participants',
          ['id', 'event_id', 'keycloak_sub', 'status', 'joined_at'],
          participantRows
        );
      }
    }
  }
  await flushableInsert('event_likes', ['id', 'event_id', 'keycloak_sub', 'created_at'], likeRows);
  await flushableInsert('event_saves', ['id', 'event_id', 'keycloak_sub', 'saved_at'], saveRows);
  await flushableInsert(
    'event_participants',
    ['id', 'event_id', 'keycloak_sub', 'status', 'joined_at'],
    participantRows
  );

  for (const rootsOnly of [true, false]) {
    const commentRows: SqlValue[][] = [];
    for (let eventPosition = 0; eventPosition < eligible.length; eventPosition += 1) {
      const event = eligible[eventPosition];
      const total = commentCounts[eventPosition];
      const roots = Math.ceil(total * 0.75);
      const start = rootsOnly ? 0 : roots;
      const end = rootsOnly ? roots : total;
      for (let index = start; index < end; index += 1) {
        const actor = actorIndex(event.index, index, config.profiles, 53);
        const deleted = index % 50 === 0;
        const edited = !deleted && index % 12 === 0;
        const createdAt = activityDate(
          createRandom(`${options.randomSeed}:comment-date:${event.index}:${index}`),
          options.referenceNow,
          event.createdAt,
          90
        );
        if (!deleted) activeCommentCounts[eventPosition] += 1;
        commentRows.push([
          uuid(`comment:${event.index}:${index}`),
          event.id,
          profileSub(actor),
          rootsOnly ? null : uuid(`comment:${event.index}:${index % roots}`),
          deleted
            ? ''
            : pick(createRandom(`${options.randomSeed}:comment-body:${event.index}:${index}`), commentBodies),
          edited ? new Date(createdAt.getTime() + 20 * 60_000) : null,
          deleted ? new Date(createdAt.getTime() + 30 * 60_000) : null,
          createdAt,
          edited || deleted ? new Date(createdAt.getTime() + 30 * 60_000) : createdAt
        ]);
        if (commentRows.length >= batchSize) {
          await flushableInsert(
            'event_comments',
            [
              'id',
              'event_id',
              'author_keycloak_sub',
              'parent_id',
              'body',
              'edited_at',
              'deleted_at',
              'created_at',
              'updated_at'
            ],
            commentRows
          );
        }
      }
    }
    await flushableInsert(
      'event_comments',
      [
        'id',
        'event_id',
        'author_keycloak_sub',
        'parent_id',
        'body',
        'edited_at',
        'deleted_at',
        'created_at',
        'updated_at'
      ],
      commentRows
    );
  }

  const statsRows: SqlValue[][] = [];
  for (let index = 0; index < events.length; index += 1) {
    const eligibleIndex = eligiblePositionByEventIndex.get(index) ?? -1;
    statsRows.push([
      events[index].id,
      eligibleIndex < 0 ? 0 : likeCounts[eligibleIndex],
      eligibleIndex < 0 ? 0 : saveCounts[eligibleIndex],
      eligibleIndex < 0 ? 0 : confirmedCounts[eligibleIndex],
      eligibleIndex < 0 ? 0 : activeCommentCounts[eligibleIndex],
      options.referenceNow
    ]);
  }
  await insertRows(
    client,
    'event_stats',
    ['event_id', 'likes_count', 'saves_count', 'attending_count', 'comments_count', 'updated_at'],
    statsRows
  );
}

async function seedSocialGraph(
  client: Client,
  config: ScaleDefinition,
  options: SeedOptions,
  events: GeneratedEvent[]
): Promise<void> {
  const random = createRandom(`${options.randomSeed}:social`);
  const friendshipRows: SqlValue[][] = [];
  for (let index = 0; index < config.friendships; index += 1) {
    const first = index % config.profiles;
    const hop = 1 + Math.floor(index / config.profiles);
    const second = (first + hop) % config.profiles;
    const roll = random();
    friendshipRows.push([
      uuid(`friendship:${first}:${second}`),
      profileSub(first),
      profileSub(second),
      roll < 0.82 ? 'ACCEPTED' : roll < 0.97 ? 'PENDING' : 'BLOCKED',
      randomPastDate(random, options.referenceNow, 365)
    ]);
  }
  await insertRows(
    client,
    'friendships',
    ['id', 'keycloak_sub_1', 'keycloak_sub_2', 'status', 'created_at'],
    friendshipRows
  );

  const notificationTypes = [
    'EVENT_INVITATION',
    'FRIEND_REQUEST',
    'EVENT_LIKE',
    'EVENT_COMMENT',
    'EVENT_UPDATE',
    'EVENT_REMINDER',
    'NEW_EVENT_FROM_FOLLOWED',
    'MENTION'
  ];
  const notificationRows: SqlValue[][] = [];
  for (let index = 0; index < config.notifications; index += 1) {
    const userIndex = index % config.profiles;
    const event = events[(index * 97) % events.length];
    const type = pick(random, notificationTypes);
    notificationRows.push([
      uuid(`notification:${index}`),
      profileSub(userIndex),
      type,
      type === 'EVENT_REMINDER'
        ? `Wydarzenie „${event.city.name}” zaczyna się już wkrótce.`
        : 'Masz nową aktywność w BeZoom.',
      event.id,
      random() < 0.68,
      randomPastDate(random, options.referenceNow, 60)
    ]);
  }
  await insertRows(
    client,
    'notifications',
    ['id', 'keycloak_sub', 'type', 'content', 'related_entity_id', 'is_read', 'created_at'],
    notificationRows
  );

  const blockRows: SqlValue[][] = [];
  for (let index = 0; index < config.blocks; index += 1) {
    const blocker = index % config.profiles;
    const blocked = (blocker + 31 + Math.floor(index / config.profiles)) % config.profiles;
    blockRows.push([
      uuid(`block:${blocker}:${blocked}`),
      profileSub(blocker),
      profileSub(blocked),
      randomPastDate(random, options.referenceNow, 180)
    ]);
  }
  await insertRows(
    client,
    'user_blocks',
    ['id', 'blocker_keycloak_sub', 'blocked_keycloak_sub', 'created_at'],
    blockRows
  );

  const eligible = events.filter((event) => event.publiclyAvailable);
  const reportRows: SqlValue[][] = [];
  for (let index = 0; index < config.reports; index += 1) {
    const event = eligible[(index * 43) % eligible.length];
    const reporter = (index * 101 + 17) % config.profiles;
    const roll = random();
    const status = roll < 0.38 ? 'PENDING' : roll < 0.65 ? 'IGNORED' : roll < 0.82 ? 'ESCALATED' : 'RESOLVED';
    const createdAt = randomPastDate(random, options.referenceNow, 120);
    reportRows.push([
      uuid(`report:${index}`),
      profileSub(reporter),
      event.id,
      pick(random, ['SPAM', 'INAPPROPRIATE_CONTENT', 'FRAUD', 'OTHER']),
      'Przykładowe zgłoszenie utworzone przez seed danych.',
      status,
      status === 'RESOLVED' || status === 'IGNORED' ? 'Zgłoszenie sprawdzone w danych testowych.' : null,
      createdAt,
      status === 'RESOLVED' || status === 'IGNORED' ? new Date(createdAt.getTime() + dayMs) : null
    ]);
  }
  await insertRows(
    client,
    'moderation_reports',
    [
      'id',
      'reported_by_keycloak_sub',
      'event_id',
      'reason',
      'description',
      'status',
      'resolution',
      'created_at',
      'resolved_at'
    ],
    reportRows
  );
}

async function verifySeed(client: Client): Promise<Record<string, number>> {
  const result: QueryResult<{ entity: string; count: string }> = await client.query(`
    SELECT 'profiles' AS entity, count(*)::text AS count FROM profiles WHERE keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'events', count(*)::text FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'locations', count(*)::text FROM locations WHERE event_id IN (SELECT id FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%')
    UNION ALL SELECT 'likes', count(*)::text FROM event_likes WHERE keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'saves', count(*)::text FROM event_saves WHERE keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'participants', count(*)::text FROM event_participants WHERE keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'comments', count(*)::text FROM event_comments WHERE author_keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'event_stats', count(*)::text FROM event_stats WHERE event_id IN (SELECT id FROM events WHERE organizer_keycloak_sub LIKE '${seedPrefix}%')
    UNION ALL SELECT 'photos', count(*)::text FROM event_photos WHERE owner_keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'friendships', count(*)::text FROM friendships WHERE keycloak_sub_1 LIKE '${seedPrefix}%'
    UNION ALL SELECT 'notifications', count(*)::text FROM notifications WHERE keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'blocks', count(*)::text FROM user_blocks WHERE blocker_keycloak_sub LIKE '${seedPrefix}%'
    UNION ALL SELECT 'reports', count(*)::text FROM moderation_reports WHERE reported_by_keycloak_sub LIKE '${seedPrefix}%'
  `);
  return Object.fromEntries(result.rows.map((row) => [row.entity, Number(row.count)]));
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const config = scales[options.scale];
  if (process.env.NODE_ENV === 'production' && !options.allowProduction) {
    throw new Error('Seed jest zablokowany dla NODE_ENV=production. Jeśli to świadome, dodaj --allow-production.');
  }

  console.log(`BeZoom seed: ${options.scale}, data odniesienia ${options.referenceNow.toISOString()}`);
  console.table(config);
  console.log(`Tryb: ${options.dryRun ? 'dry-run' : 'zapis'}, media: ${options.withMedia ? 'tak' : 'nie'}`);
  if (options.dryRun) return;

  if (options.withMedia) {
    console.log('Przygotowuję współdzielone grafiki eventów i avatarów w MinIO...');
    await uploadSeedMedia();
  }

  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();
  const startedAt = Date.now();
  let transactionOpen = false;
  try {
    await client.query('SELECT pg_advisory_lock(2026081401)');
    const schemaCheck = await client.query<{ events: string | null; profiles: string | null }>(
      "SELECT to_regclass('public.events')::text AS events, to_regclass('public.profiles')::text AS profiles"
    );
    if (!schemaCheck.rows[0].events || !schemaCheck.rows[0].profiles) {
      throw new Error('Brakuje schematu bazy. Najpierw uruchom pnpm db:migrate.');
    }

    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SET LOCAL synchronous_commit = off');
    console.log('Usuwam poprzedni seed v1...');
    await cleanPreviousSeed(client);
    console.log('Tworzę profile...');
    await seedProfiles(client, config, options);
    console.log('Tworzę eventy, lokalizacje i media...');
    const events = await seedEvents(client, config, options);
    console.log('Tworzę aktywność i read model statystyk...');
    await seedEngagement(client, config, options, events);
    console.log('Tworzę graf społecznościowy, notyfikacje i przypadki moderacyjne...');
    await seedSocialGraph(client, config, options, events);
    await client.query('COMMIT');
    transactionOpen = false;

    console.log('Odświeżam statystyki planera zapytań...');
    await client.query(`
      ANALYZE profiles, events, locations, event_photos, event_likes, event_saves,
        event_participants, event_comments, event_stats, friendships, notifications,
        moderation_reports, user_blocks;
    `);

    const counts = await verifySeed(client);
    console.table(counts);
    console.log(`Seed zakończony w ${((Date.now() - startedAt) / 1_000).toFixed(1)} s.`);
  } catch (error) {
    if (transactionOpen) await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.query('SELECT pg_advisory_unlock(2026081401)').catch(() => undefined);
    await client.end();
  }
}

// Some clients create their socket lazily. Keep the CLI alive until the whole
// promise chain settles instead of letting Node exit between those ticks.
const keepAlive = setInterval(() => undefined, 60_000);
void main()
  .catch((error: unknown) => {
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined;
    const message = error instanceof Error && error.message ? error.message : String(error);
    console.error(`Seed nie powiódł się: ${[code, message].filter(Boolean).join(' — ')}`);
    process.exitCode = 1;
  })
  .finally(() => clearInterval(keepAlive));
