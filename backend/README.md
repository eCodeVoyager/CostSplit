# CostSplit Backend

Backend API for CostSplit - Shared Expense Manager built with Node.js, Express, and MongoDB.

## Features

- Single shared authentication
- Member management (add/remove members)
- Expense tracking
- Automatic balance calculation
- Settlement generation (who owes whom)
- RESTful API design

## Tech Stack

- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **Jest** - Testing

## Installation

```bash
cd backend
npm install
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/costsplit
JWT_SECRET=your_jwt_secret_key_here
SHARED_USERNAME=admin
SHARED_PASSWORD=1234
NODE_ENV=development
```

## Running the Server

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - Login with shared credentials
- `GET /api/auth/verify` - Verify token validity

### Members
- `GET /api/members` - Get all members
- `GET /api/members/count` - Get member count
- `POST /api/members` - Create new member
- `DELETE /api/members/:id` - Delete member

### Expenses
- `GET /api/expenses` - Get all expenses
- `GET /api/expenses/stats` - Get expense statistics
- `POST /api/expenses` - Create new expense
- `DELETE /api/expenses/:id` - Delete expense

### Balances
- `GET /api/balances` - Get balances and settlements

## Project Structure

```
backend/
├── src/
│   ├── config/         # Configuration files
│   ├── controllers/    # Request handlers
│   ├── middleware/     # Custom middleware
│   ├── models/         # Mongoose models
│   ├── routes/         # API routes
│   ├── tests/          # Jest tests
│   └── utils/          # Utility functions
├── server.js           # Entry point
├── package.json
└── .env
```

## License

ISC
