# Deployment Guide — 3 BOXES LUXURY

This guide covers deploying the 3 BOXES LUXURY Next.js storefront to **Vercel** and connecting it with your **Shopify** store at 3boxesluxury.com.

---

## Step 1: Fork / Clone the Repository

```bash
git clone https://github.com/pmkshar/3-boxes-luxury.git
cd 3-boxes-luxury
```

Or fork the repo on GitHub and clone your fork.

---

## Step 2: Create a Vercel Project

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account.
2. Click **"Add New Project"**.
3. Import the `3-boxes-luxury` repository from GitHub.
4. Vercel will auto-detect the Next.js framework — confirm it shows **Next.js**.
5. The `vercel.json` in the repo root configures:
   - **Framework**: `nextjs`
   - **Build Command**: `npm run build`
   - **Region**: `bom1` (Mumbai, India — closest to your customer base)
   - **API Cache Headers**: `no-cache, no-store, must-revalidate` for all `/api/*` routes
6. Do **not** deploy yet — set environment variables first (Step 3).

---

## Step 3: Set Environment Variables in Vercel

In the Vercel project dashboard, go to **Settings → Environment Variables** and add all variables from `.env.example`:

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | Prisma database connection string | `file:./db/custom.db` (SQLite) or PostgreSQL URL |
| `SHOPIFY_STORE_DOMAIN` | Your Shopify store domain | `3boxesluxury-2.myshopify.com` |
| `SHOPIFY_STOREFRONT_TOKEN` | Storefront API access token | `a1b2c3d4e5f6...` |
| `SHOPIFY_API_VERSION` | Shopify API version | `2025-01` |
| `SHOPIFY_ADMIN_TOKEN` | Admin API access token | `shpat_xxxxxxxxxxxx` |
| `SHOPIFY_WEBHOOK_SECRET` | Webhook HMAC secret | (from Shopify webhook registration) |
| `APP_URL` | Your public app URL | `https://3boxesluxury.com` |
| `NEXTAUTH_URL` | NextAuth callback URL | `https://3boxesluxury.com` |
| `NEXTAUTH_SECRET` | Random secret for NextAuth | Generate with `openssl rand -base64 32` |
| `GEMINI_API_KEY` | Google Gemini API key (optional) | `AIza...` |
| `ZAI_BASE_URL` | AI service base URL (required for Try-On, AI Assistant, etc.) | `https://your-ai-api.example.com/v1` |
| `ZAI_API_KEY` | AI service API key | `Z.ai` |

> **Important**: Set all variables for **Production**, **Preview**, and **Development** environments.

> **AI Service Configuration**: The app uses `z-ai-web-dev-sdk` for AI features (Virtual Try-On, AI Assistant, Gift Recommendations, Product Import). You can configure it two ways:
> 1. **Environment variables** (recommended for Vercel/Docker): Set `ZAI_BASE_URL` and `ZAI_API_KEY`
> 2. **Config file** (for local dev only): Create `.z-ai-config` in the project root with `{"baseUrl":"...","apiKey":"..."}`
>
> The shared utility at `src/lib/zai.ts` handles both methods automatically — env vars take priority over the config file.

---

## Step 4: Configure the Database

### Option A: SQLite (for small stores / MVP)

SQLite works out of the box with the default `DATABASE_URL`:

```
DATABASE_URL=file:./db/custom.db
```

**Limitations on Vercel**:
- Vercel's serverless functions have an **ephemeral filesystem** — the SQLite database is **reset on each deployment**.
- For persistence across deploys, you'd need to use Vercel Blob or another persistent storage.
- SQLite is **not recommended for production** on Vercel.

### Option B: PostgreSQL (recommended for production)

1. Create a PostgreSQL database (recommended providers):
   - **Vercel Postgres** — native integration, easiest setup
   - **Neon** — serverless PostgreSQL with branching
   - **Supabase** — PostgreSQL with real-time features
   - **Railway** — simple PostgreSQL hosting

2. Update `DATABASE_URL` in Vercel environment variables:
   ```
   DATABASE_URL=postgresql://user:password@host:5432/dbname?sslmode=require
   ```

3. Update `prisma/schema.prisma` — change the datasource provider:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```

4. Run migrations:
   ```bash
   npx prisma migrate dev --name init
   npx prisma db seed
   ```

5. Commit the updated `schema.prisma` and `migrations/` directory.

---

## Step 5: Configure Shopify API Access

### 5.1 Create a Shopify App

1. Go to **Shopify Admin → Settings → Apps → Develop apps**.
2. Click **"Create an app"**.
3. Name it (e.g., "3 Boxes Luxury Headless Storefront").

### 5.2 Configure Storefront API

1. In the app settings, go to **API credentials**.
2. Under **Storefront API**, check these scopes:
   - ✅ `unauthenticated_read_product_listings`
   - ✅ `unauthenticated_read_product_inventory`
   - ✅ `unauthenticated_write_checkouts`
   - ✅ `unauthenticated_read_checkouts`
3. Click **"Save"** and copy the **Storefront API access token**.
4. Set it as `SHOPIFY_STOREFRONT_TOKEN` in Vercel env vars.

### 5.3 Configure Admin API

1. In the same app, under **Admin API**, check these scopes:
   - ✅ `read_products`
   - ✅ `write_products`
   - ✅ `read_custom_collections`
   - ✅ `write_custom_collections`
   - ✅ `read_orders`
   - ✅ `write_orders`
2. Click **"Save"** and copy the **Admin API access token** (starts with `shpat_`).
3. Set it as `SHOPIFY_ADMIN_TOKEN` in Vercel env vars.

### 5.4 Install the App

Click **"Install app"** in the Shopify admin to activate the API credentials.

---

## Step 6: Register Shopify Webhooks

After the first successful deployment, register webhooks so Shopify notifies your app of product/order changes:

```bash
curl -X POST https://3boxesluxury.com/api/shopify/webhooks/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

