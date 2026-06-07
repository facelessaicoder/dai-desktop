---
name: cold-start
description: Cold-start datasphere seeding skill. Provisions test accounts with capacity + API keys, creates topic dataspheres, and seeds them with real-time content. Run /cold-start bootstrap to provision accounts, /cold-start seed to seed content daily.
argument-hint: "bootstrap | seed [topic] | status | topics"
---

# Cold Start — Datasphere Seeding

Auto-create and seed production dataspheres with real-time content using bot accounts.

---

## Bot Account API Keys

All keys stored in `~/.dataspheres-prod-keys.env`. All accounts: 10,000 credits, enterprise rate, no expiry.

| User | Email | Dev Key | Prod Key |
|------|-------|---------|----------|
| carlos | carlos.rodriguez@aa.bb | `dsk_17eab7f38dc5059ad47783904a7f9ba3` | `dsk_66e54ac58ca4f939c2da89befc408dff` |
| marcus | marcus.johnson@aa.bb | `dsk_77e0c1d47a81a13a1668115d02852a3d` | `dsk_1b1ab4a8439d05ac828d72e0bfa77ffc` |
| james | james.kim@aa.bb | `dsk_e3a0be10c2911778e6fc655ee4530987` | `dsk_482aa0d32fbbfbfad16362d6d75905b9` |
| ahmed | ahmed.hassan@aa.bb | `dsk_025280643aef1e5c7559684b85445e7d` | `dsk_aaf5b92ce32bc4e389ae7cfddc8b5bfe` |
| sofia | sofia.martinez@aa.bb | `dsk_dd2c2d92e8e15b1a785897880d8ffb93` | `dsk_1c3d8eb6fddc1d86fc31b2c8edb5c7a2` |
| aisha | aisha.williams@aa.bb | `dsk_6d84471fb6934264dae029a83db5e400` | `dsk_435a272d32973c324741243c468fb041` |
| chen | chen.liu@aa.bb | `dsk_8524ffc2b96eb161a5e3e94c055b5be1` | `dsk_1cdd277297fe75d4431573dc39af6149` |
| emma | emma.thompson@aa.bb | `dsk_cf78a8570f55fc7c89dbdce3a1aff099` | `dsk_da0509836da578a90ff0f180db864dab` |
| moderator | moderator.test@aa.bb | `dsk_90fb0d0af7da162279e3ca91f9b851cf` | `dsk_b7799c3ac189e3c623e73066e5b90427` |
| priya | priya.patel@aa.bb | `dsk_b9e26604a0c3b397b2631ad679bd42e8` | `dsk_0024fd53290da966b36f3185ab4cedf5` |
| ryan | ryan.oconnor@aa.bb | `dsk_ec9d2dacbd15299d43b08944c6fbc266` | `dsk_4fa8b137589c7634c07e9f7ca365e07f` |

---

## Step 1 — Bootstrap (one-time setup)

### Prerequisites
Set `BOOTSTRAP_SECRET` env var on Render.com (any strong random string, e.g. `openssl rand -hex 32`).

### Run bootstrap

```bash
# Replace with your actual BOOTSTRAP_SECRET from Render env vars
BOOTSTRAP_SECRET="your-secret-here"

curl -X POST "https://dataspheres.ai/api/v2/admin/bootstrap" \
  -H "X-Bootstrap-Secret: $BOOTSTRAP_SECRET" \
  -H "Content-Type: application/json" \
  | jq '.accounts[] | { email: .email, status: .status, key: .apiKey }'
```

**Output**: For each user, returns `rawKey` (first time only) or `prefix` (if key already exists).

**After running**: Update the API Keys table above with the returned `rawKey` values.
Store them also in `~/.dataspheres-prod-keys.env`:
```bash
cat > ~/.dataspheres-prod-keys.env << 'EOF'
CARLOS_KEY=dsk_...
MARCUS_KEY=dsk_...
JAMES_KEY=dsk_...
AHMED_KEY=dsk_...
SOFIA_KEY=dsk_...
EOF
```

### Verify capacity was granted
```bash
# Check carlos's capacity (login first to get JWT, or use the platform UI)
curl "https://dataspheres.ai/api/v2/capacity" \
  -H "Authorization: Bearer <carlos-jwt>" \
  | jq '.remainingCapacity'
# Should be 10000.00
```

---

## Step 2 — Create Topic Dataspheres

Each bot user owns dataspheres around their assigned topics. Run once per topic.

### Topic assignments

**78 dataspheres** across 11 users. Full matrix with prod IDs, sequencer IDs, and image URLs tracked in:
```
.claude/skills/cold-start/dataspheres.json
```

Each entry has: `uri`, `name`, `owner`, `query`, `status`, `prodId`, `sequencerId`, `imageStatus`, `profileImageUrl`, `bannerUrl`.

### Create a datasphere
```bash
curl -X POST "https://dataspheres.ai/api/v1/dataspheres" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"name": "Topic Name", "uri": "topic-uri", "description": "...", "status": "PUBLIC"}'
```

