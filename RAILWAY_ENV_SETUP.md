# Railway Environment Variables Setup

## Required Environment Variables

The following environment variables need to be set in your Railway project:

### Database Configuration
```bash
DATABASE_URL="postgresql://username:password@host:port/database"
```
- **Required**: Yes
- **Description**: PostgreSQL connection string for Prisma
- **Source**: Automatically provided by Railway PostgreSQL service
- **Example**: `postgresql://postgres:password@railway-postgres.railway.app:5432/railway`

### Application Configuration
```bash
NODE_ENV="production"
```
- **Required**: Yes for production
- **Description**: Sets the application environment
- **Values**: `development` | `production`

### Port Configuration (Optional)
```bash
PORT="8080"
```
- **Required**: No (Railway sets this automatically)
- **Description**: Port for the Express server
- **Default**: 8080

## Setting Environment Variables in Railway

1. **Via Railway Dashboard**:
   - Go to your project dashboard
   - Click on "Variables" tab
   - Add each variable with name and value

2. **Via Railway CLI**:
   ```bash
   railway variables set NODE_ENV=production
   railway variables set DATABASE_URL=your_connection_string
   ```

## Database Setup

If you're getting "Failed to fetch members" errors, it's likely because:

1. **Database not connected**: Ensure Railway PostgreSQL service is linked
2. **Migrations not run**: Database tables may not exist
3. **Connection string incorrect**: Check DATABASE_URL format

### Running Migrations on Railway

Railway automatically runs migrations via the startup script in `server.ts`:

```typescript
if (process.env.NODE_ENV === 'production') {
  execSync('npx prisma migrate deploy', { stdio: 'inherit' })
}
```

### Manual Migration (if needed)

You can manually run migrations via Railway CLI:

```bash
railway connect
npx prisma migrate deploy
```

## Troubleshooting

### "Failed to fetch members" Error
1. Check DATABASE_URL is correctly set
2. Verify PostgreSQL service is running
3. Ensure migrations have been applied
4. Check server logs for Prisma connection errors

### App Shows Default Data
This is normal behavior when:
- Database is empty (first time setup)
- API connection fails (offline mode)
- Migrations haven't been applied yet

The app is designed to be fault-tolerant and work with default data until the API is available.