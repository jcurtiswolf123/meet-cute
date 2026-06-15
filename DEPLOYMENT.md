# Meet Cute Deployment Guide

## Local Development

The app runs perfectly locally with SQLite:

```bash
npm install
npm run db:reset     # Create and seed SQLite database
npm run dev          # Start at http://localhost:3009
```

## Vercel Deployment

Meet Cute is deployed at: **https://meet-cute-vert.vercel.app**

GitHub repo: https://github.com/jcurtiswolf123/meet-cute

### Setup Steps

1. **Create PostgreSQL Database** (required for Vercel persistence)
   - Use Neon (recommended, free tier): https://neon.tech
   - Or Supabase: https://supabase.com
   - Copy the connection string

2. **Configure Vercel Environment**
   ```bash
   vercel env add DATABASE_URL production --value "postgresql://user:pass@host/dbname"
   ```

3. **Update Prisma Schema for Production**
   - Change `prisma/schema.prisma` datasource to PostgreSQL:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

4. **Deploy**
   ```bash
   git push origin main
   # Vercel auto-deploys; migrations run automatically
   ```

## Database Switching

The app uses the same Prisma schema for both SQLite (local) and PostgreSQL (production). To switch:

1. **For PostgreSQL**: Update `prisma/schema.prisma` provider line
2. **For SQLite**: Revert to `provider = "sqlite"`
3. Run `npm run db:reset` to create/seed locally

## Why SQLite Local / PostgreSQL Vercel?

- **SQLite**: Simple, no external dependencies, perfect for local dev and testing
- **PostgreSQL**: Required for Vercel because serverless Lambda functions have ephemeral filesystem

## Next Steps

- Wire Twilio SMS for concierge messages (replace `say` in `src/lib/concierge.ts`)
- Add Airtable sync layer (mirrors same data model)
- Set up 15-min cron for `npm run concierge:tick`
