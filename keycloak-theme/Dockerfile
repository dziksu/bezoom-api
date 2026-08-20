FROM node:22-bookworm-slim AS theme-builder

ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH

RUN corepack enable \
    && corepack prepare pnpm@10.29.2 --activate \
    && apt-get update \
    && apt-get install --no-install-recommends -y maven openjdk-17-jdk-headless \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /theme
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build-keycloak-theme

FROM keycloak/keycloak:26.7.1 AS keycloak-builder

ENV KC_DB=postgres
COPY --from=theme-builder /theme/dist_keycloak/bezoom-keycloak-theme.jar /opt/keycloak/providers/bezoom-keycloak-theme.jar
RUN /opt/keycloak/bin/kc.sh build

FROM keycloak/keycloak:26.7.1

COPY --from=keycloak-builder /opt/keycloak/ /opt/keycloak/
