# Quick Start - Oracle Cloud Deployment

**5-minute quick reference** for deploying ProxyOS backend to Oracle Cloud.

## Prerequisites Checklist

- [ ] Oracle Cloud account (free tier)
- [ ] Supabase project created
- [ ] Groq API key
- [ ] Gemini API key
- [ ] GitHub repo with ProxyOS code

## Step-by-Step Commands

### 1. Create Oracle Cloud VM

1. Oracle Cloud Console → Compute → Instances → Create Instance
2. Shape: **VM.Standard.A1.Flex** (ARM, 2 OCPU, 12GB RAM)
3. Image: Ubuntu 22.04
4. Add SSH key
5. Create

### 2. Configure Firewall

Oracle Cloud Console → Networking → VCN → Security Lists → Add Ingress Rule:
- Port: **3000**
- Protocol: TCP
- Source: `0.0.0.0/0`

### 3. SSH and Install Docker

```bash
ssh ubuntu@<PUBLIC_IP>

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh && sudo sh get-docker.sh
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Log out and back in
exit
ssh ubuntu@<PUBLIC_IP>
```

### 4. Deploy Backend

```bash
# Clone repo
git clone https://github.com/YOUR_USERNAME/ProxyOS.git
cd ProxyOS/apps/backend

# Create .env file
nano .env
```

Paste:
```env
PORT=3000
NODE_ENV=production
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_KEY
GROQ_API_KEY=YOUR_GROQ_KEY
GEMINI_API_KEY=YOUR_GEMINI_KEY
```

```bash
# Deploy
docker-compose up -d

# Check logs
docker-compose logs -f
```

### 5. Verify

```bash
curl http://localhost:3000/health
# Should return: {"status":"healthy"}
```

### 6. Update Frontend

In Vercel, set `NEXT_PUBLIC_BACKEND_URL` to:
```
http://<PUBLIC_IP>:3000
```

## Common Commands

```bash
# View logs
docker-compose logs -f

# Restart
docker-compose restart

# Stop
docker-compose down

# Update code
git pull && docker-compose up -d --build
```

## Troubleshooting

**Backend not responding?**
```bash
docker-compose ps
docker-compose logs proxyos-backend
```

**Can't SSH?**
- Check Security List allows port 22
- Verify VM is running in Oracle Cloud Console

**Port 3000 not accessible?**
- Check Security List allows port 3000
- Test locally: `curl http://localhost:3000/health`

## Full Guide

For detailed instructions, see **[DEPLOYMENT_ORACLE.md](DEPLOYMENT_ORACLE.md)**
