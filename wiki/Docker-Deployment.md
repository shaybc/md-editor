# Docker Deployment

This page covers Docker-based deployment for **MD-Editor** from this repository.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Docker Compose](#docker-compose)
- [Docker Build And Run](#docker-build-and-run)
- [Dockerfile Summary](#dockerfile-summary)
- [Nginx Configuration](#nginx-configuration)
- [Environment And Customization](#environment-and-customization)
- [Publishing Your Own Image](#publishing-your-own-image)
- [Reverse Proxy Setup](#reverse-proxy-setup)
- [Transparency And Security](#transparency-and-security)

---

## Quick Start

The repository includes a Dockerfile and Docker Compose file in `web-app/`. Build and run the local image with:

```bash
cd web-app
docker compose up --build
```

Open:

```text
http://localhost:8080/
```

Stop the container with:

```bash
docker compose down
```

---

## Docker Compose

The included `web-app/docker-compose.yml` builds the app from the local `web-app/Dockerfile`.

```yaml
version: '3.8'

services:
  md-editor:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    container_name: md-editor
    restart: unless-stopped
    environment:
      - NGINX_HOST=localhost
      - NGINX_PORT=80
```

### Start

```bash
cd web-app
docker compose up --build
```

### Start in the background

```bash
cd web-app
docker compose up -d --build
```

### Stop

```bash
cd web-app
docker compose down
```

### Change the host port

Change the left side of the port mapping:

```yaml
ports:
  - "3000:80"
```

Then open `http://localhost:3000/`.

---

## Docker Build And Run

You can build and run the image without Docker Compose.

```bash
cd web-app
docker build -t md-editor:local .
docker run --rm -p 8080:80 --name md-editor md-editor:local
```

Run in the background with a restart policy:

```bash
docker run -d \
  --name md-editor \
  -p 8080:80 \
  --restart unless-stopped \
  md-editor:local
```

Open:

```text
http://localhost:8080/
```

Remove the background container:

```bash
docker stop md-editor
docker rm md-editor
```

---

## Dockerfile Summary

`web-app/Dockerfile` is based on `nginx:alpine` and:

1. Copies the static web app files into `/usr/share/nginx/html/`.
2. Writes an Nginx server configuration into `/etc/nginx/conf.d/default.conf`.
3. Serves `index.html` as the fallback for app routes.
4. Adds one-year cache headers for static assets.
5. Adds basic browser security headers.
6. Exposes container port `80`.

The container serves static HTML, CSS, JavaScript, images, and app assets. It does not run a backend application server.

---

## Nginx Configuration

The Dockerfile writes this Nginx configuration:

```nginx
server {
    listen 80;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
}
```

To change this behavior, edit `web-app/Dockerfile` and rebuild the image.

---

## Environment And Customization

MD-Editor is a static client-side app, so the Docker container does not require runtime application environment variables.

The current compose file includes:

```yaml
environment:
  - NGINX_HOST=localhost
  - NGINX_PORT=80
```

These values are informational in the current Dockerfile; the generated Nginx config is written at build time and does not template those variables automatically.

Common customizations:

- Change the exposed host port in `docker-compose.yml`.
- Modify `web-app/Dockerfile` to adjust Nginx caching or headers.
- Replace CDN references in `web-app/index.html` with local assets for isolated deployments.
- Rebuild the image after source or configuration changes.

### Serving from a sub-path

To serve the app at a sub-path such as `/md-editor/`, update the Nginx `location` and fallback paths in `web-app/Dockerfile`, then rebuild the image. Test routing, asset URLs, and shared links after changing the base path.

---

## Publishing Your Own Image

This checkout does not include a `.github/workflows/docker-publish.yml` workflow, so Docker image publishing is not configured here by default.

To publish your own image manually:

```bash
cd web-app
docker build -t ghcr.io/shaybc/md-editor:latest .
docker push ghcr.io/shaybc/md-editor:latest
```

Replace `ghcr.io/shaybc/md-editor:latest` with your own registry, owner, image name, and tag.

If you later add a GitHub Actions workflow, make sure the documentation matches the actual registry, tags, permissions, and trigger rules used by that workflow.

---

## Reverse Proxy Setup

To run MD-Editor behind a reverse proxy, expose the container locally and proxy to the mapped host port.

Example container:

```bash
cd web-app
docker compose up -d --build
```

The examples below assume the app is reachable at `http://127.0.0.1:8080`.

### Nginx Reverse Proxy

```nginx
server {
    listen 443 ssl;
    server_name md-editor.example.com;

    ssl_certificate     /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Caddy Reverse Proxy

```caddyfile
md-editor.example.com {
    reverse_proxy localhost:8080
}
```

### Traefik Labels

If you use Traefik, add labels to the compose service and keep the local build configuration:

```yaml
services:
  md-editor:
    build:
      context: .
      dockerfile: Dockerfile
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.md-editor.rule=Host(`md-editor.example.com`)"
      - "traefik.http.routers.md-editor.entrypoints=websecure"
      - "traefik.http.routers.md-editor.tls.certresolver=letsencrypt"
```

---

## Transparency And Security

The Docker image is intentionally minimal:

- It serves static files with Nginx.
- It does not include a backend service, database, analytics, telemetry, cookies, or tracking scripts.
- Markdown rendering, tab state, graph state, exports, and share-link encoding run in the browser.
- GitHub import uses public GitHub APIs and raw file URLs.
- The web build references public CDN libraries from `web-app/index.html` unless you replace them with local assets.
- Nginx applies `X-Frame-Options`, `X-Content-Type-Options`, `X-XSS-Protection`, and `Referrer-Policy` headers.

For fully offline or isolated deployments, vendor the CDN assets locally and avoid GitHub import.
