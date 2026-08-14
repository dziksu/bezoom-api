CREATE INDEX IF NOT EXISTS "profiles_active_keycloak_sub_idx"
  ON "profiles" ("keycloak_sub")
  WHERE "account_status" = 'ACTIVE';
