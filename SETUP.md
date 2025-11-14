# Quick Setup Guide

## Prerequisites

Before you begin, make sure you have the following installed:
- **Node.js** (v16 or higher) - [Download](https://nodejs.org/)
- **MongoDB** - [Download](https://www.mongodb.com/try/download/community) or use MongoDB Atlas (cloud)
- **npm** (comes with Node.js)

## Step-by-Step Setup

### 1. Install Dependencies

From the root directory:

```bash
# Install all dependencies (backend + frontend)
cd backend && npm install
cd ../frontend && npm install
```

Or use the convenience script:
```bash
npm run install:all
```

### 2. Setup MongoDB

**Option A: Local MongoDB**
```bash
# Start MongoDB
mongod
```

**Option B: MongoDB Atlas (Cloud)**
1. Create account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a free cluster
3. Get connection string
4. Use it in backend `.env` file

### 3. Configure Environment Variables

**Backend** (`backend/.env`):
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/costsplit
JWT_SECRET=your_jwt_secret_key_here_change_in_production
SHARED_USERNAME=admin
SHARED_PASSWORD=1234
NODE_ENV=development
```

**Frontend** (`frontend/.env`):
```
VITE_API_URL=http://localhost:5000/api
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm run dev
```

Or run both concurrently (from root):
```bash
npm run dev
```

### 5. Access the Application

Open your browser and navigate to:
```
http://localhost:3000
```

**Default Login Credentials:**
- Username: `admin`
- Password: `1234`

## Testing

**Backend Tests:**
```bash
cd backend
npm test
```

**Frontend Tests:**
```bash
cd frontend
npm test
```

**All Tests:**
```bash
npm test
```

## Verification Checklist

- [ ] MongoDB is running
- [ ] Backend server started on port 5000
- [ ] Frontend dev server started on port 3000
- [ ] Can access http://localhost:3000
- [ ] Can login with default credentials
- [ ] Can add members
- [ ] Can add expenses
- [ ] Can view balances

## Troubleshooting

### MongoDB Connection Error
- Make sure MongoDB is running: `mongod`
- Check MongoDB URI in `backend/.env`
- For Atlas, check network access and whitelist your IP

### Port Already in Use
- Backend: Change `PORT` in `backend/.env`
- Frontend: Change port in `frontend/vite.config.js`

### Module Not Found Errors
- Run `npm install` in both backend and frontend directories
- Delete `node_modules` and `package-lock.json`, then reinstall

### API Connection Error
- Make sure backend is running
- Check `VITE_API_URL` in `frontend/.env`
- Check CORS settings in `backend/server.js`

## Production Deployment

### Backend
```bash
cd backend
npm start
```

### Frontend
```bash
cd frontend
npm run build
npm run preview
```

## Next Steps

1. Change default credentials in `backend/.env`
2. Update `JWT_SECRET` to a secure random string
3. Add your team members
4. Start tracking expenses!

## Support

For issues or questions:
- Check the main README.md
- Review the code documentation
- Check MongoDB connection
- Verify all environment variables are set correctly

---

**Happy expense tracking!** 🎉
