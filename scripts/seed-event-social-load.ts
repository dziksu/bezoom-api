import { Client } from 'pg';

const MIN_LIKES = 201;
const MIN_SAVES = 301;
const MIN_COMMENTS = 901;
const MIN_FOLLOWERS = 1001;

type TargetEvent = {
  id: string;
  title: string;
  organizerKeycloakSub: string;
};

type SeedSummary = TargetEvent & {
  likesCount: number;
  savesCount: number;
  commentsCount: number;
  followersCount: number;
};

function databaseUrl() {
  return process.env.DATABASE_URL ?? 'postgresql://bezoom:bezoom_dev@localhost:5432/bezoom';
}

async function findTargetEvent(client: Client): Promise<TargetEvent> {
  const requestedId = process.env.EVENT_ID;
  const result = await client.query<TargetEvent>(
    `
      SELECT
        e.id,
        e.title,
        e.organizer_keycloak_sub AS "organizerKeycloakSub"
      FROM events e
      INNER JOIN profiles p ON p.keycloak_sub = e.organizer_keycloak_sub
      WHERE ($1::uuid IS NULL OR e.id = $1::uuid)
        AND e.status = 'PUBLISHED'
        AND e.verification_status = 'VERIFIED'
        AND e.visibility = 'PUBLIC'
        AND e.media_pipeline_status = 'READY'
        AND e.archived_at IS NULL
        AND e.start_date > now()
        AND p.account_status = 'ACTIVE'
      ORDER BY e.start_date ASC, e.id ASC
      LIMIT 1
    `,
    [requestedId ?? null]
  );

  const event = result.rows[0];
  if (!event) {
    const selector = requestedId ? ` o identyfikatorze ${requestedId}` : '';
    throw new Error(`Nie znaleziono przyszłego, publicznego eventu${selector}.`);
  }

  return event;
}

async function seedLoad(client: Client, event: TargetEvent) {
  // All generated subjects share an event-specific prefix, so running this
  // script again completes the same test fixture instead of creating copies.
  const subjectPrefix = `loadtest:event:${event.id}:`;
  const profileCount = Math.max(MIN_LIKES, MIN_SAVES, MIN_COMMENTS, MIN_FOLLOWERS);

  await client.query('BEGIN');
  try {
    await client.query(
      `
        INSERT INTO profiles (keycloak_sub, first_name, last_name, is_phone_verified, is_private)
        SELECT
          $1 || series::text,
          'Tester',
          lpad(series::text, 4, '0'),
          false,
          false
        FROM generate_series(1, $2) AS series
        ON CONFLICT (keycloak_sub) DO NOTHING
      `,
      [subjectPrefix, profileCount]
    );

    await client.query(
      `
        INSERT INTO event_likes (event_id, keycloak_sub, created_at)
        SELECT
          $1::uuid,
          $2 || series::text,
          now() - ((($3 - series) * interval '1 second'))
        FROM generate_series(1, $3) AS series
        ON CONFLICT (event_id, keycloak_sub) DO NOTHING
      `,
      [event.id, subjectPrefix, MIN_LIKES]
    );

    await client.query(
      `
        INSERT INTO event_saves (event_id, keycloak_sub, saved_at)
        SELECT
          $1::uuid,
          $2 || series::text,
          now() - ((($3 - series) * interval '1 second'))
        FROM generate_series(1, $3) AS series
        ON CONFLICT (event_id, keycloak_sub) DO NOTHING
      `,
      [event.id, subjectPrefix, MIN_SAVES]
    );

    await client.query(
      `
        INSERT INTO event_comments (event_id, author_keycloak_sub, body, created_at, updated_at)
        SELECT
          $1::uuid,
          $2 || series::text,
          'Komentarz testowy #' || series::text || ' — dane do testu cursor pagination.',
          now() - ((($3 - series) * interval '1 minute')),
          now() - ((($3 - series) * interval '1 minute'))
        FROM generate_series(1, $3) AS series
        WHERE NOT EXISTS (
          SELECT 1
          FROM event_comments existing_comment
          WHERE existing_comment.event_id = $1::uuid
            AND existing_comment.author_keycloak_sub = $2 || series::text
            AND existing_comment.body = 'Komentarz testowy #' || series::text || ' — dane do testu cursor pagination.'
        )
      `,
      [event.id, subjectPrefix, MIN_COMMENTS]
    );

    await client.query(
      `
        INSERT INTO creator_follows (follower_keycloak_sub, followee_keycloak_sub, created_at)
        SELECT
          $1 || series::text,
          $2,
          now() - ((($3 - series) * interval '1 second'))
        FROM generate_series(1, $3) AS series
        ON CONFLICT (follower_keycloak_sub, followee_keycloak_sub) DO NOTHING
      `,
      [subjectPrefix, event.organizerKeycloakSub, MIN_FOLLOWERS]
    );

    await client.query(
      `
        UPDATE profiles
        SET
          followers_count = (
            SELECT count(*)::int
            FROM creator_follows
            WHERE followee_keycloak_sub = $1
          ),
          updated_at = now()
        WHERE keycloak_sub = $1
      `,
      [event.organizerKeycloakSub]
    );

    await client.query(
      `
        INSERT INTO event_stats (event_id, likes_count, saves_count, comments_count, attending_count, updated_at)
        VALUES (
          $1::uuid,
          (SELECT count(*)::int FROM event_likes WHERE event_id = $1::uuid),
          (SELECT count(*)::int FROM event_saves WHERE event_id = $1::uuid),
          (SELECT count(*)::int FROM event_comments WHERE event_id = $1::uuid AND deleted_at IS NULL),
          (SELECT count(*)::int FROM event_participants WHERE event_id = $1::uuid AND status = 'CONFIRMED'),
          now()
        )
        ON CONFLICT (event_id) DO UPDATE SET
          likes_count = EXCLUDED.likes_count,
          saves_count = EXCLUDED.saves_count,
          comments_count = EXCLUDED.comments_count,
          attending_count = EXCLUDED.attending_count,
          updated_at = EXCLUDED.updated_at
      `,
      [event.id]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function getSummary(client: Client, event: TargetEvent): Promise<SeedSummary> {
  const result = await client.query<SeedSummary>(
    `
      SELECT
        $1::uuid AS id,
        $2::text AS title,
        $3::text AS "organizerKeycloakSub",
        (SELECT count(*)::int FROM event_likes WHERE event_id = $1::uuid) AS "likesCount",
        (SELECT count(*)::int FROM event_saves WHERE event_id = $1::uuid) AS "savesCount",
        (SELECT count(*)::int FROM event_comments WHERE event_id = $1::uuid AND deleted_at IS NULL) AS "commentsCount",
        (SELECT followers_count FROM profiles WHERE keycloak_sub = $3) AS "followersCount"
    `,
    [event.id, event.title, event.organizerKeycloakSub]
  );

  return result.rows[0]!;
}

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_LOAD_TEST_SEED !== 'true') {
    throw new Error('Skrypt danych testowych jest zablokowany w produkcji.');
  }

  const client = new Client({ connectionString: databaseUrl() });
  await client.connect();

  try {
    const event = await findTargetEvent(client);
    await seedLoad(client, event);
    const summary = await getSummary(client, event);

    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await client.end();
  }
}

void main();
