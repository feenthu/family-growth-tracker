# Family Growth Tracker

A comprehensive family bill and mortgage tracking application built with React, TypeScript, Express, and PostgreSQL.

## Features

- **Family Member Management**: Add and manage family members with color-coded identification
- **Bill Tracking**: Track one-time and recurring bills with flexible splitting options
- **Payment Management**: Record payments with receipt storage and allocation tracking
- **Mortgage Management**: Track mortgages with detailed payment breakdowns and amortization
- **Split Calculations**: Flexible splitting by amount, percentage, or shares
- **Dashboard Views**: Family-friendly overview and detailed management interface

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Express.js, TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Deployment**: Railway
- **CI/CD**: GitHub Actions

## Local Development Setup

### Prerequisites

- Node.js 20+
- PostgreSQL database (local or Railway)

### Installation

1. **Clone and install dependencies**
   ```bash
   git clone <your-repo-url>
   cd family-growth-tracker
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```

3. **Configure your `.env` file**
   ```env
   DATABASE_URL="postgresql://username:password@localhost:5432/family_growth_tracker"
   NODE_ENV="development"
   PORT=8080
   SESSION_SECRET="your-secret-key-here"
   ```

   **For Railway PostgreSQL:**
   - Copy the `DATABASE_URL` from your Railway PostgreSQL service variables
   - Update the `.env` file with the Railway database URL

4. **Database Setup**
   ```bash
   # Generate Prisma client
   npm run prisma:generate

   # Run migrations (creates tables)
   npm run db:migrate

   # Seed with demo data
   npm run db:seed
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

   The application will be available at `http://localhost:8080`

## Deployment

### Railway Configuration

Your Railway project requires these environment variables:

| Variable | Value | Source |
|----------|-------|--------|
| `DATABASE_URL` | `postgresql://...` | **Auto-provided by Railway PostgreSQL service** |
| `NODE_ENV` | `production` | **Set manually** |
| `PORT` | `8080` | **Set manually** |
| `SESSION_SECRET` | `your-random-secret-key` | **Set manually** |

### GitHub Secrets

Configure these secrets in your GitHub repository settings:

| Secret | Description | How to Get |
|--------|-------------|------------|
| `RAILWAY_TOKEN` | Railway API token | Create at [railway.app/account/tokens](https://railway.app/account/tokens) |
| `RAILWAY_SERVICE_ID` | Service ID for deployment | Found in Railway service settings |
| `DATABASE_URL` | Database connection string | Copy from Railway PostgreSQL service variables |

### Deployment Process

The app deploys automatically when you push to the `main` branch:

1. **GitHub Actions** runs the build and tests
2. **Prisma migrations** are automatically applied in production
3. **Railway deployment** is triggered with the latest code

To deploy manually:
```bash
git push origin main
```

## Database Schema

The application uses the following main entities:

- **Members**: Family members with color coding
- **Bills**: One-time bills with due dates and splits
- **Recurring Bills**: Template bills that generate instances
- **Payments**: Payment records with allocations
- **Mortgages**: Mortgage details with payment tracking
- **Settings**: Application configuration

## API Endpoints

### Members
- `GET /api/members` - List all members
- `POST /api/members` - Create member
- `DELETE /api/members/:id` - Delete member

### Bills
- `GET /api/bills` - List all bills with payments
- `POST /api/bills` - Create bill
- `PUT /api/bills/:id` - Update bill
- `DELETE /api/bills/:id` - Delete bill

### Payments
- `POST /api/payments` - Create payment
- `PUT /api/payments/:id` - Update payment
- `DELETE /api/payments/:id` - Delete payment

### Recurring Bills
- `GET /api/recurring-bills` - List recurring bills
- `POST /api/recurring-bills` - Create recurring bill
- `PUT /api/recurring-bills/:id` - Update recurring bill
- `DELETE /api/recurring-bills/:id` - Delete recurring bill

### Mortgages
- `GET /api/mortgages` - List mortgages with payments
- `POST /api/mortgages` - Create mortgage
- `PUT /api/mortgages/:id` - Update mortgage
- `DELETE /api/mortgages/:id` - Delete mortgage

### Mortgage Payments
- `POST /api/mortgage-payments` - Create mortgage payment
- `PUT /api/mortgage-payments/:id` - Update mortgage payment
- `DELETE /api/mortgage-payments/:id` - Delete mortgage payment

### Settings
- `GET /api/settings` - Get all settings
- `PUT /api/settings/:key` - Update setting

## NPM Scripts

```bash
# Development
npm run dev                 # Start development server
npm run build              # Build for production
npm run preview           # Preview production build

# Database
npm run prisma:generate   # Generate Prisma client
npm run db:migrate        # Run migrations (dev)
npm run db:deploy         # Deploy migrations (prod)
npm run db:seed           # Seed database with demo data

# Server
npm run start             # Start production server
```

## Project Structure

```
family-growth-tracker/
├── src/                          # Frontend React app
│   ├── components/              # React components
│   ├── hooks/                   # Custom hooks
│   ├── utils/                   # Utility functions
│   └── types/                   # TypeScript type definitions
├── prisma/
│   ├── schema.prisma           # Database schema
│   └── seed.ts                 # Seed data
├── server.ts                   # Express server
├── .github/workflows/          # GitHub Actions
└── package.json               # Dependencies and scripts
```

## Contributing

1. Create a feature branch from `main`
2. Make your changes
3. Test locally with `npm run dev`
4. Push to your branch
5. Create a Pull Request

The app will automatically deploy when your PR is merged to `main`.

## Troubleshooting

### Common Issues

**Database Connection Failed**
- Verify `DATABASE_URL` in your environment
- Ensure PostgreSQL service is running (Railway or local)
- Check if migrations need to be run: `npm run db:deploy`

**Build Failures**
- Clear node_modules: `rm -rf node_modules && npm install`
- Regenerate Prisma client: `npm run prisma:generate`
- Check TypeScript errors: `npm run build`

**Railway Deployment Issues**
- Verify all required environment variables are set
- Check Railway service logs for specific errors
- Ensure `RAILWAY_TOKEN` and `RAILWAY_SERVICE_ID` secrets are correct

### Getting Help

- Check Railway service logs for backend issues
- Use browser dev tools for frontend debugging
- Verify all environment variables are properly set