---
name: tunnel
description: Manage the Cloudflare tunnel (dev-local) for remote access to dev.dataspheres.ai, comfy.dataspheres.ai, and ssh.dataspheres.ai. Start, stop, check status, and diagnose connectivity.
user_invocable: true
---

# Cloudflare Tunnel Management

## Architecture

```
[Remote Device]
  └── https://dev.dataspheres.ai    → cloudflared → localhost:5173 (Vite)
  └── https://comfy.dataspheres.ai  → cloudflared → 127.0.0.1:8188 (ComfyUI)
  └── ssh ssh.dataspheres.ai        → cloudflared → 172.25.172.65:2222 (WSL2 SSH)
```

- **Tunnel name:** `dev-local`
- **Tunnel ID:** `8e71f484-9ad9-4644-bfd3-80e083d7a548`
- **Binary:** `/c/Program Files (x86)/cloudflared/cloudflared.exe`
- **Config:** `C:\Users\facel\.cloudflared\config.yml`
- **Credentials:** `C:\Users\facel\.cloudflared\8e71f484-9ad9-4644-bfd3-80e083d7a548.json`

## Commands

When the user runs `/tunnel` with no arguments or `/tunnel status`, run the **Status Check**.

### Status Check

Run ALL of these in parallel and report a table:

```bash
# 1. Local services
curl -s -o /dev/null -w "%{http_code}" http://localhost:5173
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8188

# 2. Tunnel endpoints
curl -s -o /dev/null -w "%{http_code}" https://dev.dataspheres.ai
curl -s -o /dev/null -w "%{http_code}" https://comfy.dataspheres.ai
curl -s -o /dev/null -w "%{http_code}" -I https://ssh.dataspheres.ai

# 3. cloudflared process
ps aux | grep cloudflared | grep -v grep
```

Report as:

| Service | URL | Status |
|---------|-----|--------|
| Vite Dev | localhost:5173 | UP/DOWN |
| Express API | localhost:3000 | UP/DOWN |
| ComfyUI | 127.0.0.1:8188 | UP/DOWN |
| Dev Tunnel | dev.dataspheres.ai | UP/DOWN |
| ComfyUI Tunnel | comfy.dataspheres.ai | UP/DOWN |
| SSH Tunnel | ssh.dataspheres.ai | UP/DOWN |
| cloudflared | process | RUNNING/STOPPED |

### Start Tunnel (`/tunnel start`)

```bash
"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel run dev-local > /dev/null 2>&1 &
```

Wait 5 seconds, then run the Status Check to confirm.

### Stop Tunnel (`/tunnel stop`)

```bash
pkill -f "cloudflared.*tunnel.*run"
```

Wait 2 seconds, then run the Status Check to confirm.

### Restart Tunnel (`/tunnel restart`)

Stop then start. Report status after.

### HMR Test (`/tunnel hmr`)

Test that hot-reload works through the tunnel:

1. Run status check first — abort if tunnel is down
2. Make a trivial whitespace-only edit to `src/client/App.tsx` (add/remove a blank line)
3. Wait 5 seconds (polling + tunnel latency)
4. `curl -s https://dev.dataspheres.ai` and check for 200
5. Revert the edit
6. Report: "HMR pipeline working" or "HMR may be delayed — check CHOKIDAR_USEPOLLING"

### Diagnose (`/tunnel diagnose`)

Run when tunnel is DOWN (530 error). Steps:

1. Is cloudflared running? → If not, start it
2. Is localhost:5173 up? → If not, `docker compose up -d`
3. Is 127.0.0.1:8188 up? → If not, ComfyUI is not running (start it manually)
4. Is the config valid? → `cat /c/Users/facel/.cloudflared/config.yml`
5. Check cloudflared version: `"/c/Program Files (x86)/cloudflared/cloudflared.exe" --version`
6. List tunnel connections: `"/c/Program Files (x86)/cloudflared/cloudflared.exe" tunnel info dev-local`

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| 530 on dev.dataspheres.ai | cloudflared not running | `/tunnel start` |
| 502 on dev.dataspheres.ai | Vite not running | `docker compose up -d` |
| 530 on comfy.dataspheres.ai | cloudflared not running | `/tunnel start` |
| 502 on comfy.dataspheres.ai | ComfyUI not running | Start ComfyUI manually on port 8188 |
| SSH times out | WSL2 IP changed | Update `config.yml` SSH service IP, restart tunnel |
| HMR not working | Polling not enabled | Check `CHOKIDAR_USEPOLLING=true` in docker-compose |
| Tunnel starts but 530 persists | Stale connection | `/tunnel restart` |

## Config Reference

```yaml
# C:\Users\facel\.cloudflared\config.yml
tunnel: 8e71f484-9ad9-4644-bfd3-80e083d7a548
credentials-file: C:\Users\facel\.cloudflared\8e71f484-9ad9-4644-bfd3-80e083d7a548.json

ingress:
  - hostname: ssh.dataspheres.ai
    service: ssh://172.25.172.65:2222
  - hostname: dev.dataspheres.ai
    service: http://localhost:5173
  - hostname: comfy.dataspheres.ai
    service: http://127.0.0.1:8188
  - service: http_status:404
```

## Important Notes

- The tunnel runs as a **background process**, not a systemd service (WSL2 limitation)
- Binary is Windows-native (`.exe`) but runs fine from WSL2
- SSH IP (`172.25.172.65`) is the WSL2 virtual NIC — may change on Windows restart
- Tunnel auto-reconnects on transient network drops but does NOT auto-start after reboot
- ComfyUI must be running on port 8188 before the comfy tunnel is useful — the tunnel itself is always live
