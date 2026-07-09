-- Run once when the Postgres container starts for the first time.
-- POSTGRES_DB (bezoom) is created automatically by the Postgres image;
-- this script adds any additional databases that other services need.

CREATE DATABASE keycloak;
