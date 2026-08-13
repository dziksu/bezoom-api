# Local observability

Start the API and the optional monitoring stack:

```bash
docker compose --profile observability up -d --build
```

- API and Swagger: http://localhost:4000/api
- API metrics: http://localhost:4000/api/metrics
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3001 (default: `admin` / `admin`)
- Loki: http://localhost:3100/ready
- Alloy: http://localhost:12345

Prometheus keeps seven days of local metrics. Loki keeps seven days of container logs. Grafana provisions the Prometheus and Loki data sources, the `BeZoom API overview` dashboard, and displays Prometheus alert rules.

The Docker socket is mounted read-only into Alloy solely for local container log discovery. Do not copy that access pattern to a shared production environment without reviewing its security boundary.