This registers webhooks for:
- `products/create`
- `products/update`
- `products/delete`
- `orders/create`
- `orders/updated`
- `app/uninstalled`

Alternatively, register manually in **Shopify Admin → Settings → Notifications → Webhooks** with your endpoint URL:
```
https://3boxesluxury.com/api/shopify/webhooks
```

---

## Step 7: Disable Shopify Password Protection

If your Shopify store has password protection enabled (common for stores under development):

1. Go to **Shopify Admin → Online Store → Preferences**.
2. Uncheck **"Enable password page"** or remove the password.
3. This ensures your headless storefront can access Shopify's Storefront API without issues.

> **Note**: Even with password protection disabled on Shopify, your headless storefront at 3boxesluxury.com handles its own access control. The Shopify password page only affects the default Shopify Online Store theme, not the Storefront API.

---

## Step 8: Configure Custom Domain (3boxesluxury.com)

### 8.1 Add Domain in Vercel

1. Go to **Vercel Dashboard → Your Project → Settings → Domains**.
2. Click **"Add Domain"** and enter `3boxesluxury.com`.
3. Also add `www.3boxesluxury.com` (redirect to the apex domain).
4. Vercel will show you the DNS records to configure.

### 8.2 Update DNS Records

In your domain registrar's DNS settings, add:

| Type  | Name | Value |
|-------|------|-------|
| A     | `@`  | `76.76.21.21` (Vercel's IP) |
| CNAME | `www` | `cname.vercel-dns.com` |

### 8.3 Update Shopify Domain Settings

1. Go to **Shopify Admin → Settings → Domains**.
2. If 3boxesluxury.com was previously connected to Shopify's Online Store, you need to:
   - **Disconnect** it from Shopify's DNS (so it points to Vercel instead).
   - Keep the `.myshopify.com` domain as the primary for Shopify Admin access.
3. The Shopify Storefront API works independently of the domain — it uses the `.myshopify.com` domain internally.

### 8.4 SSL Certificate

Vercel automatically provisions SSL certificates for custom domains. Once DNS is configured, your site will be available at `https://3boxesluxury.com` within minutes.

---

## Step 9: Deploy and Verify

1. **Trigger a deployment** by pushing to the `main` branch, or click **"Redeploy"** in Vercel.
2. **Verify the build logs** — ensure `prisma generate` runs during `postinstall` and `next build` succeeds.
3. **Test the live site**:
   - Homepage loads at `https://3boxesluxury.com`
   - Products display from Shopify Storefront API
   - Cart and checkout redirect to Shopify checkout
   - Admin dashboard works at `https://3boxesluxury.com/#admin`

---

## Troubleshooting

### Build Fails with Prisma Errors
- Ensure `DATABASE_URL` is set correctly in Vercel.
- The `postinstall` script runs `prisma generate` automatically.
- For PostgreSQL, ensure `sslmode=require` is in the connection string.

### Shopify API Returns 401/403
- Verify `SHOPIFY_STOREFRONT_TOKEN` and `SHOPIFY_ADMIN_TOKEN` are correct.
- Ensure the app is **installed** (not just created) in Shopify Admin.
- Check that the correct API scopes are enabled.

### Products Not Showing
- Run a sync from Shopify: Visit the admin dashboard → Shopify tab → "Sync from Shopify".
- Or call the API: `POST https://3boxesluxury.com/api/shopify/sync` with `{ "direction": "shopify-to-local" }`.

### Checkout Not Working
- Ensure products have `shopifyVariantId` set (check in admin → Shopify tab → Product Mapping).
- Verify `SHOPIFY_STORE_DOMAIN` and `SHOPIFY_STOREFRONT_TOKEN` are correct.

### Database Is Empty After Redeploy (SQLite)
- This is expected — Vercel's serverless filesystem is ephemeral.
- Switch to PostgreSQL (Step 4, Option B) for production.

---

## Architecture Summary

```
3boxesluxury.com (Vercel)
  └── Next.js 16 App
       ├── Storefront API ──→ Shopify (products, checkout)
       ├── Admin API ───────→ Shopify (push/pull sync)
       ├── Prisma ORM ──────→ PostgreSQL / SQLite
       └── NextAuth ────────→ JWT sessions
```

---

## Security Checklist

- [ ] All environment variables set in Vercel (never committed to Git)
- [ ] `NEXTAUTH_SECRET` is a strong random value
- [ ] `SHOPIFY_ADMIN_TOKEN` starts with `shpat_` and has minimum required scopes
- [ ] Shopify webhooks use HMAC verification (`SHOPIFY_WEBHOOK_SECRET`)
- [ ] Admin routes protected with `requireAdmin` middleware
- [ ] Image proxy has domain allowlist (SSRF protection)
- [ ] Password hashing uses bcrypt (not SHA-256)
- [ ] `.env` files are in `.gitignore`
