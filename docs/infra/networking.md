# Networking

This guide covers network configuration, ports, proxying, and WebSocket setup.

## Ports

| Port | Service | Protocol | Description     |
| ---- | ------- | -------- | --------------- |
| 3007 | UI      | HTTP     | Web interface   |
| 3008 | Server  | HTTP/WS  | API + WebSocket |

### Port Mapping

In Docker Compose:

```yaml
services:
  ui:
    ports:
      - '3007:80' # Host:Container
  server:
    ports:
      - '3008:3008' # Host:Container
```

## nginx Configuration

The UI container uses nginx for:

- Serving static files
- Proxying API requests to the server
- WebSocket upgrade handling

### Configuration File

`apps/ui/nginx.conf`:

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    # Proxy API requests to backend server
    location /api {
        proxy_pass http://server:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }

    # SPA routing - serve index.html for all routes
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Key Configuration Points

**WebSocket Support:**

```nginx
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
```

**Long-Lived Connections:**

```nginx
proxy_read_timeout 86400;  # 24 hours
```

**Client IP Forwarding:**

```nginx
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;
```

## Docker Networking

### Internal Network

Docker Compose creates a bridge network for inter-container communication:

```
┌─────────────────────────────────────────┐
│      Docker Network (automaker_default) │
│                                          │
│  ┌─────────┐        ┌─────────┐         │
│  │   ui    │───────▶│ server  │         │
│  │         │ server │         │         │
│  │  :80    │  :3008 │  :3008  │         │
│  └────┬────┘        └────┬────┘         │
│       │                  │               │
└───────┼──────────────────┼───────────────┘
        │                  │
   host:3007          host:3008
```

### Service Discovery

Containers can reach each other by service name:

- UI → Server: `http://server:3008`
- No DNS lookup needed

### Network Isolation

By default, containers are isolated from the host network:

- Cannot access host services
- Cannot access other Docker networks
- Only exposed ports are accessible from host

## CORS Configuration

### Server-Side

```javascript
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3007',
    credentials: true,
  })
);
```

### Environment Variable

```yaml
services:
  server:
    environment:
      - CORS_ORIGIN=http://localhost:3007
```

For multiple origins:

```yaml
- CORS_ORIGIN=http://localhost:3007,https://automaker.example.com
```

## WebSocket

### Connection Flow

1. Client connects to `ws://localhost:3007/api` (UI nginx)
2. nginx upgrades to WebSocket and proxies to server
3. Server handles WebSocket at `:3008/api`

### Events

The WebSocket carries:

- Agent output streams
- Feature status updates
- Terminal output
- Auto-mode progress

### Client Reconnection

The UI automatically reconnects on disconnect with exponential backoff.

## External Access

### Expose to LAN

By default, the server binds to `0.0.0.0`:

```yaml
environment:
  - HOST=0.0.0.0
```

Access from other machines: `http://<server-ip>:3007`

### Restrict to Localhost

```yaml
services:
  ui:
    ports:
      - '127.0.0.1:3007:80'
  server:
    ports:
      - '127.0.0.1:3008:3008'
```

## Reverse Proxy Setup

### nginx (Host-Level)

For production with HTTPS:

```nginx
# /etc/nginx/sites-available/automaker
server {
    listen 443 ssl http2;
    server_name automaker.example.com;

    ssl_certificate /etc/letsencrypt/live/automaker.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/automaker.example.com/privkey.pem;

    # UI
    location / {
        proxy_pass http://127.0.0.1:3007;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API and WebSocket
    location /api {
        proxy_pass http://127.0.0.1:3008;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}

# Redirect HTTP to HTTPS
server {
    listen 80;
    server_name automaker.example.com;
    return 301 https://$server_name$request_uri;
}
```

### Caddy

```caddyfile
automaker.example.com {
    reverse_proxy /api* localhost:3008
    reverse_proxy localhost:3007
}
```

### Traefik (Docker Labels)

```yaml
services:
  ui:
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.automaker.rule=Host(`automaker.example.com`)'
      - 'traefik.http.routers.automaker.tls=true'
      - 'traefik.http.routers.automaker.tls.certresolver=letsencrypt'
```

## Firewall Configuration

### UFW (Ubuntu)

```bash
# Allow Automaker ports (if exposing externally)
sudo ufw allow 3007/tcp
sudo ufw allow 3008/tcp

# Or restrict to specific IP
sudo ufw allow from 192.168.1.0/24 to any port 3007
```

### iptables

```bash
# Allow from specific subnet
iptables -A INPUT -p tcp --dport 3007 -s 192.168.1.0/24 -j ACCEPT
iptables -A INPUT -p tcp --dport 3007 -j DROP
```

## Troubleshooting

### Port Already in Use

```bash
# Find process using port
lsof -i :3007
netstat -tlnp | grep 3007

# Kill process
kill -9 <PID>
```

### Container Can't Reach Host

From inside container, use special hostname:

- Linux: `host.docker.internal` (Docker 20.10+)
- Or use host network mode: `network_mode: host`

### WebSocket Connection Failed

1. Check nginx upgrade headers
2. Verify proxy_read_timeout is sufficient
3. Check browser console for CORS errors
4. Verify server is running: `curl localhost:3008/api/health`

### DNS Resolution Issues

```bash
# Test from container
docker exec automaker-server nslookup server
docker exec automaker-server ping server
```

## Performance Tuning

### nginx Worker Connections

```nginx
events {
    worker_connections 1024;
}
```

### Keep-Alive

```nginx
upstream backend {
    server server:3008;
    keepalive 32;
}
```

### Buffer Sizes

For large agent outputs:

```nginx
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
```
