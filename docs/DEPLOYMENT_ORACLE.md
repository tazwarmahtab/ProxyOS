# ProxyOS Deployment Guide - Oracle Cloud

**Recommended deployment option** - Oracle Cloud Free Tier provides always-on infrastructure with better performance than Hugging Face Spaces.

## Why Oracle Cloud?

✅ **Always-on** - No auto-sleep, no cold starts, instant task processing  
✅ **More resources** - Up to 24GB RAM (ARM Ampere A1) vs 16GB on HF Spaces  
✅ **Better performance** - Dedicated VM vs shared container  
✅ **Production-ready** - Suitable for real workloads  
✅ **More control** - Full root access, custom configurations  
✅ **Free forever** - Generous free tier that doesn't expire  

## Prerequisites

- Oracle Cloud account with Free Tier access ([Sign up here](https://cloud.oracle.com))
- GitHub account
- Supabase account (free tier)
- Vercel account (free tier)
- API keys:
  - Groq API key ([Get free key](https://groq.com))
  - Google Gemini API key ([Get free key](https://ai.google.dev))

## Step 1: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. In the SQL Editor, run the contents of `infra/supabase-schema.sql`
3. Go to **Project Settings** > **API** and copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **`anon` `public` key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **`service_role` `secret` key** → `SUPABASE_SERVICE_KEY` (backend only)

4. Enable Realtime:
   - Go to **Database** > **Replication**
   - Enable replication for tables: `agent_tasks`, `proxy_stats`, `user_preferences`

## Step 2: Create Oracle Cloud VM

### 2.1 Create Compute Instance

1. Log in to [Oracle Cloud Console](https://cloud.oracle.com)
2. Navigate to **Compute** > **Instances**
3. Click **Create Instance**
4. Configure:
   - **Name**: `proxyos-backend`
   - **Image**: Choose **Canonical Ubuntu 22.04** (or latest LTS)
   - **Shape**: Select **VM.Standard.A1.Flex** (ARM-based, free tier eligible)
     - **OCPUs**: 2
     - **Memory**: 12 GB
   - **Networking**: Use default VCN (Virtual Cloud Network)
   - **Add SSH Keys**: 
     - Upload your public SSH key, OR
     - Click "Save Private Key" to download a new key pair
5. Click **Create**

**Note**: The instance will take 2-5 minutes to provision.

### 2.2 Configure Security List (Firewall)

1. Go to **Networking** > **Virtual Cloud Networks**
2. Click on your VCN
3. Go to **Security Lists** > **Default Security List**
4. Click **Add Ingress Rules**:
   - **Source Type**: CIDR
   - **Source CIDR**: `0.0.0.0/0` (or restrict to your IP for better security)
   - **IP Protocol**: TCP
   - **Destination Port Range**: `3000`
   - **Description**: "ProxyOS Backend API"
5. Click **Add Ingress Rules**

**Also ensure SSH (port 22) is allowed** - this should be enabled by default.

### 2.3 Get Your Instance Details

1. In **Compute** > **Instances**, find your instance
2. Copy the **Public IP address**
3. Note the **Username** (usually `ubuntu` for Ubuntu images)

## Step 3: SSH into VM and Install Docker

### 3.1 Connect via SSH

```bash
ssh -i ~/.ssh/your-key ubuntu@<PUBLIC_IP>
```

Replace:
- `your-key` with your private key filename
- `<PUBLIC_IP>` with your instance's public IP address

If you downloaded a new key pair from Oracle Cloud:
```bash
chmod 400 ~/Downloads/ssh-key-*.key
ssh -i ~/Downloads/ssh-key-*.key ubuntu@<PUBLIC_IP>
```

### 3.2 Install Docker

```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Add your user to docker group (to run docker without sudo)
sudo usermod -aG docker ubuntu

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version

# Log out and back in for group changes to take effect
exit
```

Reconnect via SSH:
```bash
ssh -i ~/.ssh/your-key ubuntu@<PUBLIC_IP>
```

## Step 4: Deploy Backend to Oracle Cloud

### 4.1 Clone Repository

```bash
# Install git if needed
sudo apt install git -y

# Clone your repo
git clone https://github.com/YOUR_USERNAME/ProxyOS.git
cd ProxyOS/apps/backend
```

**Alternative**: If your repo is private, use SSH or upload files via SCP:
```bash
# From your local machine
scp -r -i ~/.ssh/your-key apps/backend ubuntu@<PUBLIC_IP>:~/ProxyOS/apps/
```

### 4.2 Create Environment File

```bash
nano .env
```

Add the following (replace with your actual values):
```env
# Server Configuration
PORT=3000
NODE_ENV=production

# Supabase Configuration
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_KEY=YOUR_SERVICE_ROLE_KEY

# LLM Provider API Keys
GROQ_API_KEY=YOUR_GROQ_API_KEY
GEMINI_API_KEY=YOUR_GEMINI_API_KEY

# Telegram Adapter (optional - leave empty if not using)
TELEGRAM_BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN

# Slack Adapter (optional - leave empty if not using)
SLACK_BOT_TOKEN=xoxb-YOUR-BOT-TOKEN
SLACK_SIGNING_SECRET=YOUR_SIGNING_SECRET
SLACK_APP_TOKEN=xapp-YOUR-APP-TOKEN

# Backend URL (adapters use this to communicate with backend)
# Use docker service name when running in docker-compose:
PROXYOS_BACKEND_URL=http://proxyos-backend:3000
```

Save with `Ctrl+X`, then `Y`, then `Enter`.

### 4.3 Deploy with Docker Compose (Recommended)

The `docker-compose.yml` is configured with **profiles** for optional adapters:

```bash
# Option 1: Backend only (no adapters)
docker-compose up -d proxyos-backend

# Option 2: Backend + Telegram
docker-compose --profile telegram up -d

# Option 3: Backend + Slack
docker-compose --profile slack up -d

# Option 4: Backend + All adapters
docker-compose --profile telegram --profile slack up -d
```

**Or use the interactive deployment script:**
```bash
chmod +x deploy.sh
./deploy.sh
```

This will prompt you to select which services to run.

### 4.4 View Logs

```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f proxyos-backend
docker-compose logs -f proxyos-telegram
docker-compose logs -f proxyos-slack
```

### 4.5 Check Container Status

```bash
docker-compose ps
```

### 4.6 Verify Backend is Running

```bash
# From the VM
curl http://localhost:3000/health

# Should return: {"status":"healthy","timestamp":"..."}
```

From your local machine:
```bash
curl http://<PUBLIC_IP>:3000/health
```

### 4.7 Verify Adapters (if running)

```bash
# Check telegram adapter logs
docker-compose logs proxyos-telegram | grep -i "starting\|error"

# Check slack adapter logs  
docker-compose logs proxyos-slack | grep -i "starting\|error"
```

For **Telegram**: Send a message to your bot, it should respond.

For **Slack**: Mention your bot in a channel or use the `/proxyos` command.

## Step 5: Set Up Reverse Proxy with Nginx (Recommended for Production)

Using Nginx provides better security, SSL support, and easier domain management.

### 5.1 Install Nginx

```bash
sudo apt install nginx -y
```

### 5.2 Create Nginx Configuration

```bash
sudo nano /etc/nginx/sites-available/proxyos-backend
```

Add the following configuration:
```nginx
server {
    listen 80;
    server_name YOUR_DOMAIN_OR_IP;

    # Increase body size limit for API requests
    client_max_body_size 10M;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Timeouts for long-running requests
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
}
```

Replace `YOUR_DOMAIN_OR_IP` with your domain name or public IP address.

### 5.3 Enable Site and Restart Nginx

```bash
# Create symbolic link
sudo ln -s /etc/nginx/sites-available/proxyos-backend /etc/nginx/sites-enabled/

# Remove default site (optional)
sudo rm /etc/nginx/sites-enabled/default

# Test configuration
sudo nginx -t

# Restart Nginx
sudo systemctl restart nginx

# Enable Nginx to start on boot
sudo systemctl enable nginx
```

### 5.4 Update Firewall for Port 80

1. Go to Oracle Cloud Console > **Networking** > **Virtual Cloud Networks**
2. Add ingress rule for port **80** (same process as Step 2.2)

### 5.5 Set Up SSL with Let's Encrypt (Optional but Recommended)

```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx -y

# Get SSL certificate (replace with your domain)
sudo certbot --nginx -d your-domain.com

# Certbot will automatically configure Nginx and set up auto-renewal
```

## Step 6: Set Up Vercel Frontend

1. Push your code to GitHub (if not already done):
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/ProxyOS.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) and import your GitHub repo

3. Configure:
   - **Framework Preset**: Next.js
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Output Directory**: `.next`

4. Add Environment Variables:
   - `NEXT_PUBLIC_SUPABASE_URL` (from Step 1)
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (from Step 1)
   - `NEXT_PUBLIC_BACKEND_URL` → `http://YOUR_ORACLE_IP:3000` (or `https://your-domain.com` if using Nginx + SSL)
   - `NEXT_PUBLIC_HF_TOKEN` (optional, for World Generator)

5. Deploy!

## Step 7: Verify Complete Deployment

### 7.1 Backend Health Check

```bash
# From VM
curl http://localhost:3000/health

# From local machine
curl http://<PUBLIC_IP>:3000/health

# Should return: {"status":"healthy","timestamp":"..."}
```

### 7.2 Frontend Integration

1. Visit your Vercel URL
2. Open browser DevTools > Network tab
3. Try feeding context via Command Center
4. Verify requests are going to your Oracle Cloud backend
5. Check Swarm Drawer for task updates

### 7.3 Database Verification

1. In Supabase Dashboard, check `proxy_context` table for new entries
2. Check `agent_tasks` for delegated tasks
3. Verify tasks are being processed (status changes from `pending` → `working` → `success`)

## Step 8: Set Up Auto-Updates (Optional)

### Option A: Use the deployment script

```bash
nano ~/update-backend.sh
```

Add:
```bash
#!/bin/bash
cd ~/ProxyOS/apps/backend
git pull origin main
./deploy.sh
```

Make executable:
```bash
chmod +x ~/update-backend.sh
```

Usage:
```bash
~/update-backend.sh
```

### Option B: Manual update with profiles

```bash
cd ~/ProxyOS/apps/backend
git pull origin main
docker-compose down
docker-compose --profile telegram --profile slack up -d --build
```

## Step 9: Set Up Monitoring (Optional)

### 9.1 Docker Health Checks

The `docker-compose.yml` already includes health checks. Monitor with:

```bash
docker-compose ps
```

### 9.2 Log Monitoring

```bash
# View recent logs
docker-compose logs --tail=100

# Follow logs in real-time
docker-compose logs -f

# View logs for specific service
docker-compose logs proxyos-backend
```

### 9.3 System Monitoring

```bash
# Check system resources
free -h          # Memory usage
df -h            # Disk usage
docker stats     # Container resource usage
```

## Troubleshooting

### Backend not responding

1. **Check if container is running**:
   ```bash
   docker ps
   docker-compose ps
   ```

2. **Check logs**:
   ```bash
   docker logs proxyos-backend
   docker-compose logs proxyos-backend
   ```

3. **Verify environment variables**:
   ```bash
   docker exec proxyos-backend env
   ```

4. **Check firewall rules**:
   - Verify port 3000 (or 80) is open in Oracle Cloud Security Lists
   - Test from VM: `curl http://localhost:3000/health`
   - Test from outside: `curl http://<PUBLIC_IP>:3000/health`

### Cannot SSH into VM

1. **Verify security list allows SSH (port 22)**
2. **Check your SSH key is correct**
3. **Ensure VM is running** in Oracle Cloud Console
4. **Try different SSH client** or check key permissions:
   ```bash
   chmod 400 ~/.ssh/your-key
   ```

### High memory usage

1. **Monitor memory**:
   ```bash
   free -h
   docker stats
   ```

2. **Oracle Cloud Free Tier ARM instances have 24GB total**
3. **Check for memory leaks** in application logs
4. **Restart container if needed**:
   ```bash
   docker-compose restart
   ```

### Domain not resolving

1. **If using a domain**:
   - Ensure DNS A record points to Oracle Cloud IP
   - Verify DNS propagation: `dig your-domain.com`
   - Check Nginx config: `sudo nginx -t`

2. **If using IP directly**:
   - Verify firewall allows port 80/443
   - Check Nginx is running: `sudo systemctl status nginx`

### Container keeps restarting

1. **Check logs for errors**:
   ```bash
   docker-compose logs proxyos-backend
   ```

2. **Verify environment variables are set correctly**
3. **Check if port 3000 is already in use**:
   ```bash
   sudo netstat -tulpn | grep 3000
   ```

### Tasks not processing

1. **Check backend logs** for agent execution errors
2. **Verify LLM API keys** are correct and have quota
3. **Check Supabase connection**:
   ```bash
   docker exec proxyos-backend curl http://localhost:3000/health
   ```

## Oracle Cloud Free Tier Limits

- **Compute**: 
  - 2 AMD VMs (1/8 OCPU, 1GB RAM each) OR
  - 4 ARM VMs (Ampere A1, up to 24GB RAM total) ← **Recommended**
- **Storage**: 200GB block storage
- **Bandwidth**: 10TB egress per month
- **Always-on**: No auto-sleep (unlike Hugging Face Spaces)

## Advantages Over Hugging Face Spaces

| Feature | Oracle Cloud | Hugging Face Spaces |
|---------|--------------|---------------------|
| **Availability** | Always-on | Auto-sleep after inactivity |
| **Cold Starts** | None | 10-30 seconds after sleep |
| **Resources** | 24GB RAM total | 16GB RAM |
| **Performance** | Dedicated VM | Shared container |
| **Control** | Full root access | Limited |
| **Production-ready** | ✅ Yes | ⚠️ Demo/experimental |
| **Cost** | Free forever | Free (with limitations) |

## Security Best Practices

1. **Restrict firewall rules** to your IP instead of `0.0.0.0/0` when possible
2. **Use SSL/TLS** with Let's Encrypt for production
3. **Keep system updated**: `sudo apt update && sudo apt upgrade`
4. **Use strong SSH keys** and disable password authentication
5. **Regular backups** of your `.env` file (store securely)
6. **Monitor logs** for suspicious activity
7. **Use environment variables** - never commit secrets to git

## Next Steps

- Set up automated backups
- Configure log rotation
- Add monitoring/alerting (e.g., UptimeRobot)
- Set up CI/CD for automated deployments
- Add custom domain and SSL certificate
- Configure firewall rules more restrictively

## Support

- Oracle Cloud Documentation: https://docs.oracle.com/en-us/iaas/
- Docker Documentation: https://docs.docker.com/
- Nginx Documentation: https://nginx.org/en/docs/

---

**Ready to deploy?** Start with Step 1 and work through each section. The entire process takes about 30-45 minutes.
