# Container deployment

[简体中文](README.zh-CN.md) · [Build guide](../docs/BUILDING.md) · [Nginx](../nginx/README.md)

## Deployment variants

| File | Purpose |
| --- | --- |
| `docker-compose.all-in-one.yml` | Build Service, Web and prepared Bot in one container |
| `docker-compose.yml` | Build separate Service and Web containers |
| `docker-compose.bot-api.yml` | Optional FastAPI Bot ingress overlay |
| `docker-compose.release.yml` | Deploy existing registry images with an explicit release tag |
| Root `docker-compose.yml` | Separate registry-image example; not a current-source build |

## Source build

Docker with Compose v2 and access to build dependencies are required. From the repository root:

```sh
docker compose -f docker/docker-compose.all-in-one.yml config --quiet
docker compose -f docker/docker-compose.all-in-one.yml up --build -d
```

Open `http://localhost:12000` and verify the management/login page. Native Bot dependencies must match the target OS, architecture and Node ABI; source preparation validates the installed SQLite addon.

## Persistence and encryption

The named `boost-data` volume owns `/data`. Preserve it across updates. Split services share the database and internal credential volume; consistent key provisioning is also required when SQLCipher is enabled.

For headless encryption, mount a private key file read-only and set `BOOST_DB_KEY_FILE` to its container path in every process that opens the main database. Do not put a real key into Compose, an image layer or Git. Existing plaintext conversion requires an exclusive maintenance startup; stop other database users first. A persistent data volume is not a backup.

## Networking and lifecycle

Containers listen explicitly on their internal interfaces; published host ports and Nginx define external exposure. Review 12000/12580 publishing separately. Use service DNS inside a Compose network, not another container's loopback.

Container restart policies own container recovery. The native launcher supervises only its children; avoid adding unrelated nested supervisors. Computer-control tools require a usable graphical environment and applicable permissions.

## Acceptance

Validate Compose syntax, image builds, persistent restart, key availability, login/roles, model JSON/SSE, disconnect cleanup and overload. Test Nginx/TLS in the actual deployment. A Windows-host syntax check alone does not certify Linux images or external providers.
