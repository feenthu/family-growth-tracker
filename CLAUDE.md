# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Family Budget Tracker app that allows household members to manage shared expenses, recurring bills, mortgage payments, and track financial obligations across multiple devices. The app is transitioning from localStorage-based storage to PostgreSQL with API persistence for multi-device synchronization.

**Current Migration Status**: Backend complete, frontend integration in progress (see MIGRATION_PROGRESS.md for details).

## Development Commands

**Local Development:**
```bash
npm install           # Install dependencies
npm run dev          # Start Vite dev server (frontend only)
npm start            # Start Express API server
npm run build        # Build for production
npm run preview      # Preview production build
```

**Database Commands:**
```bash
npm run prisma:generate    # Generate Prisma client
npm run db:migrate        # Run database migrations (dev)
npm run db:deploy         # Deploy migrations (production)
npm run db:seed           # Seed database with test data
```

**Quality Assurance:**
```bash
npm run type-check        # TypeScript type checking
npm run lint             # Lint code (placeholder)
npm test                 # Run tests (placeholder)
npm run ci               # Run full CI pipeline locally
```

## Architecture

### Backend (Express + Prisma + PostgreSQL)
- **Entry Point**: `server.ts` - Express server with REST API endpoints
- **Database**: PostgreSQL via Prisma ORM with comprehensive schema for:
  - Members (family members)
  - Bills with splits and payments
  - Recurring bills with automatic generation
  - Mortgages with payment breakdowns
  - Settings for app configuration
- **API Routes**: All routes prefixed with `/api/` and include rate limiting
- **Deployment**: Railway with automatic migrations in production

### Frontend (React + Vite + TypeScript)
- **Entry Point**: `index.tsx` renders `App.tsx`
- **Current State**: Uses `useLocalStorage` hook for data persistence
- **Target State**: Should use API hooks for PostgreSQL persistence
- **Components**: Modular component structure in `components/` directory
- **Types**: Shared TypeScript interfaces in `types.ts`
- **Utilities**: Calculation helpers in `utils/` directory

### Key Files and Directories
- `server.ts` - Express API server with all REST endpoints
- `prisma/schema.prisma` - Complete database schema
- `utils/api.ts` - TypeScript API client (complete but unused)
- `hooks/useLocalStorage.ts` - Current data persistence (to be replaced)
- `App.tsx` - Main React component with all localStorage usage
- `components/` - React components for different app sections
- `utils/calculations.ts` - Financial calculation utilities
- `MIGRATION_PROGRESS.md` - Detailed migration status and remaining work

## Data Architecture

### Frontend Types vs API Types
The app has two parallel type systems that need to be unified:
- **Frontend types** (in `types.ts`): Used with localStorage, money as `number`
- **API types** (in `utils/api.ts`): Used with PostgreSQL, money as `amountCents: number`

Key differences:
- Money: Frontend uses `amount: number`, API uses `amountCents: number`
- IDs: Both use `string` but may have different generation patterns
- Field names: Some snake_case vs camelCase differences

### Critical Data Relationships
- Bills can be one-time or generated from RecurringBills
- Payments are linked to Bills with allocations to Members
- Mortgages have complex payment breakdowns (principal/interest/escrow)
- All entities support flexible split modes (amount/percent/shares)

## Development Workflow

### Current Migration Priority
1. **Create API hooks** in `hooks/useApiData.ts` to replace `useLocalStorage` calls
2. **Update App.tsx** to use API hooks instead of localStorage
3. **Add loading/error states** for async operations
4. **Test multi-device synchronization**

### Code Patterns
- Use existing calculation utilities in `utils/calculations.ts`
- Follow established component patterns in `components/` directory
- Maintain TypeScript strict typing throughout
- Use Prisma's type-safe client for database operations

### Railway Deployment
- Production URL: `https://family-growth-tracker-production.up.railway.app/`
- Automatic deployments from `main` branch via GitHub Actions
- Environment variables managed through Railway dashboard
- Database migrations run automatically on deployment

## Testing and Quality

### Current Gaps
- No actual test suite implemented (placeholders exist)
- No linting configuration (placeholders exist)
- Type checking via `tsc --noEmit` only

### CI/CD Pipeline
Enterprise-grade GitHub Actions workflow includes:
- PostgreSQL service for integration tests
- Type checking, linting, and testing
- Security scanning with `audit-ci`
- Automated Railway deployment
- Post-deployment health checks

## Important Notes

- Always run `npm run type-check` before committing changes
- Database schema changes require new Prisma migrations
- The app uses rate limiting - be mindful of API call frequency during development
- Money is stored as cents in the database to avoid floating-point precision issues
- The frontend currently has password protection for "manager mode" vs "family view"