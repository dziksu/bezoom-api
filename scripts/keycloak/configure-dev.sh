#!/usr/bin/env bash
set -euo pipefail

KCADM=/opt/keycloak/bin/kcadm.sh
SERVER=http://keycloak:8080
REALM=bezoom
LIFECYCLE_CLIENT=bezoom-account-lifecycle
WEB_CLIENT=bezoom-web
USER_PROFILE=/opt/bezoom/user-profile.json

"$KCADM" config credentials \
  --server "$SERVER" \
  --realm master \
  --user "$KEYCLOAK_ADMIN" \
  --password "$KEYCLOAK_ADMIN_PASSWORD"

"$KCADM" update "realms/$REALM" \
  -s verifyEmail=true \
  -s loginTheme=bezoom \
  -s internationalizationEnabled=true \
  -s defaultLocale=pl \
  -s 'supportedLocales=["pl","en"]' \
  -s 'passwordPolicy=length(12) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1)' \
  -s 'smtpServer={"host":"mailpit","port":"1025","from":"noreply@bezoom.local","fromDisplayName":"Bezoom Dev","auth":"false","ssl":"false","starttls":"false"}'

"$KCADM" update users/profile -r "$REALM" -f "$USER_PROFILE"

password_execution_id=''
password_config_id=''
while IFS=, read -r execution_id provider_id config_id; do
  if [[ "$provider_id" == 'registration-password-action' ]]; then
    password_execution_id="$execution_id"
    password_config_id="$config_id"
    break
  fi
done < <("$KCADM" get authentication/flows/registration/executions \
  -r "$REALM" \
  --fields id,providerId,authenticationConfig \
  --format csv \
  --noquotes)

if [[ -z "$password_execution_id" ]]; then
  echo 'Registration password validation execution not found' >&2
  exit 1
fi

if [[ -z "$password_config_id" || "$password_config_id" == "$password_execution_id" ]]; then
  "$KCADM" create "authentication/executions/$password_execution_id/config" \
    -r "$REALM" \
    -s alias=bezoom-registration-password \
    -s 'config={"always_set_password_on_register_form":"true"}'
else
  "$KCADM" update "authentication/config/$password_config_id" \
    -r "$REALM" \
    -s alias=bezoom-registration-password \
    -s 'config={"always_set_password_on_register_form":"true"}'
fi

google_client_id="${KEYCLOAK_GOOGLE_CLIENT_ID:-}"
google_client_secret="${KEYCLOAK_GOOGLE_CLIENT_SECRET:-}"

if [[ -n "$google_client_id" || -n "$google_client_secret" ]]; then
  if [[ -z "$google_client_id" || -z "$google_client_secret" ]]; then
    echo 'Both KEYCLOAK_GOOGLE_CLIENT_ID and KEYCLOAK_GOOGLE_CLIENT_SECRET are required' >&2
    exit 1
  fi

  google_alias=''
  while IFS= read -r provider_alias; do
    if [[ "$provider_alias" == 'google' ]]; then
      google_alias="$provider_alias"
      break
    fi
  done < <("$KCADM" get identity-provider/instances \
    -r "$REALM" \
    --fields alias \
    --format csv \
    --noquotes)

  if [[ -z "$google_alias" ]]; then
    "$KCADM" create identity-provider/instances \
      -r "$REALM" \
      -s alias=google \
      -s providerId=google \
      -s enabled=true \
      -s trustEmail=true \
      -s storeToken=false \
      -s "config.clientId=$google_client_id" \
      -s "config.clientSecret=$google_client_secret" \
      -s 'config.defaultScope=openid profile email'
  else
    "$KCADM" update identity-provider/instances/google \
      -r "$REALM" \
      -s enabled=true \
      -s trustEmail=true \
      -s storeToken=false \
      -s "config.clientId=$google_client_id" \
      -s "config.clientSecret=$google_client_secret" \
      -s 'config.defaultScope=openid profile email'
  fi
else
  echo 'Google identity provider skipped: OAuth credentials are not configured'
fi

"$KCADM" update authentication/required-actions/UPDATE_EMAIL -r "$REALM" -s enabled=true
"$KCADM" update authentication/required-actions/delete_account -r "$REALM" -s enabled=false

web_client_id="$($KCADM get clients -r "$REALM" -q "clientId=$WEB_CLIENT" --fields id --format csv --noquotes)"
if [[ -n "$web_client_id" ]]; then
  "$KCADM" update "clients/$web_client_id" -r "$REALM" \
    -s 'rootUrl=http://localhost:3000' \
    -s 'baseUrl=http://localhost:3000'
fi

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
