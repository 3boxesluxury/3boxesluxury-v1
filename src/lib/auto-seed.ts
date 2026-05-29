/**
 * Auto-Seed Utility for Vercel Deployment
 *
 * On Vercel, SQLite is ephemeral — the database resets on every cold start.
 * This module automatically:
 *   1. Creates the database schema using `prisma db push` (if tables don't exist)
 *   2. Seeds the database on the first API request if it detects zero categories
 *
 * Using `prisma db push` instead of raw SQL ensures the schema always matches
 * the Prisma schema.prisma exactly — no missing tables or column mismatches.
 */

import { db } from './db'
import { execSync } from 'child_process'

let seedPromise: Promise<void> | null = null
let isSeeded = false
let schemaEnsured = false

/**
 * Create the database schema using Prisma's own db push mechanism.
 * This ensures 100% parity with schema.prisma — no missing tables or columns.
 */
async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return

  // Quick check: does the Category table already exist?
  try {
    await db.$queryRaw`SELECT 1 FROM Category LIMIT 1`
    schemaEnsured = true
    return
  } catch {
    // Table doesn't exist — need to create schema
  }

  console.log('[auto-seed] Creating database schema via prisma db push...')

  try {
    // On Vercel, DATABASE_URL points to /tmp/3boxes-dev.db
    // We need to push the schema to that database
    const dbUrl = process.env.DATABASE_URL
    console.log(`[auto-seed] Pushing schema to: ${dbUrl}`)

    // Run prisma db push — this creates all tables from schema.prisma
    execSync('npx prisma db push --skip-generate --accept-data-loss 2>&1', {
      env: { ...process.env, DATABASE_URL: dbUrl },
      stdio: 'pipe',
      timeout: 30000,
    })

    schemaEnsured = true
    console.log('[auto-seed] Schema created successfully via prisma db push')
  } catch (pushError: any) {
    console.error('[auto-seed] prisma db push failed, falling back to raw SQL:', pushError.message)

    // Fallback: create essential tables with raw SQL
    // This is a simplified version covering only the tables needed for login/seed
    await createEssentialTablesRaw()
    schemaEnsured = true
    console.log('[auto-seed] Schema created via raw SQL fallback')
  }
}

/**
 * Fallback: create essential tables using raw SQL.
 * Only covers tables needed for basic functionality (login, categories, products).
 * Other tables will be created if prisma db push succeeds on next cold start.
 */