### Generate images for a datasphere
```bash
# Avatar (512x512 square)
curl -X POST "https://dataspheres.ai/api/v1/dataspheres/$URI/images/profile" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Description of icon style"}'

# Banner (1920x480 wide)
curl -X POST "https://dataspheres.ai/api/v1/dataspheres/$URI/images/banner" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Description of banner scene"}'
```

### Generate images for a user
```bash
# Profile photo (512x512 square)
curl -X POST "https://dataspheres.ai/api/v1/users/profile-image/generate" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Photorealistic portrait description"}'

# Banner (1920x480 wide)
curl -X POST "https://dataspheres.ai/api/v1/users/banner/generate" \
  -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Banner scene description"}'
```

### Get datasphere or user info
```bash
# Full datasphere info (inc. bannerUrl, profileImageUrl)
curl "https://dataspheres.ai/api/v1/dataspheres/$URI" \
  -H "Authorization: Bearer $KEY"

# API key owner's profile
curl "https://dataspheres.ai/api/v1/users/me" \
  -H "Authorization: Bearer $KEY"
```

---

## Step 3 — Daily Seeding

Post AI-driven discussion starters to each datasphere using the discuss API.

### Single seed (one topic)
```bash
source ~/.dataspheres-prod-keys.env

# Seed sports with a web-search backed discussion
curl -X POST "https://dataspheres.ai/api/v1/dataspheres/sports-intelligence/discuss" \
  -H "Authorization: Bearer $MARCUS_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "What are the biggest sports storylines this week? Search for the latest news and give me a breakdown of what the community should be talking about.",
    "tools": ["web_search"]
  }' | jq '{postId: .postId, status: .status}'
```

### Daily seed script (all 8 dataspheres)
```bash
source ~/.dataspheres-prod-keys.env

TOPICS=(
  "$MARCUS_KEY|sports-intelligence|What are the top sports stories this week? Search for breaking news and start a discussion."
  "$MARCUS_KEY|finance-intelligence|What are the key market moves and economic news today? Search and summarize for our community."
  "$JAMES_KEY|tech-intelligence|What are the biggest tech and AI developments this week? Search for the latest and analyze the implications."
  "$JAMES_KEY|gaming-culture|What are the hottest games, esports results, and gaming news right now? Search and break it down."
  "$AHMED_KEY|culture-pulse|What cultural moments, music releases, or film news is trending? Search and kick off a discussion."
  "$AHMED_KEY|food-scene|What are chefs, restaurants, and food trends making waves right now? Search and share."
  "$SOFIA_KEY|health-wellness|What health, fitness, or wellness research or trends are people talking about this week?"
  "$SOFIA_KEY|lifestyle-trends|What travel, fashion, or lifestyle trends are emerging? Search for the latest."
)

for ENTRY in "${TOPICS[@]}"; do
  IFS='|' read -r KEY URI PROMPT <<< "$ENTRY"
  echo "Seeding $URI..."
  curl -s -X POST "https://dataspheres.ai/api/v1/dataspheres/$URI/discuss" \
    -H "Authorization: Bearer $KEY" \
    -H "Content-Type: application/json" \
    -d "{\"message\":$(echo "$PROMPT" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read().strip()))'),\"tools\":[\"web_search\"]}" \
    | jq -r '"  → postId: \(.postId // .error)"'
  sleep 2  # Avoid hammering the API
done

echo "Daily seed complete — $(date)"
```

### Schedule daily with cron (macOS launchd or server cron)
```bash
# Add to crontab for 8am ET daily
crontab -e
# 0 8 * * * /bin/bash /Users/bunnarithbao/ship/dataspheres-ai/scripts/daily-seed.sh >> /tmp/dataspheres-seed.log 2>&1
```

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `401 Invalid API key` | Key was revoked | Re-run bootstrap to get a new key |
| `402 Capacity exhausted` | Bot account ran out of credits | Re-run bootstrap (creates new 10k capacity) |
| `404 Datasphere not found` | URI doesn't exist yet | Run Step 2 first to create datasphere |
| `403 Not a member` | Wrong key for that datasphere | Each user only owns their own dataspheres |
| `503 BOOTSTRAP_SECRET not configured` | Env var missing on Render | Add BOOTSTRAP_SECRET in Render dashboard |

## API key expiry notes

- Bot keys are created with `expiresAt: null` — they **never expire**
- Keys are only deactivated if explicitly deleted via the Developer Portal UI
- If a key stops working, check: `revokedAt` (was it deleted?) vs `402` (capacity exhausted?)
- Capacity periods: 10,000 credits, enterprise rate (35x), no time expiry

## Security

- `BOOTSTRAP_SECRET` must be set in production Render env vars — never commit it to git
- The bootstrap endpoint only creates keys for the hardcoded test email list
- API keys are bcrypt-hashed in the DB — the `rawKey` shown at creation is NEVER stored
- Store raw keys in `~/.dataspheres-prod-keys.env` (gitignored on your machine)
