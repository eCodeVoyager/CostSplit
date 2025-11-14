# CostSplit Frontend

Modern React-based frontend for CostSplit - Shared Expense Manager built with Vite, React, shadcn/ui, and TailwindCSS.

## Features

- Clean, modern UI with light theme
- Responsive design
- Real-time expense tracking
- Balance calculation visualization
- Settlement instructions
- Toast notifications
- Protected routes

## Tech Stack

- **React 18** - UI library
- **Vite** - Build tool
- **React Router** - Routing
- **TailwindCSS** - Styling
- **shadcn/ui** - UI components
- **Radix UI** - Headless UI primitives
- **Lucide React** - Icons
- **Axios** - HTTP client
- **Jest** - Testing

## Installation

```bash
cd frontend
npm install
```

## Configuration

Create a `.env` file:

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_API_URL=http://localhost:5000/api
```

## Running the Application

```bash
# Development mode
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

The app will be available at `http://localhost:3000`

## Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── ui/           # shadcn/ui components
│   ├── pages/            # Page components
│   │   ├── Login.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Members.jsx
│   │   ├── Expenses.jsx
│   │   └── Balances.jsx
│   ├── lib/              # Utilities
│   │   ├── api.js        # API client
│   │   └── utils.js      # Helper functions
│   ├── hooks/            # Custom hooks
│   ├── tests/            # Jest tests
│   ├── App.jsx           # Main app component
│   ├── main.jsx          # Entry point
│   └── index.css         # Global styles
├── index.html
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Pages

### Login
- Shared credential login
- JWT token storage
- Redirect to dashboard on success

### Dashboard
- Quick stats overview
- Navigation to all features
- Logout functionality

### Members
- Add new members
- View all members
- Delete members
- Member count display

### Expenses
- Add new expenses
- View expense history
- Delete expenses
- Select member who paid
- Set expense date

### Balances
- View member balances
- Settlement instructions
- Visual indicators for positive/negative balances
- Optimized settlement algorithm visualization

## UI Components

Built with shadcn/ui and Radix UI:

- Button
- Card
- Input
- Label
- Select
- Toast notifications

## API Integration

The frontend integrates with the backend API:

- Authentication: `/api/auth/login`, `/api/auth/verify`
- Members: `/api/members`
- Expenses: `/api/expenses`
- Balances: `/api/balances`

All API calls include JWT token authentication.

## License

ISC
