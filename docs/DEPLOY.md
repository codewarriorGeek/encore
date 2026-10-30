# Deploying Encore

Encore starts `qloo mcp` as a local stdio process, so it needs a VM or container with Node.js 22.19 or newer and the Qloo harness installed. Serverless platforms are not supported, and the browser never calls Qloo directly.

## What the live demo runs

1. **Build** the standalone bundle and copy the static files into it:

   ```sh
   npm run build
   cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
   ```

2. **Install** Node.js 22 and the harness on the server, outside the system Node:

   ```sh
   npm install -g --prefix /opt/encore/harness @qloo/qloo-harness
   ```

3. **Copy** `.next/standalone/` to `/opt/encore/app/`.

4. **Secrets** go in a root-only environment file (`/etc/encore.env`, mode 600), using the names in `.env.example`, plus:

   ```
   PORT=3917
   HOSTNAME=127.0.0.1
   QLOO_BIN=/opt/encore/harness/bin/qloo
   ```

5. **Run** it as a systemd service under a dedicated, non-login user:

   ```ini
   [Service]
   User=encore
   EnvironmentFile=/etc/encore.env
   ExecStart=/opt/encore/node/bin/node /opt/encore/app/server.js
   Restart=always
   MemoryMax=900M
   # Sandboxing (systemd-analyze security rates this about 3.1, "OK")
   NoNewPrivileges=true
   PrivateTmp=true
   ProtectSystem=strict
   ReadWritePaths=/opt/encore/home
   ProtectHome=true
   PrivateDevices=true
   ProtectKernelTunables=true
   ProtectKernelModules=true
   ProtectKernelLogs=true
   ProtectControlGroups=true
   ProtectClock=true
   ProtectHostname=true
   RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
   RestrictNamespaces=true
   RestrictRealtime=true
   RestrictSUIDSGID=true
   LockPersonality=true
   CapabilityBoundingSet=
   AmbientCapabilities=
   SystemCallArchitectures=native
   UMask=0077
   ```

6. **Reverse proxy** with HTTPS. With Apache, stream the live progress without buffering:

   ```apache
   ProxyPass / http://127.0.0.1:3917/ flushpackets=on timeout=300
   ProxyPassReverse / http://127.0.0.1:3917/
   <Location /api/plan>
       LimitRequestBody 32768
   </Location>
   ```

   Also set `ServerTokens Prod` and `ServerSignature Off` so Apache does not advertise its version. Security headers (CSP, HSTS and others) come from `next.config.ts`.

## Limits

`/api/plan` has limits for a public demo: `RATE_LIMIT_PER_HOUR` per address (default 12), `GLOBAL_LIMIT_PER_HOUR` across everyone (default 60) and `MAX_CONCURRENT_PLANS` (default 4). Request bodies over 32 KB are rejected.

## Health check

`GET /api/health` returns whether Qloo and the LLM provider are configured.
