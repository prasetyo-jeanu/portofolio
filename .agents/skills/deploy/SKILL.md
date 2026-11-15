---
name: deploy
description: "Trigger the Easypanel production deployment webhook after git push."
---

# Deploy Webhook Skill

Use this skill whenever changes are pushed to GitHub to automatically trigger the Easypanel production deployment webhook.

## Command

Run this command immediately after `git push`:

```bash
curl -X POST http://217.217.255.58:3000/api/deploy/554a2f63340cb1563307fad1a0d79520c846cf0d9cd4b110
```

In PowerShell:

```powershell
curl.exe -X POST "http://217.217.255.58:3000/api/deploy/554a2f63340cb1563307fad1a0d79520c846cf0d9cd4b110"
```

## Verification
Confirm the HTTP response returns `200 OK` with `Deploying...`.
