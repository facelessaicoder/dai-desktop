---
name: schema-drift
description: Check for schema drift between schema.prisma, local DB migrations, and production DB. Run this after any schema change, before pushing, or when the user says "check schema drift" or "schema drift check". Also use when login fails with Prisma column errors or after pulling new code that may have new migrations.
disable-model-invocation: true
---

Run a full schema drift check for the dataspheres-ai project.

## CRITICAL RULES (repeat before every migration operation)

- **NEVER `prisma db push`** — always `migrate deploy`. The dev Dockerfile.dev now uses `migrate deploy`. Do NOT revert this.
- **`_prisma_migrations` table must exist** — if it doesn't, the DB was never properly migrated (see Baseline Recovery below)
- **After ANY migration**: run `docker compose exec app npx prisma generate && docker compose restart app` — the running container has a stale Prisma client otherwise
- **Shadow DB workaround**: `migrate dev` WILL fail on this project. Always use `--create-only` then `migrate deploy`

## Steps

Run all three checks in order. Report results clearly. Fail loudly if drift is found.

### 1. Validate schema syntax
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && npx prisma validate
```

### 2. Migration status (checks _prisma_migrations table)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && DATABASE_URL="postgresql://user:password@localhost:5432/dai-db" npx prisma migrate status
```

### 3. Local DB drift check (schema vs migrations diff)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && npm run schema:drift
```

### 4. Production drift check (if user requests or before a push)
```bash
cd /Users/bunnarithbao/ship/dataspheres-ai && npm run db:prod-drift
```

## Applying Pending Migrations (standard flow)

```bash
# 1. Create migration (--create-only avoids shadow DB failure)
DATABASE_URL="postgresql://user:password@localhost:5432/dai-db" npx prisma migrate dev --name NAME --create-only

# 2. Deploy
DATABASE_URL="postgresql://user:password@localhost:5432/dai-db" npx prisma migrate deploy

# 3. Regenerate client on host AND inside Docker, restart app
npx prisma generate
docker compose exec app npx prisma generate
docker compose restart app
```

## Baseline Recovery (when _prisma_migrations table is missing)

**Symptom**: Login returns 500 with "column X does not exist" — Prisma client expects columns the DB doesn't have.

**Check**:
```bash
docker compose exec postgres psql -U user -d dai-db -c "SELECT COUNT(*) FROM _prisma_migrations;"
# If: "relation _prisma_migrations does not exist" → baseline needed
```

**Fix**:
```bash
# 1. Check migrate status to find pending migrations
DATABASE_URL="postgresql://user:password@localhost:5432/dai-db" npx prisma migrate status

# 2. For each ALREADY-APPLIED migration (all except the "pending" ones), mark as applied:
DATABASE_URL="postgresql://user:password@localhost:5432/dai-db" npx prisma migrate resolve --applied <migration_name>
# Repeat for every applied migration (can script with a for loop)

# 3. Deploy the remaining pending migrations
DATABASE_URL="postgresql://user:password@localhost:5432/dai-db" npx prisma migrate deploy

# 4. Regenerate + restart
docker compose exec app npx prisma generate
docker compose restart app
```

**Root cause prevention**: The Dockerfile.dev now uses `migrate deploy` instead of `db push`. If `db push` ever reappears in `Dockerfile.dev`, revert it immediately.

## Reporting

- ✅ No drift found → state clearly
- ❌ Pending migrations → deploy them (see above) then regenerate+restart
- ❌ `_prisma_migrations` missing → run Baseline Recovery above