async function createEssentialTablesRaw(): Promise<void> {
  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Category (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image TEXT,
      shopifyId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Product (
      id TEXT NOT NULL PRIMARY KEY,
      productNumber TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL,
      price REAL NOT NULL,
      compareAtPrice REAL,
      costPrice REAL,
      sku TEXT,
      images TEXT NOT NULL,
      categoryId TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      stockStatus TEXT NOT NULL DEFAULT 'in_stock',
      reorderLevel INTEGER NOT NULL DEFAULT 5,
      rating REAL NOT NULL DEFAULT 0,
      reviewCount INTEGER NOT NULL DEFAULT 0,
      featured BOOLEAN NOT NULL DEFAULT false,
      tags TEXT,
      occasions TEXT,
      recipientTypes TEXT,
      relationships TEXT,
      deliveryEstimate TEXT,
      vendorId TEXT,
      sourceUrl TEXT,
      platform TEXT,
      affiliateUrl TEXT,
      affiliateId TEXT,
      commission REAL,
      externalId TEXT,
      lastSyncedAt DATETIME,
      syncStatus TEXT NOT NULL DEFAULT 'active',
      isExternal BOOLEAN NOT NULL DEFAULT false,
      shopifyId TEXT,
      source TEXT,
      shopifyVariantId TEXT,
      shopifyData TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoryId) REFERENCES Category(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS Product_categoryId_idx ON Product(categoryId);
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS Product_slug_idx ON Product(slug);
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS Product_featured_idx ON Product(featured);
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS Product_createdAt_idx ON Product(createdAt);
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT NOT NULL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      password TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      adminRole TEXT,
      corporateRole TEXT,
      avatar TEXT,
      phone TEXT,
      isActive BOOLEAN NOT NULL DEFAULT true,
      emailVerified BOOLEAN NOT NULL DEFAULT false,
      phoneVerified BOOLEAN NOT NULL DEFAULT false,
      twoFactorSecret TEXT,
      twoFactorEnabled BOOLEAN NOT NULL DEFAULT false,
      twoFactorRequired BOOLEAN NOT NULL DEFAULT false,
      approvalStatus TEXT NOT NULL DEFAULT 'pending',
      socialProvider TEXT,
      socialId TEXT,
      resetToken TEXT,
      resetTokenExpiry DATETIME,
      otpCode TEXT,
      otpExpiry DATETIME,
      emailVerifyToken TEXT,
      emailVerifyExpiry DATETIME,
      phoneVerifyCode TEXT,
      phoneVerifyExpiry DATETIME,
      lastLoginAt DATETIME,
      lastLoginIp TEXT,
      lastLoginDevice TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      preferredLanguage TEXT DEFAULT 'en',
      preferredCurrency TEXT DEFAULT 'INR',
      detectedCountry TEXT
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Session (
      id TEXT NOT NULL PRIMARY KEY,
      token TEXT NOT NULL UNIQUE,
      userId TEXT NOT NULL,
      ipAddress TEXT,
      userAgent TEXT,
      deviceInfo TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expiresAt DATETIME NOT NULL,
      lastActivity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS Session_userId_idx ON Session(userId);
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS UserPermission (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      permission TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id),
      UNIQUE(userId, permission)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS AuditLog (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT,
      action TEXT NOT NULL,
      entity TEXT,
      entityId TEXT,
      details TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Cart (
      id TEXT NOT NULL PRIMARY KEY,
      sessionId TEXT NOT NULL UNIQUE,
      userId TEXT,
      couponCode TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CartItem (
      id TEXT NOT NULL PRIMARY KEY,
      cartId TEXT NOT NULL,
      productId TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      variantId TEXT,
      giftWrapping BOOLEAN NOT NULL DEFAULT false,
      greetingMessage TEXT,
      hidePrice BOOLEAN NOT NULL DEFAULT false,
      FOREIGN KEY (cartId) REFERENCES Cart(id),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS WishlistItem (
      id TEXT NOT NULL PRIMARY KEY,
      userId TEXT NOT NULL,
      productId TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id),
      FOREIGN KEY (productId) REFERENCES Product(id),
      UNIQUE(userId, productId)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ProductVariant (
      id TEXT NOT NULL PRIMARY KEY,
      productId TEXT NOT NULL,
      name TEXT NOT NULL,
      sku TEXT,
      price REAL NOT NULL,
      compareAtPrice REAL,
      stock INTEGER NOT NULL DEFAULT 0,
      stockStatus TEXT NOT NULL DEFAULT 'in_stock',
      attributes TEXT NOT NULL,
      image TEXT,
      isActive BOOLEAN NOT NULL DEFAULT true,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS ProductImage (
      id TEXT NOT NULL PRIMARY KEY,
      productId TEXT NOT NULL,
      url TEXT NOT NULL,
      alt TEXT,
      sort INTEGER NOT NULL DEFAULT 0,
      isActive BOOLEAN NOT NULL DEFAULT true,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Vendor (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      contactName TEXT,
      email TEXT,
      phone TEXT,
      address TEXT,
      gstNumber TEXT,
      isActive BOOLEAN NOT NULL DEFAULT true,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Order" (
      id TEXT NOT NULL PRIMARY KEY,
      orderNumber TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL,
      firstName TEXT NOT NULL,
      lastName TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      state TEXT NOT NULL,
      zipCode TEXT NOT NULL,
      country TEXT NOT NULL,
      phone TEXT,
      subtotal REAL NOT NULL,
      shipping REAL NOT NULL,
      tax REAL NOT NULL,
      discount REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      paymentMethod TEXT NOT NULL DEFAULT 'card',
      paymentStatus TEXT NOT NULL DEFAULT 'pending',
      deliveryType TEXT NOT NULL DEFAULT 'standard',
      scheduledDate DATETIME,
      occasion TEXT,
      giftWrapping BOOLEAN NOT NULL DEFAULT false,
      giftWrapStyle TEXT,
      greetingMessage TEXT,
      hidePrice BOOLEAN NOT NULL DEFAULT false,
      couponCode TEXT,
      trackingNumber TEXT,
      trackingUrl TEXT,
      estimatedDelivery DATETIME,
      cancelledAt DATETIME,
      cancelReason TEXT,
      refundStatus TEXT,
      refundAmount REAL,
      refundedAt DATETIME,
      userId TEXT,
      shopifyOrderId TEXT,
      shopifyOrderName TEXT,
      shopifyOrderData TEXT,
      shopifyCartId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Order_email_idx" ON "Order"(email);
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"(status);
  `)
  await db.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"(createdAt);
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS OrderItem (
      id TEXT NOT NULL PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      quantity INTEGER NOT NULL,
      image TEXT,
      variantId TEXT,
      variantName TEXT,
      giftWrapping BOOLEAN NOT NULL DEFAULT false,
      greetingMessage TEXT,
      hidePrice BOOLEAN NOT NULL DEFAULT false,
      FOREIGN KEY (orderId) REFERENCES "Order"(id),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Review (
      id TEXT NOT NULL PRIMARY KEY,
      productId TEXT NOT NULL,
      orderId TEXT,
      userId TEXT,
      userName TEXT NOT NULL,
      rating INTEGER NOT NULL,
      title TEXT,
      comment TEXT NOT NULL,
      verified BOOLEAN NOT NULL DEFAULT false,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS CurrencyRate (
      id TEXT NOT NULL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      symbol TEXT NOT NULL,
      rate REAL NOT NULL,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  await db.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS Offer (
      id TEXT NOT NULL PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      code TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      value REAL NOT NULL,
      minOrder REAL,
      maxDiscount REAL,
      validFrom DATETIME NOT NULL,
      validTo DATETIME NOT NULL,
      isActive BOOLEAN NOT NULL DEFAULT true,
      usageLimit INTEGER,
      usedCount INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `)

  // Create remaining tables that Prisma models reference
  // These are needed so Prisma queries don't crash
  const extraTables = [
    `CREATE TABLE IF NOT EXISTS OrderTrackingEvent (
      id TEXT NOT NULL PRIMARY KEY,
      orderId TEXT NOT NULL,
      status TEXT NOT NULL,
      description TEXT,
      location TEXT,
      timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES "Order"(id)
    );`,
    `CREATE TABLE IF NOT EXISTS PaymentSession (
      id TEXT NOT NULL PRIMARY KEY,
      orderId TEXT NOT NULL,
      provider TEXT NOT NULL,
      providerSessionId TEXT,
      amount REAL NOT NULL,
      currency TEXT NOT NULL DEFAULT 'INR',
      status TEXT NOT NULL DEFAULT 'created',
      paymentId TEXT,
      method TEXT,
      metadata TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES "Order"(id)
    );`,
    `CREATE TABLE IF NOT EXISTS OrderInvoice (
      id TEXT NOT NULL PRIMARY KEY,
      orderId TEXT NOT NULL UNIQUE,
      invoiceNumber TEXT NOT NULL UNIQUE,
      amount REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'generated',
      pdfUrl TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES "Order"(id)
    );`,
    `CREATE TABLE IF NOT EXISTS InventoryLog (
      id TEXT NOT NULL PRIMARY KEY,
      productId TEXT NOT NULL,
      type TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      note TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (productId) REFERENCES Product(id)
    );`,
    `CREATE TABLE IF NOT EXISTS PaymentMethod (
      id TEXT NOT NULL PRIMARY KEY,
      type TEXT NOT NULL,
      provider TEXT,
      last4 TEXT,
      isDefault BOOLEAN NOT NULL DEFAULT false,
      userId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS WikiDocument (
      id TEXT NOT NULL PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT,
      createdBy TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS AgentDocShare (
      id TEXT NOT NULL PRIMARY KEY,
      agentId TEXT NOT NULL,
      docId TEXT NOT NULL,
      sharedBy TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS SupportTicket (
      id TEXT NOT NULL PRIMARY KEY,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      userId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS SupportTicketMessage (
      id TEXT NOT NULL PRIMARY KEY,
      ticketId TEXT NOT NULL,
      senderId TEXT,
      message TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticketId) REFERENCES SupportTicket(id)
    );`,
    `CREATE TABLE IF NOT EXISTS AffiliateClick (
      id TEXT NOT NULL PRIMARY KEY,
      productId TEXT NOT NULL,
      platform TEXT NOT NULL,
      sourceUrl TEXT,
      referralCode TEXT,
      ipAddress TEXT,
      userAgent TEXT,
      clickedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS PlatformIntegration (
      id TEXT NOT NULL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      slug TEXT NOT NULL UNIQUE,
      baseUrl TEXT NOT NULL,
      logo TEXT,
      isActive BOOLEAN NOT NULL DEFAULT true,
      autoSync BOOLEAN NOT NULL DEFAULT true,
      syncInterval INTEGER NOT NULL DEFAULT 3600,
      lastSyncedAt DATETIME,
      syncStatus TEXT NOT NULL DEFAULT 'idle',
      lastSyncError TEXT,
      categories TEXT NOT NULL DEFAULT '[]',
      affiliateTag TEXT,
      commission REAL NOT NULL DEFAULT 0,
      maxProducts INTEGER NOT NULL DEFAULT 500,
      productCount INTEGER NOT NULL DEFAULT 0,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
    `CREATE TABLE IF NOT EXISTS SyncLog (
      id TEXT NOT NULL PRIMARY KEY,
      integrationId TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      productsFound INTEGER NOT NULL DEFAULT 0,
      productsAdded INTEGER NOT NULL DEFAULT 0,
      productsUpdated INTEGER NOT NULL DEFAULT 0,
      productsRemoved INTEGER NOT NULL DEFAULT 0,
      error TEXT,
      startedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completedAt DATETIME,
      FOREIGN KEY (integrationId) REFERENCES PlatformIntegration(id)
    );`,
    `CREATE TABLE IF NOT EXISTS PartnerCategoryMap (
      id TEXT NOT NULL PRIMARY KEY,
      integrationId TEXT NOT NULL,
      partnerCatName TEXT NOT NULL,
      partnerCatSlug TEXT NOT NULL,
      localCatId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (integrationId) REFERENCES PlatformIntegration(id),
      UNIQUE(integrationId, partnerCatSlug)
    );`,
    `CREATE TABLE IF NOT EXISTS CorporateAccount (
      id TEXT NOT NULL PRIMARY KEY,
      companyName TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      industry TEXT,
      website TEXT,
      gstNumber TEXT,
      panNumber TEXT,
      billingAddress TEXT,
      billingCity TEXT,
      billingState TEXT,
      billingZipCode TEXT,
      billingCountry TEXT NOT NULL DEFAULT 'India',
      contactName TEXT NOT NULL,
      contactEmail TEXT NOT NULL,
      contactPhone TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zipCode TEXT,
      country TEXT NOT NULL DEFAULT 'India',
      logo TEXT,
      userId TEXT NOT NULL UNIQUE,
      approvalStatus TEXT NOT NULL DEFAULT 'pending',
      isActive BOOLEAN NOT NULL DEFAULT true,
      creditLimit REAL NOT NULL DEFAULT 0,
      creditUsed REAL NOT NULL DEFAULT 0,
      discountPercent REAL NOT NULL DEFAULT 0,
      notes TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES User(id)
    );`,
    `CREATE TABLE IF NOT EXISTS CorporateMember (
      id TEXT NOT NULL PRIMARY KEY,
      corporateId TEXT NOT NULL,
      userId TEXT,
      email TEXT NOT NULL,
      name TEXT,
      role TEXT NOT NULL DEFAULT 'campaign_manager',
      status TEXT NOT NULL DEFAULT 'pending',
      invitedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      joinedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (corporateId) REFERENCES CorporateAccount(id),
      UNIQUE(corporateId, email)
    );`,
    `CREATE TABLE IF NOT EXISTS CorporateBranding (
      id TEXT NOT NULL PRIMARY KEY,
      corporateId TEXT NOT NULL UNIQUE,
      logoUrl TEXT,
      primaryColor TEXT,
      secondaryColor TEXT,
      customMessage TEXT,
      packagingType TEXT NOT NULL DEFAULT 'standard',
      giftWrapStyle TEXT,
      includeBranding BOOLEAN NOT NULL DEFAULT true,
      hidePrice BOOLEAN NOT NULL DEFAULT true,
      cardTemplate TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (corporateId) REFERENCES CorporateAccount(id)
    );`,
    `CREATE TABLE IF NOT EXISTS CorporateCampaign (
      id TEXT NOT NULL PRIMARY KEY,
      corporateId TEXT NOT NULL,
      name TEXT NOT NULL,
      occasion TEXT,
      description TEXT,
      budgetPerRecipient REAL,
      totalBudget REAL,
      status TEXT NOT NULL DEFAULT 'draft',
      deliveryType TEXT NOT NULL DEFAULT 'bulk',
      deliveryDate DATETIME,
      message TEXT,
      productId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (corporateId) REFERENCES CorporateAccount(id),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );`,
    `CREATE TABLE IF NOT EXISTS CampaignRecipient (
      id TEXT NOT NULL PRIMARY KEY,
      campaignId TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      designation TEXT,
      department TEXT,
      address TEXT,
      city TEXT,
      state TEXT,
      zipCode TEXT,
      productId TEXT,
      budget REAL,
      message TEXT,
      giftStatus TEXT NOT NULL DEFAULT 'pending',
      orderId TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaignId) REFERENCES CorporateCampaign(id),
      FOREIGN KEY (productId) REFERENCES Product(id)
    );`,
    `CREATE TABLE IF NOT EXISTS GeoCountry (
      id TEXT NOT NULL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      currencyCode TEXT NOT NULL,
      languageCode TEXT NOT NULL DEFAULT 'en',
      flagEmoji TEXT
    );`,
    `CREATE TABLE IF NOT EXISTS Invoice (
      id TEXT NOT NULL PRIMARY KEY,
      invoiceNumber TEXT NOT NULL UNIQUE,
      vendorId TEXT,
      orderId TEXT,
      amount REAL NOT NULL,
      tax REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      dueDate DATETIME,
      paidDate DATETIME,
      notes TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (vendorId) REFERENCES Vendor(id)
    );`,
    `CREATE TABLE IF NOT EXISTS InvoiceItem (
      id TEXT NOT NULL PRIMARY KEY,
      invoiceId TEXT NOT NULL,
      description TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unitPrice REAL NOT NULL,
      amount REAL NOT NULL,
      FOREIGN KEY (invoiceId) REFERENCES Invoice(id)
    );`,
    `CREATE TABLE IF NOT EXISTS AccountEntry (
      id TEXT NOT NULL PRIMARY KEY,
      entryNumber TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      category TEXT NOT NULL,
      amount REAL NOT NULL,
      description TEXT NOT NULL,
      reference TEXT,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );`,
  ]

  for (const sql of extraTables) {
    try {
      await db.$executeRawUnsafe(sql)
    } catch (err: any) {
      // Log but don't fail — some tables may already exist from prisma db push
      console.warn(`[auto-seed] Warning creating table: ${err.message?.substring(0, 80)}`)
    }
  }
}

const CATEGORIES = [
  { name: "Couple Friendly Gifts", slug: "couple-gifts", description: "Gift experiences for couples to share together", image: "/images/categories/couple.jpg" },
  { name: "Fashion", slug: "fashion", description: "Designer clothing and haute couture collections", image: "/images/categories/fashion.jpg" },
  { name: "Fragrance", slug: "fragrances", description: "Signature scents from the world's finest perfumers", image: "/images/categories/fragrances.jpg" },
  { name: "Home & Living", slug: "home-living", description: "Luxurious home decor and lifestyle accessories", image: "/images/categories/home.jpg" },
  { name: "Jewelry", slug: "jewelry", description: "Exquisite jewelry crafted with precious stones and metals", image: "/images/categories/jewelry.jpg" },
  { name: "Leather Goods", slug: "leather-goods", description: "Premium leather bags, wallets, and accessories", image: "/images/categories/leather.jpg" },
  { name: "Men's Shirts & T-Shirts", slug: "mens-shirts", description: "Premium shirts and t-shirts for the modern gentleman", image: "/images/categories/mens-shirts.jpg" },
  { name: "Romantic Gifts", slug: "romantic-gifts", description: "Thoughtful gift experiences to express your love", image: "/images/categories/romantic.jpg" },
  { name: "Saree", slug: "sarees", description: "Handwoven silk and designer sarees for every occasion", image: "/images/categories/sarees.jpg" },
  { name: "Toys", slug: "toys", description: "Premium collectible toys and luxury gifts for all ages", image: "/images/categories/toys.jpg" },
  { name: "Watches", slug: "watches", description: "Luxury timepieces from world-renowned makers", image: "/images/categories/watches.jpg" },
]

// Simplified product list (key products for each category — keeps cold start fast)
const PRODUCTS = [
  // Fragrances
  { name: "Ajmal Oud of Dubai Eau de Parfum 100ml", slug: "ajmal-oud-of-dubai-eau-de-parfum-100ml", description: "Rich, warm, and deeply sensual Eau de Parfum capturing the soul of the Arabian Peninsula.", price: 4999.0, compareAtPrice: 5999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716juhp9cAL._SL1500.jpg?v=1777487051"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["ajmal","eau de parfum","gift","luxury perfume","oud"]' },
  // Jewelry
  { name: "Amara Heart Locket Necklace - 18K Gold-Tone Engraved Heart Pendant", slug: "amara-heart-locket-necklace-18k-gold-tone", description: "A beautifully engraved gold-tone heart locket pendant with an intricate swirl motif, suspended on a sleek snake chain.", price: 799.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51BqqEpXlZL._SY695.jpg?v=1776837923"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Radiant Rose Gold Diamond Stud Earrings", slug: "radiant-rose-gold-diamond-stud-earrings", description: "Elegant rose gold stud earrings featuring brilliant-cut diamonds.", price: 2499.0, compareAtPrice: 3299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/earring1.jpg"]', categorySlug: "jewelry", stock: 8, rating: 4.5, reviewCount: 18, featured: true, tags: '["earrings","diamond","rose gold"]' },
  // Leather Goods
  { name: "Vintage Brown Leather Wallet", slug: "vintage-brown-leather-wallet", description: "Handcrafted premium leather wallet with RFID protection.", price: 1299.0, compareAtPrice: 1599.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/wallet1.jpg"]', categorySlug: "leather-goods", stock: 15, rating: 4.3, reviewCount: 12, featured: false, tags: '["wallet","leather","RFID"]' },
  // Home & Living
  { name: "Royal Crystal Candle Holder Set", slug: "royal-crystal-candle-holder-set", description: "Luxury crystal candle holders for elegant home decor.", price: 1899.0, compareAtPrice: 2499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/candle1.jpg"]', categorySlug: "home-living", stock: 6, rating: 4.6, reviewCount: 20, featured: true, tags: '["candle holder","crystal","home decor"]' },
  // Couple Gifts
  { name: "Forever Together Couple Watch Set", slug: "forever-together-couple-watch-set", description: "Matching luxury watch set for couples.", price: 5999.0, compareAtPrice: 7999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/couple-watch.jpg"]', categorySlug: "couple-gifts", stock: 4, rating: 4.8, reviewCount: 30, featured: true, tags: '["couple","watch set","gift"]' },
  // Romantic Gifts
  { name: "Love & Roses Gift Hamper", slug: "love-roses-gift-hamper", description: "Premium gift hamper with roses, chocolates, and scented candles.", price: 2499.0, compareAtPrice: 2999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/hamper1.jpg"]', categorySlug: "romantic-gifts", stock: 7, rating: 4.9, reviewCount: 35, featured: true, tags: '["romantic","gift hamper","roses"]' },
  // Fashion
  { name: "Silk Evening Clutch - Gold", slug: "silk-evening-clutch-gold", description: "Elegant silk clutch with gold-tone hardware.", price: 1599.0, compareAtPrice: 1999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/clutch1.jpg"]', categorySlug: "fashion", stock: 9, rating: 4.4, reviewCount: 15, featured: false, tags: '["clutch","silk","evening bag"]' },
  // Watches
  { name: "Chronos Automatic Dress Watch", slug: "chronos-automatic-dress-watch", description: "Swiss-inspired automatic dress watch with sapphire crystal.", price: 8999.0, compareAtPrice: 11999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/watch1.jpg"]', categorySlug: "watches", stock: 3, rating: 4.9, reviewCount: 42, featured: true, tags: '["automatic","dress watch","sapphire"]' },
  // Sarees
  { name: "Banarasi Silk Saree - Royal Blue", slug: "banarasi-silk-saree-royal-blue", description: "Handwoven Banarasi silk saree with gold zari work.", price: 6999.0, compareAtPrice: 8999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/saree1.jpg"]', categorySlug: "sarees", stock: 5, rating: 4.8, reviewCount: 28, featured: true, tags: '["banarasi","silk saree","zari"]' },
  // Men's Shirts
  { name: "Premium White Egyptian Cotton Shirt", slug: "premium-white-egyptian-cotton-shirt", description: "Luxurious Egyptian cotton formal shirt with mother-of-pearl buttons.", price: 2499.0, compareAtPrice: 3299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/shirt1.jpg"]', categorySlug: "mens-shirts", stock: 12, rating: 4.5, reviewCount: 22, featured: false, tags: '["egyptian cotton","formal shirt","white"]' },
  // Toys
  { name: "Luxury Chess Set - Rosewood & Maple", slug: "luxury-chess-set-rosewood-maple", description: "Handcrafted wooden chess set with weighted pieces.", price: 3499.0, compareAtPrice: 4499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/chess1.jpg"]', categorySlug: "toys", stock: 4, rating: 4.7, reviewCount: 16, featured: false, tags: '["chess","wooden","luxury game"]' },
]

// Password hashes generated with bcryptjs, salt rounds 10
// admin123 -> for admin, agent, team accounts
// user123  -> for demo user account
const DEMO_USERS = [
  { email: 'admin@3boxesluxury.com', name: 'Admin', password: '$2b$10$e9AuzJsvSUtdPEjYshqskuiaRXQxKt9T.Stf/fSrbJ24dDQfKBY.K', role: 'admin', isActive: true, approvalStatus: 'approved', emailVerified: true, phoneVerified: true, twoFactorEnabled: false },
  { email: 'user@3boxesluxury.com', name: 'User', password: '$2b$10$CD3bZ.ApSzllzp/NgpTz1.ZNbs7sfJUuMAB4DJ/LC6hv0HLcW7XNa', role: 'user', isActive: true, approvalStatus: 'approved', emailVerified: true, phoneVerified: false, twoFactorEnabled: false },
  { email: 'agent@3boxesluxury.com', name: 'Sales Agent', password: '$2b$10$e9AuzJsvSUtdPEjYshqskuiaRXQxKt9T.Stf/fSrbJ24dDQfKBY.K', role: 'agent', isActive: true, approvalStatus: 'approved', emailVerified: true, phoneVerified: true, twoFactorEnabled: false },
  { email: 'team@3boxesluxury.com', name: 'Support Team', password: '$2b$10$e9AuzJsvSUtdPEjYshqskuiaRXQxKt9T.Stf/fSrbJ24dDQfKBY.K', role: 'team', isActive: true, approvalStatus: 'approved', emailVerified: true, phoneVerified: false, twoFactorEnabled: false },
]

async function doSeed(): Promise<void> {
  // Step 1: Ensure the database schema exists (needed on Vercel cold starts)
  await ensureSchema()

  // Step 2: Check if data already exists
  const categoryCount = await db.category.count()

  if (categoryCount > 0) {
    isSeeded = true
    return
  }

  console.log('[auto-seed] Database is empty, seeding...')

  // Seed categories
  for (const cat of CATEGORIES) {
    await db.category.upsert({
      where: { slug: cat.slug },
      update: cat,
      create: cat,
    })
  }
  console.log(`[auto-seed] Created ${CATEGORIES.length} categories`)

  // Seed products
  let productCounter = 10001
  for (const prod of PRODUCTS) {
    const category = await db.category.findUnique({
      where: { slug: prod.categorySlug },
    })
    if (!category) continue

    const { categorySlug, ...productData } = prod
    const productNumber = `PRD-${productCounter}`
    productCounter++

    await db.product.upsert({
      where: { slug: prod.slug },
      update: { ...productData, categoryId: category.id, productNumber },
      create: { ...productData, categoryId: category.id, productNumber },
    })
  }
  console.log(`[auto-seed] Created ${PRODUCTS.length} products`)

  // Seed demo users
  for (const user of DEMO_USERS) {
    await db.user.upsert({
      where: { email: user.email },
      update: {},
      create: user,
    })
  }
  console.log(`[auto-seed] Created ${DEMO_USERS.length} demo users`)

  isSeeded = true
  console.log('[auto-seed] Done!')
}

/**
 * Ensure the database is seeded.
 * Safe to call multiple times — only seeds once.
 * On Vercel, this also creates the schema if needed.
 * Returns a promise that resolves when seeding is complete.
 */
export function ensureSeeded(): Promise<void> {
  if (isSeeded) return Promise.resolve()
  if (!seedPromise) {
    seedPromise = doSeed().catch((err) => {
      console.error('[auto-seed] Failed:', err)
      seedPromise = null // Allow retry
      isSeeded = false
      schemaEnsured = false
    })
  }
  return seedPromise
}
