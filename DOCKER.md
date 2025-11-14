# 🐳 CostSplit - Docker Deployment Guide

Complete guide for running CostSplit using Docker and Docker Compose.

## 📋 Prerequisites

- **Docker** installed (v20.10+) - [Install Docker](https://docs.docker.com/get-docker/)
- **Docker Compose** installed (v2.0+) - [Install Docker Compose](https://docs.docker.com/compose/install/)
- **MongoDB** database (external - not in Docker)
  - Local MongoDB instance, OR
  - MongoDB Atlas cloud database, OR
  - Remote MongoDB server

## 🚀 Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/eCodeVoyager/CostSplit.git
cd CostSplit
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```bash
cp .env.example .env
```

Edit `.env` and configure your MongoDB connection:

```env
# Required: External MongoDB connection string
MONGODB_URI=mongodb://host.docker.internal:27017/costsplit

# Required: JWT Secret (use a strong random string)
JWT_SECRET=your-super-secret-jwt-key-change-this

# Optional: Other configurations
JWT_EXPIRE=7d
PORT=5000
NODE_ENV=production
CORS_ORIGIN=http://localhost:3000
VITE_API_URL=http://localhost:5000/api
```

### 3. Start the Application

```bash
docker-compose up -d
```

This will:
- Build frontend and backend Docker images
- Start both services in detached mode
- Frontend will be available at: http://localhost:3000
- Backend API will be available at: http://localhost:5000

### 4. Verify Services are Running

```bash
docker-compose ps
```

You should see both services running:
```
NAME                   STATUS          PORTS
costsplit-frontend     Up (healthy)    0.0.0.0:3000->80/tcp
costsplit-backend      Up (healthy)    0.0.0.0:5000->5000/tcp
```

### 5. View Logs

```bash
# View all logs
docker-compose logs

# View frontend logs
docker-compose logs frontend

# View backend logs
docker-compose logs backend

# Follow logs in real-time
docker-compose logs -f
```

## 🗄️ MongoDB Connection Options

### Option 1: Local MongoDB (Docker Host)

If MongoDB is running on your host machine:

```env
MONGODB_URI=mongodb://host.docker.internal:27017/costsplit
```

### Option 2: MongoDB Atlas (Cloud)

If using MongoDB Atlas:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/costsplit?retryWrites=true&w=majority
```

### Option 3: Remote MongoDB Server

If using a remote MongoDB server:

```env
MONGODB_URI=mongodb://username:password@remote-host:27017/costsplit
```

### Option 4: MongoDB with Authentication

If your local MongoDB requires authentication:

```env
MONGODB_URI=mongodb://username:password@host.docker.internal:27017/costsplit?authSource=admin
```

## 🛠️ Docker Commands

### Build Images

```bash
# Build all images
docker-compose build

# Build specific service
docker-compose build frontend
docker-compose build backend

# Build without cache
docker-compose build --no-cache
```

### Start Services

```bash
# Start all services
docker-compose up

# Start in detached mode
docker-compose up -d

# Start specific service
docker-compose up frontend
docker-compose up backend
```

### Stop Services

```bash
# Stop all services
docker-compose stop

# Stop and remove containers
docker-compose down

# Stop, remove containers, and remove volumes
docker-compose down -v
```

### Restart Services

```bash
# Restart all services
docker-compose restart

# Restart specific service
docker-compose restart frontend
docker-compose restart backend
```

### View Status

```bash
# View running containers
docker-compose ps

# View all containers (including stopped)
docker-compose ps -a
```

### Execute Commands in Containers

```bash
# Open shell in backend container
docker-compose exec backend sh

# Open shell in frontend container
docker-compose exec frontend sh

# Run npm commands in backend
docker-compose exec backend npm run test
```

## 🔧 Configuration

### Port Configuration

Default ports can be changed in `docker-compose.yml`:

```yaml
services:
  backend:
    ports:
      - "5000:5000"  # Change left port: "8080:5000"

  frontend:
    ports:
      - "3000:80"    # Change left port: "8080:80"
```

### Environment Variables

All environment variables can be configured in `.env` file:

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `MONGODB_URI` | MongoDB connection string | - | ✅ Yes |
| `JWT_SECRET` | Secret key for JWT tokens | - | ✅ Yes |
| `JWT_EXPIRE` | JWT token expiration | 7d | ❌ No |
| `PORT` | Backend server port | 5000 | ❌ No |
| `NODE_ENV` | Node environment | production | ❌ No |
| `CORS_ORIGIN` | Allowed CORS origins | http://localhost:3000 | ❌ No |
| `VITE_API_URL` | Frontend API URL | http://localhost:5000/api | ❌ No |

## 🏥 Health Checks

Both services include health checks:

### Backend Health Check
```bash
curl http://localhost:5000/api/health
```

### Frontend Health Check
```bash
curl http://localhost:3000/health
```

### Check Health Status
```bash
docker-compose ps
```

Look for "(healthy)" status.

## 🔍 Troubleshooting

### Container Won't Start

1. **Check logs:**
   ```bash
   docker-compose logs backend
   docker-compose logs frontend
   ```

2. **Verify MongoDB connection:**
   ```bash
   # Test MongoDB connection from host
   mongosh "mongodb://host.docker.internal:27017/costsplit"
   ```

3. **Check environment variables:**
   ```bash
   docker-compose config
   ```

### MongoDB Connection Issues

**Error: "MongoNetworkError: failed to connect"**

Solutions:
- If using local MongoDB, ensure it's running: `sudo systemctl status mongod`
- Use `host.docker.internal` instead of `localhost` in MONGODB_URI
- Check MongoDB is accessible: `telnet host.docker.internal 27017`
- Verify firewall rules allow connection

**Error: "Authentication failed"**

Solutions:
- Verify MongoDB username and password
- Check authentication database: `?authSource=admin`
- Ensure MongoDB user has proper permissions

### Port Already in Use

**Error: "Bind for 0.0.0.0:3000 failed: port is already allocated"**

Solutions:
- Change port in `docker-compose.yml`
- Stop conflicting service: `sudo lsof -ti:3000 | xargs kill`
- Use different port mapping: `"8080:80"`

### Build Failures

1. **Clear Docker cache:**
   ```bash
   docker-compose down
   docker system prune -a
   docker-compose build --no-cache
   ```

2. **Check Dockerfile syntax:**
   ```bash
   docker build -t test-backend ./backend
   docker build -t test-frontend ./frontend
   ```

### Container Keeps Restarting

1. **Check logs for errors:**
   ```bash
   docker-compose logs --tail=50 backend
   ```

2. **Disable restart policy temporarily:**
   ```yaml
   restart: "no"  # in docker-compose.yml
   ```

3. **Run container interactively:**
   ```bash
   docker-compose run --rm backend sh
   ```

## 📦 Production Deployment

### Security Best Practices

1. **Change JWT Secret:**
   ```bash
   # Generate secure random string
   openssl rand -base64 32
   ```

2. **Use environment-specific .env files:**
   ```bash
   .env.production
   .env.staging
   ```

3. **Enable HTTPS with reverse proxy (nginx/traefik)**

4. **Set secure CORS origins:**
   ```env
   CORS_ORIGIN=https://your-domain.com
   ```

### Scaling

Scale services horizontally:

```bash
# Run 3 backend instances
docker-compose up -d --scale backend=3

# Use load balancer (nginx/traefik) in front
```

### Monitoring

Add monitoring with Docker stats:

```bash
# View resource usage
docker stats

# View specific container
docker stats costsplit-backend
```

## 🧹 Cleanup

### Remove All Containers and Images

```bash
# Stop and remove containers
docker-compose down

# Remove images
docker-compose down --rmi all

# Remove everything including volumes
docker-compose down -v --rmi all

# Clean up Docker system
docker system prune -a --volumes
```

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [MongoDB Connection String Format](https://docs.mongodb.com/manual/reference/connection-string/)
- [Nginx Docker Documentation](https://hub.docker.com/_/nginx)
- [Node.js Docker Best Practices](https://github.com/nodejs/docker-node/blob/main/docs/BestPractices.md)

## 🆘 Getting Help

If you encounter issues:

1. Check logs: `docker-compose logs`
2. Verify configuration: `docker-compose config`
3. Test MongoDB connection separately
4. Review environment variables in `.env`
5. Open an issue on GitHub with:
   - Error messages from logs
   - Your `docker-compose.yml` (sanitized)
   - Docker version: `docker --version`
   - OS information

## 📄 License

This project is licensed under the MIT License.
