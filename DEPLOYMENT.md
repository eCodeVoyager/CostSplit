# CostSplit - Production Deployment Guide

Complete guide for deploying CostSplit to production environments.

---

## 📋 Prerequisites

- Node.js v16+ installed
- MongoDB (local or cloud - Atlas recommended)
- Domain name (for production)
- SSL certificate
- Server with min 512MB RAM, 10GB storage

---

## 🔧 Environment Setup

### 1. Backend Environment Variables

Create `backend/.env` with production values:

```bash
PORT=5000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/costsplit?retryWrites=true&w=majority
JWT_SECRET=CHANGE_TO_A_SECURE_RANDOM_STRING_MIN_32_CHARACTERS_USE_openssl_rand_base64_32
SHARED_USERNAME=your_chosen_username
SHARED_PASSWORD=your_strong_password_min_12_chars
NODE_ENV=production
FRONTEND_URL=https://yourdomain.com
```

**Security Checklist:**
- [ ] JWT_SECRET is at least 32 characters
- [ ] SHARED_PASSWORD is strong (12+ chars, mixed case, numbers, symbols)
- [ ] MongoDB URI uses secure connection (mongodb+srv://)
- [ ] FRONTEND_URL points to actual domain

### 2. Frontend Environment Variables

Create `frontend/.env` with production values:

```bash
VITE_API_URL=https://api.yourdomain.com/api
```

---

## 🗄️ Database Setup

### MongoDB Atlas (Recommended)

1. **Create Cluster:**
   ```
   - Go to https://cloud.mongodb.com
   - Create new cluster (Free tier available)
   - Choose region closest to your server
   ```

2. **Configure Database:**
   ```
   - Create database: costsplit
   - Create user with read/write permissions
   - Note connection string
   ```

3. **Network Access:**
   ```
   - Whitelist server IP address
   - Or allow access from anywhere (0.0.0.0/0) - less secure
   ```

4. **Backup:**
   ```
   - Enable automated backups in Atlas settings
   - Schedule: Daily at off-peak hours
   ```

### Local MongoDB

```bash
# Install MongoDB
# Ubuntu/Debian
sudo apt-get install -y mongodb-org

# Start service
sudo systemctl start mongod
sudo systemctl enable mongod

# Create database
mongosh
> use costsplit
> db.createCollection("members")
> db.createCollection("expenses")
> exit
```

---

## 🚀 Deployment Options

### Option 1: Traditional VPS (Ubuntu Server)

#### A. Backend Deployment

```bash
# 1. Update system
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install PM2
sudo npm install -g pm2

# 4. Clone repository
git clone https://github.com/yourusername/CostSplit.git
cd CostSplit/backend

# 5. Install dependencies
npm install --production

# 6. Configure environment
nano .env
# Paste production variables

# 7. Start with PM2
pm2 start server.js --name costsplit-api
pm2 save
pm2 startup
# Follow the command it outputs

# 8. Check status
pm2 status
pm2 logs costsplit-api
```

#### B. Frontend Deployment

```bash
# 1. Build frontend
cd ../frontend
npm install
npm run build

# 2. Install nginx
sudo apt-get install -y nginx

# 3. Configure nginx
sudo nano /etc/nginx/sites-available/costsplit
```

Nginx configuration:
```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    root /path/to/CostSplit/frontend/dist;
    index index.html;

    # Frontend
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Backend API proxy
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

```bash
# 4. Enable site
sudo ln -s /etc/nginx/sites-available/costsplit /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# 5. Setup SSL with Let's Encrypt
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
# Follow prompts

# 6. Auto-renew SSL
sudo certbot renew --dry-run
```

#### C. Firewall Configuration

```bash
sudo ufw allow 22    # SSH
sudo ufw allow 80    # HTTP
sudo ufw allow 443   # HTTPS
sudo ufw enable
```

---

### Option 2: Docker Deployment

#### Backend Dockerfile

Create `backend/Dockerfile`:
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
```

#### Frontend Dockerfile

Create `frontend/Dockerfile`:
```dockerfile
FROM node:18-alpine as build

WORKDIR /app
COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

#### Docker Compose

Create `docker-compose.yml`:
```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    restart: always
    volumes:
      - mongodb_data:/data/db
    environment:
      MONGO_INITDB_ROOT_USERNAME: admin
      MONGO_INITDB_ROOT_PASSWORD: secure_password

  backend:
    build: ./backend
    restart: always
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - MONGODB_URI=mongodb://admin:secure_password@mongodb:27017/costsplit?authSource=admin
      - JWT_SECRET=${JWT_SECRET}
      - SHARED_USERNAME=${SHARED_USERNAME}
      - SHARED_PASSWORD=${SHARED_PASSWORD}
    depends_on:
      - mongodb

  frontend:
    build: ./frontend
    restart: always
    ports:
      - "80:80"
      - "443:443"
    depends_on:
      - backend
    volumes:
      - ./ssl:/etc/nginx/ssl

volumes:
  mongodb_data:
```

Deploy:
```bash
docker-compose up -d
docker-compose logs -f
```

---

### Option 3: Cloud Platforms

#### Heroku

Backend:
```bash
cd backend
heroku create costsplit-api
heroku addons:create mongolab:sandbox
heroku config:set JWT_SECRET=your_secret
heroku config:set SHARED_USERNAME=admin
heroku config:set SHARED_PASSWORD=password
heroku config:set NODE_ENV=production
git push heroku main
```

Frontend:
```bash
cd frontend
heroku create costsplit-frontend
heroku buildpacks:add heroku/nodejs
heroku config:set VITE_API_URL=https://costsplit-api.herokuapp.com/api
git push heroku main
```

#### Vercel (Frontend only)

```bash
cd frontend
npm install -g vercel
vercel --prod
# Follow prompts
```

#### Railway / Render

Similar to Heroku - follow platform-specific guides.

---

## 🔒 Security Hardening

### 1. Enable Firewall
```bash
sudo ufw enable
sudo ufw status
```

### 2. Fail2Ban (Prevent brute force)
```bash
sudo apt-get install fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 3. Regular Updates
```bash
# Setup automatic security updates
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. MongoDB Security
- Enable authentication
- Use strong passwords
- Regular backups
- Limit network access

### 5. Application Security
- Keep dependencies updated: `npm audit fix`
- Monitor logs: `pm2 logs`
- Set up rate limiting (already implemented)
- Use HTTPS everywhere

---

## 📊 Monitoring & Logs

### PM2 Monitoring
```bash
pm2 monit                    # Real-time monitoring
pm2 logs costsplit-api       # View logs
pm2 logs --err               # View error logs only
pm2 logs --lines 100         # Last 100 lines
```

### System Monitoring
```bash
# CPU and Memory
htop

# Disk usage
df -h

# Network
netstat -tuln
```

### Log Rotation
PM2 automatically rotates logs, but you can configure:
```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

---

## 🔄 Updates & Maintenance

### Update Application
```bash
cd CostSplit
git pull origin main

# Backend
cd backend
npm install
pm2 restart costsplit-api

# Frontend
cd ../frontend
npm install
npm run build
sudo systemctl reload nginx
```

### Backup Database
```bash
# MongoDB dump
mongodump --uri="mongodb://localhost:27017/costsplit" --out=/backups/$(date +%Y%m%d)

# Compress
tar -czf backup-$(date +%Y%m%d).tar.gz /backups/$(date +%Y%m%d)
```

### Restore Database
```bash
mongorestore --uri="mongodb://localhost:27017" /backups/20251114/
```

---

## 🐛 Troubleshooting

### Backend won't start
```bash
pm2 logs costsplit-api --err
# Check .env file
# Check MongoDB connection
# Check port 5000 availability
```

### Frontend not loading
```bash
sudo nginx -t              # Test config
sudo systemctl status nginx
sudo tail -f /var/log/nginx/error.log
```

### Database connection issues
```bash
# Test MongoDB connection
mongosh "mongodb://localhost:27017/costsplit"

# Check if MongoDB is running
sudo systemctl status mongod
```

### SSL issues
```bash
sudo certbot renew --dry-run
sudo certbot renew --force-renewal
```

---

## ✅ Post-Deployment Checklist

- [ ] Backend API responding at `/health`
- [ ] Frontend loads correctly
- [ ] Can login successfully
- [ ] Can add members
- [ ] Can add expenses
- [ ] Can view balances
- [ ] SSL certificate valid
- [ ] Environment variables secured
- [ ] Database backups configured
- [ ] Monitoring set up
- [ ] Logs rotating properly
- [ ] PM2 auto-restart configured
- [ ] Firewall rules active
- [ ] DNS properly configured

---

## 📞 Support & Resources

- **MongoDB Atlas:** https://docs.atlas.mongodb.com/
- **PM2 Documentation:** https://pm2.keymetrics.io/
- **Nginx Documentation:** https://nginx.org/en/docs/
- **Let's Encrypt:** https://letsencrypt.org/getting-started/

---

**Deployment Complete!** 🎉

Your CostSplit application is now live and ready for users.
