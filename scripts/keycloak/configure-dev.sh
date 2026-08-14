#!/usr/bin/env bash
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
SERVER=http://keycloak:8080
REALM=bezoom
LIFECYCLE_CLIENT=bezoom-account-lifecycle

"$KCADM" config credentials \
  --server "$SERVER" \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

"$KCADM" update "realms/$REALM" \
  -s verifyEmail=true \
  -s 'passwordPolicy=length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)' \
  -s 'smtpServer={"host":"mailpit","port":"1025","from":"noreply@bezoom.local","fromDisplayName":"Bezoom Dev","auth":"false","ssl":"false","starttls":"false"}'

"$KCADM" update authentication/required-actions/UPDATE_EMAIL -r "$REALM" -s enabled=true
"$KCADM" update authentication/required-actions/delete_account -r "$REALM" -s enabled=false

client_id="$($KCADM get clients -r "$REALM" -q "clientId=$LIFECYCLE_CLIENT" --fields id --format csv --noquotes)"
if [[ -z "$client_id" ]]; then
  "$KCADM" create clients -r "$REALM" \
    -s "clientId=$LIFECYCLE_CLIENT" \
    -s enabled=true \
    -s publicClient=false \
    -s serviceAccountsEnabled=true \
    -s standardFlowEnabled=false \
    -s directAccessGrantsEnabled=false \
    -s "secret=$KEYCLOAK_ACCOUNT_MANAGEMENT_CLIENT_SECRET"
  client_id="$($KCADM get clients -r "$REALM" -q "clientId=$LIFECYCLE_CLIENT" --fields id --format csv --noquotes)"
else
  "$KCADM" update "clients/$client_id" -r "$REALM" \
    -s enabled=true \
    -s serviceAccountsEnabled=true \
    -s "secret=$KEYCLOAK_ACCOUNT_MANAGEMENT_CLIENT_SECRET"
fi

service_user="$($KCADM get "clients/$client_id/service-account-user" -r "$REALM" --fields username --format csv --noquotes)"
"$KCADM" add-roles -r "$REALM" \
  --uusername "$service_user" \
  --cclientid realm-management \
  --rolename manage-users \
  --rolename view-users

echo 'Keycloak development realm configured'
