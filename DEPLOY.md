# Deploying MYTAMAN AI Tutor to an Azure Ubuntu VM (Docker)

This repo ships a fully containerized stack:

- **mongo** — MongoDB 7
- **backend** — FastAPI + Uvicorn on port 8001 (internal only)
- **frontend** — React build served by Nginx on port 80 (mapped to your chosen host port)

Nginx inside the frontend container proxies every request to `/api/*` to the
backend container, so the browser talks to a single origin. No CORS wiring
needed.

---

## 1. Prerequisites on the VM

```bash
# Install Docker Engine + Compose plugin (Ubuntu 22.04 / 24.04)
sudo apt update
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release; echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
# log out & back in so the docker group takes effect
```

Open the app port on **both** Azure NSG (Portal → VM → Networking) and Ubuntu firewall:

```bash
sudo ufw allow 3000/tcp    # or 80/443 if you plan to use Nginx/domain in front
```

---

## 2. Clone the repo

```bash
git clone <your-repo-url> mytaman-ai-tutor
cd mytaman-ai-tutor
```

---

## 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:

- `JWT_SECRET` → run `openssl rand -hex 32`
- `FERNET_KEY` → run
  ```bash
  python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
- `APP_PORT` → the public port you'll expose (default `3000`)
- `EMERGENT_LLM_KEY` is pre-filled with the shared universal key

---

## 4. Build & run

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f backend      # follow backend logs
docker compose logs -f frontend
```

Open the app in your browser:

```
http://<your-vm-public-ip>:3000
```

Seeded demo accounts (created automatically on first backend boot):

| Role    | Email                 | Password        |
|---------|-----------------------|-----------------|
| Admin   | admin@mytaman.ai      | Admin@12345     |
| Parent  | parent@mytaman.ai     | Parent@12345    |
| Student | student@mytaman.ai    | Student@12345   |

---

## 5. Common commands

```bash
# Pull latest changes from GitHub and redeploy
git pull
docker compose up -d --build

# Stop everything
docker compose down

# Wipe database (removes all users/packs/content)
docker compose down -v

# Rebuild only the backend after a code change
docker compose build backend && docker compose up -d backend

# Shell into a container
docker compose exec backend bash
docker compose exec mongo mongosh
```

---

## 6. Optional — production hardening

- Put **Nginx or Caddy** on port 443 in front of the frontend container
  and terminate TLS there (Let's Encrypt).
- Restrict `CORS_ORIGINS` in `.env` to your domain instead of `*`.
- Move MongoDB to a managed service (Azure Cosmos DB with Mongo API) and
  point `MONGO_URL` at it — remove the `mongo` service from `docker-compose.yml`.
- Set `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `GEMINI_API_KEY` in `.env`
  once you have your own paid keys — they override any UI-saved keys.

---

## 7. Round-trip workflow

1. New code gets pushed to GitHub from the Emergent workspace.
2. On the VM:
   ```bash
   cd mytaman-ai-tutor
   git pull
   docker compose up -d --build
   ```
3. Refresh the browser and review.

That's it.
