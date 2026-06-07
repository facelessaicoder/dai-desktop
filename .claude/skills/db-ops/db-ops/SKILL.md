---
name: db-ops
description: Database operations reference — local access credentials, safe/banned commands, backup/restore, seed scripts, and query examples. Use when working with the database, running queries, or needing credentials.
---

# Database Operations Reference

## Local Database Credentials

From `docker-compose.yml`:
- **Database:** `dai-db`
- **User:** `user`
- **Password:** `password`
- **Container:** `dataspheres-ai-postgres-1`

## Quick Query Commands

```bash
# Single SQL query
docker exec dataspheres-ai-postgres-1 psql -U user -d dai-db -c "SELECT id, uri FROM \"Datasphere\" LIMIT 5;"

# Interactive psql session
docker exec -it dataspheres-ai-postgres-1 psql -U user -d dai-db

# Count rows
docker exec dataspheres-ai-postgres-1 psql -U user -d dai-db -c "SELECT COUNT(*) FROM \"Task\";"

# Prisma Studio (GUI at http://localhost:5555)
docker exec -it dataspheres-ai-app-1 npx prisma studio
```

**Common Mistakes:**
- Use `user`, not `postgres`
- Use `dai-db`, not `dataspheres`
- Quote PascalCase table names: `\"TableName\"`

## BANNED Commands (NEVER run these)

- `docker-compose down -v` — DELETES ALL DATA PERMANENTLY
- `docker volume rm` — DESTROYS DATABASE VOLUMES
- `npx prisma migrate reset` — USE `npm run db:force-reset` INSTEAD
- `prisma db push` — causes schema drift (8+ production incidents)
- Any command with `-v` or `--volumes` flags

## Safe Commands

```bash
npm run db:backup              # Manual backup
npm run db:migrate:safe        # Migrations with auto-backup
npm run db:protect             # Enable protection
npm run claude:constraints     # Check constraints
npm run claude:check "cmd"     # Check if operation allowed
```

## Safe Container Restart (Preserves Data)

```bash
docker-compose down            # Safe — preserves volumes
docker-compose up --build      # Safe — rebuilds, keeps data
docker-compose restart app     # Restart specific service
```

## Backup & Restore

```bash
# Backup
docker exec dataspheres-ai-postgres-1 pg_dump -U user dai-db > backup_$(date +%Y%m%d).sql

# Restore
docker exec -i dataspheres-ai-postgres-1 psql -U user dai-db < backup_20241206.sql
```

## Seed Scripts

```bash
# Run seed script
docker exec -it dataspheres-ai-app-1 npx prisma db seed

# Reset + seed (ONLY if explicitly requested)
docker exec -it dataspheres-ai-app-1 npx prisma migrate reset --force
```

Default data on first run: "DATASPHERES AI" datasphere (auto-generated ID), admin users via registration.

## Command Execution Policy

**Claude should NEVER execute directly:**
- `git push`, `git pull`, `git commit` — user manages version control
- `docker-compose up/down/build` — user manages Docker
- `npm install` in production
- Any deployment commands
- Direct production database write commands

**Claude CAN execute for diagnostics:**
- `DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate status`
- `DATABASE_URL="$PRODUCTION_DATABASE_URL" npx prisma migrate diff ...`
- NEVER write operations against production

## Environment Variables

```bash
NODE_ENV=production
DATABASE_URL=[PostgreSQL connection]
JWT_SECRET=[32+ characters]
ELEVENLABS_API_KEY=[API key]
OPENAI_API_KEY=[API key]
PRODUCTION_DATABASE_URL=[READ ONLY]
```

Never commit production credentials to git. Use environment variables only.

## Test Credentials

All test users use password: `@bcd.1234$`

```
marcus.johnson@aa.bb    carlos.rodriguez@aa.bb    james.kim@aa.bb
ahmed.hassan@aa.bb      ryan.oconnor@aa.bb        aisha.williams@aa.bb
sofia.martinez@aa.bb    priya.patel@aa.bb         chen.liu@aa.bb
emma.thompson@aa.bb
```

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"carlos.rodriguez@aa.bb","password":"@bcd.1234$"}'
```
