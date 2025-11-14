# CostSplit - Shared Expense Manager

A complete MERN stack application for managing shared expenses among groups. Perfect for roommates, travel groups, or any shared spending scenarios.

## Overview

CostSplit is a simple yet powerful expense sharing manager that allows groups to:
- Track shared expenses
- Automatically calculate who owes whom
- Generate settlement instructions
- Manage group members dynamically
- View detailed balance summaries

## Features

### Core Features
- **Single Shared Authentication** - One login for the entire group
- **Member Management** - Add/remove members dynamically
- **Expense Tracking** - Record expenses with who paid
- **Automatic Balance Calculation** - Smart algorithm calculates balances
- **Settlement Generation** - Optimized "who owes whom" instructions
- **Clean Modern UI** - Built with shadcn/ui and TailwindCSS
- **Responsive Design** - Works on all devices
- **Comprehensive Tests** - Full Jest test coverage

### Advanced Features
- **Enhanced Dashboard** - Quick actions, recent expenses, members preview, and average expense stats
- **Expense Search** - Real-time search by title or member name
- **Date Filtering** - View expenses by Today, This Week, This Month, or All Time
- **CSV Export** - Download filtered expenses for external analysis
- **Copy Settlements** - One-click copy settlement instructions to clipboard
- **Smart Filtering** - Shows filtered count and easy filter clearing
- **Loading States** - Smooth loading indicators throughout
- **Empty States** - Helpful messages and call-to-actions

### How It Works

1. **Add Members** - Start by adding group members
2. **Track Expenses** - Record expenses with amount and who paid
3. **View Balances** - System calculates balances automatically
4. **Settle Up** - Follow settlement instructions to clear debts

## Tech Stack

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Jest** - Testing framework

### Frontend
- **React 18** - UI library
- **Vite** - Build tool
- **React Router** - Routing
- **TailwindCSS** - Styling
- **shadcn/ui** - UI components
- **Radix UI** - Headless UI primitives
- **Lucide React** - Icon library
- **Axios** - HTTP client
- **Jest** - Testing framework

## Project Structure

```
CostSplit/
├── backend/
│   ├── src/
│   │   ├── config/         # Database configuration
│   │   ├── controllers/    # Request handlers
│   │   ├── middleware/     # Authentication middleware
│   │   ├── models/         # Mongoose models
│   │   ├── routes/         # API routes
│   │   ├── tests/          # Jest tests
│   │   └── utils/          # Balance calculation logic
│   ├── server.js           # Entry point
│   ├── package.json
│   └── .env
│
├── frontend/
│   ├── src/
│   │   ├── components/     # UI components
│   │   │   └── ui/         # shadcn/ui components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # API client & utilities
│   │   ├── hooks/          # Custom React hooks
│   │   └── tests/          # Jest tests
│   ├── index.html
│   ├── vite.config.js
│   ├── tailwind.config.js
│   └── package.json
│
└── README.md
```

## Installation

You can run CostSplit either **using Docker** (recommended for quick setup) or **manually** (traditional setup).

### 🐳 Option 1: Docker Setup (Recommended)

**Prerequisites:**
- Docker and Docker Compose installed
- External MongoDB database (local, Atlas, or remote)

**Quick Start:**

```bash
# 1. Clone repository
git clone https://github.com/eCodeVoyager/CostSplit.git
cd CostSplit

# 2. Create .env file
cp .env.example .env
# Edit .env and configure your MongoDB connection

# 3. Start with Docker
docker-compose up -d

# 4. Access the application
# Frontend: http://localhost:3000
# Backend: http://localhost:5000
```

**📚 Full Docker documentation:** See [DOCKER.md](./DOCKER.md) for complete Docker setup guide, troubleshooting, and advanced configurations.

---

### 💻 Option 2: Manual Setup

**Prerequisites:**
- Node.js (v16 or higher)
- MongoDB (local or cloud instance)
- npm or yarn

### Backend Setup

```bash
cd backend
npm install
```

Create `.env` file:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/costsplit
JWT_SECRET=your_jwt_secret_key_here
SHARED_USERNAME=admin
SHARED_PASSWORD=1234
NODE_ENV=development
```

Start MongoDB:
```bash
# If using local MongoDB
mongod
```

Run backend:
```bash
# Development mode
npm run dev

# Production mode
npm start

# Run tests
npm test
```

### Frontend Setup

```bash
cd frontend
npm install
```

Create `.env` file:
```
VITE_API_URL=http://localhost:5000/api
```

Run frontend:
```bash
# Development mode
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

## Usage

1. **Start the backend server** (on port 5000)
2. **Start the frontend** (on port 3000)
3. **Open browser** at `http://localhost:3000`
4. **Login** with default credentials: `admin` / `1234`
5. **Add members** to your group
6. **Add expenses** as they occur
7. **View balances** to see who owes what
8. **Follow settlement instructions** to settle up

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with shared credentials
- `GET /api/auth/verify` - Verify JWT token

### Members
- `GET /api/members` - Get all active members
- `GET /api/members/count` - Get member count
- `POST /api/members` - Create new member
- `DELETE /api/members/:id` - Delete member

### Expenses
- `GET /api/expenses` - Get all expenses (with optional filters)
- `GET /api/expenses/stats` - Get expense statistics
- `POST /api/expenses` - Create new expense
- `DELETE /api/expenses/:id` - Delete expense

### Balances
- `GET /api/balances` - Get balances and settlement instructions

## Balance Calculation Logic

### How Balances Work

When an expense is added:
1. The payer is credited the full amount
2. All members (including payer) are debited their equal share
3. Net balance is calculated for each member

**Example:**
- 4 members: Ehsan, Sakib, Rafi, Nabil
- Expense: 1000৳ paid by Ehsan
- Share per person: 1000 ÷ 4 = 250৳

**Balances:**
- Ehsan: +1000 (paid) - 250 (share) = +750 (should receive)
- Sakib: 0 (paid) - 250 (share) = -250 (owes)
- Rafi: 0 (paid) - 250 (share) = -250 (owes)
- Nabil: 0 (paid) - 250 (share) = -250 (owes)

### Settlement Algorithm

Uses a greedy algorithm to minimize transactions:
1. Separate creditors (positive balance) and debtors (negative balance)
2. Sort both by amount
3. Match largest debtor with largest creditor
4. Continue until all balances are settled

## Testing

### Backend Tests
```bash
cd backend
npm test
```

Tests cover:
- Balance calculation logic
- Settlement generation
- Authentication
- API endpoints

### Frontend Tests
```bash
cd frontend
npm test
```

Tests cover:
- Utility functions
- Component rendering
- User interactions

## Design Principles

1. **Simplicity** - Single shared login, no complex permissions
2. **Accuracy** - Precise balance calculations
3. **Transparency** - Clear settlement instructions
4. **Flexibility** - Dynamic member management
5. **Modern UI** - Clean, professional design

## Future Enhancements

- Reset/archive expenses
- Export to CSV/PDF
- Date range filters
- Multiple groups/trips
- Currency selection
- Expense categories
- Receipt photo upload
- Email notifications
- Mobile app

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

ISC

## Author

Built with ❤️ for simplifying shared expenses

---

**Note:** This is a complete, production-ready MERN application with modern best practices, clean code, comprehensive tests, and professional UI design.
