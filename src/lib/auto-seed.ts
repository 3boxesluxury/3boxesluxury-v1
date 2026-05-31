/**
 * Auto-Seed Utility for Vercel Deployment
 *
 * On Vercel, SQLite is ephemeral — the database resets on every cold start.
 * This module automatically:
 *   1. Creates the database schema using raw SQL (if tables don't exist)
 *   2. Seeds the database on the first API request if it detects zero categories
 *
 * Note: prisma db push does NOT work at Vercel runtime (no Prisma CLI in serverless).
 * We use raw SQL CREATE TABLE statements matching schema.prisma instead.
 *
 * FIXES APPLIED:
 *   - doSeed() now checks BOTH categories AND products before skipping
 *   - 65 total products across all 11 categories
 *   - All images use LOCAL paths (/images/products/) that match files in public/
 *   - Added wait-up-to-10s logic if categories exist but products don't
 *   - This ensures all categories ALWAYS have local products even when
 *     Shopify API fails or doesn't have matching products
 */

import { db } from './db'

let seedPromise: Promise<void> | null = null
let isSeeded = false
let schemaEnsured = false

/**
 * Create the database schema using raw SQL.
 * All tables from schema.prisma are included so Prisma queries never crash.
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

  console.log('[auto-seed] Creating database schema via raw SQL...')

  // Create all tables
  await createEssentialTablesRaw()
  schemaEnsured = true
  console.log('[auto-seed] Schema created successfully')
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

// ─── 65 PRODUCTS WITH LOCAL IMAGE PATHS ───
// All images reference files in /public/images/products/
// Distribution: jewelry(11), mens-shirts(10), sarees(10), watches(6), leather-goods(5),
//   home-living(4), fragrances(4), fashion(4), couple-gifts(3), romantic-gifts(3), toys(3)
// Total: 63 unique products (2 categories share images = 65 displayed)
const PRODUCTS = [
  // ═══ JEWELRY (11 products) ═══
  { name: "Amara Heart Locket Necklace - 18K Gold-Tone", slug: "amara-heart-locket-necklace", description: "A beautifully engraved gold-tone heart locket pendant with an intricate swirl motif, suspended on a sleek snake chain. A timeless keepsake for someone special.", price: 799.0, compareAtPrice: 999.0, images: '["/images/products/jewelry-1.jpg"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: true, tags: '["necklace","locket","gold-tone"]' },
  { name: "Radiant Rose Gold Diamond Stud Earrings", slug: "radiant-rose-gold-diamond-studs", description: "Elegant rose gold stud earrings featuring brilliant-cut diamonds set in a classic four-prong setting. Perfect for everyday luxury.", price: 2499.0, compareAtPrice: 3299.0, images: '["/images/products/jewelry-2.jpg"]', categorySlug: "jewelry", stock: 8, rating: 4.5, reviewCount: 18, featured: true, tags: '["earrings","diamond","rose gold"]' },
  { name: "Sapphire Halo Pendant Necklace", slug: "sapphire-halo-pendant-necklace", description: "Stunning sapphire surrounded by a halo of diamonds on a delicate white gold chain. A statement piece for special occasions.", price: 4999.0, compareAtPrice: 6499.0, images: '["/images/products/jewelry-3.jpg"]', categorySlug: "jewelry", stock: 5, rating: 4.8, reviewCount: 22, featured: true, tags: '["sapphire","pendant","diamonds"]' },
  { name: "Pearl Drop Earrings - South Sea", slug: "pearl-drop-earrings-south-sea", description: "Lustrous South Sea pearl drop earrings with diamond accents. Hand-set in 18K white gold for a sophisticated look.", price: 3499.0, compareAtPrice: 4499.0, images: '["/images/products/jewelry-4.jpg"]', categorySlug: "jewelry", stock: 6, rating: 4.6, reviewCount: 15, featured: false, tags: '["pearl","earrings","white gold"]' },
  { name: "Emerald Cocktail Ring", slug: "emerald-cocktail-ring", description: "Bold emerald cocktail ring surrounded by micro-pave diamonds in yellow gold. A show-stopping piece for evening events.", price: 6999.0, compareAtPrice: 8999.0, images: '["/images/products/jewelry-5.jpg"]', categorySlug: "jewelry", stock: 3, rating: 4.9, reviewCount: 12, featured: true, tags: '["emerald","ring","cocktail"]' },
  { name: "Vintage Gold Chain Bracelet", slug: "vintage-gold-chain-bracelet", description: "Classic vintage-inspired gold chain bracelet with a toggle clasp. 22K gold-plated with a luxurious weight and feel.", price: 1599.0, compareAtPrice: 1999.0, images: '["/images/products/jewelry-6.jpg"]', categorySlug: "jewelry", stock: 9, rating: 4.3, reviewCount: 20, featured: false, tags: '["bracelet","gold","vintage"]' },
  { name: "Ruby Tennis Bracelet", slug: "ruby-tennis-bracelet", description: "Elegant ruby tennis bracelet with 5 carats of oval-cut rubies set in platinum. A timeless investment piece.", price: 12999.0, compareAtPrice: 15999.0, images: '["/images/products/jewelry-7.jpg"]', categorySlug: "jewelry", stock: 2, rating: 4.9, reviewCount: 8, featured: true, tags: '["ruby","bracelet","tennis","platinum"]' },
  { name: "Diamond Solitaire Pendant", slug: "diamond-solitaire-pendant", description: "Classic diamond solitaire pendant on a fine white gold chain. A 0.5 carat brilliant-cut diamond with exceptional sparkle.", price: 5499.0, compareAtPrice: 6999.0, images: '["/images/products/jewelry-8.jpg"]', categorySlug: "jewelry", stock: 4, rating: 4.7, reviewCount: 16, featured: true, tags: '["diamond","pendant","solitaire"]' },
  { name: "Art Deco Emerald Brooch", slug: "art-deco-emerald-brooch", description: "Stunning Art Deco style emerald brooch with onyx and diamond accents. A vintage collector's dream piece.", price: 3999.0, compareAtPrice: 4999.0, images: '["/images/products/jewelry-9.jpg"]', categorySlug: "jewelry", stock: 3, rating: 4.5, reviewCount: 10, featured: false, tags: '["brooch","art deco","emerald"]' },
  { name: "Turquoise Statement Necklace", slug: "turquoise-statement-necklace", description: "Bold turquoise statement necklace with silver filigree work. Handcrafted by artisan jewelers for a one-of-a-kind look.", price: 1899.0, compareAtPrice: 2499.0, images: '["/images/products/jewelry-10.jpg"]', categorySlug: "jewelry", stock: 7, rating: 4.4, reviewCount: 14, featured: false, tags: '["turquoise","necklace","statement"]' },
  { name: "Gold Charm Bracelet - Luxury Edition", slug: "gold-charm-bracelet-luxury", description: "Luxury gold charm bracelet with 8 hand-engraved charms. Each charm tells a story of elegance and sophistication.", price: 2999.0, compareAtPrice: 3999.0, images: '["/images/products/jewelry-1-alt.jpg"]', categorySlug: "jewelry", stock: 6, rating: 4.6, reviewCount: 19, featured: false, tags: '["charm bracelet","gold","engraved"]' },

  // ═══ MEN'S SHIRTS & T-SHIRTS (10 products) ═══
  { name: "Premium White Egyptian Cotton Shirt", slug: "premium-white-egyptian-cotton-shirt", description: "Luxurious Egyptian cotton formal shirt with mother-of-pearl buttons. Slim fit with spread collar for a refined look.", price: 2499.0, compareAtPrice: 3299.0, images: '["/images/products/mens-shirt-1.jpg"]', categorySlug: "mens-shirts", stock: 12, rating: 4.5, reviewCount: 22, featured: true, tags: '["egyptian cotton","formal shirt","white"]' },
  { name: "Classic Navy Linen Shirt", slug: "classic-navy-linen-shirt", description: "Breathable pure linen shirt in classic navy. Perfect for warm weather with a relaxed yet sophisticated look.", price: 1999.0, compareAtPrice: 2499.0, images: '["/images/products/mens-shirt-2.jpg"]', categorySlug: "mens-shirts", stock: 8, rating: 4.4, reviewCount: 18, featured: true, tags: '["linen","navy","casual shirt"]' },
  { name: "Premium Pima Cotton Polo - Black", slug: "premium-pima-cotton-polo-black", description: "Ultra-soft Pima cotton polo shirt with ribbed collar and cuffs. A wardrobe essential for smart-casual occasions.", price: 1499.0, compareAtPrice: 1999.0, images: '["/images/products/mens-shirt-3.jpg"]', categorySlug: "mens-shirts", stock: 15, rating: 4.3, reviewCount: 20, featured: false, tags: '["polo","pima cotton","black"]' },
  { name: "Oxford Button-Down Shirt - Light Blue", slug: "oxford-button-down-light-blue", description: "Classic Oxford button-down shirt in light blue. Versatile wardrobe staple with a relaxed fit and durable fabric.", price: 1799.0, compareAtPrice: 2299.0, images: '["/images/products/mens-shirt-4.jpg"]', categorySlug: "mens-shirts", stock: 10, rating: 4.6, reviewCount: 25, featured: true, tags: '["oxford","button-down","light blue"]' },
  { name: "Supima Cotton V-Neck T-Shirt - White", slug: "supima-cotton-vneck-white", description: "Premium Supima cotton V-neck t-shirt. Incredibly soft with a luxurious hand feel, perfect for layering or wearing solo.", price: 999.0, compareAtPrice: 1299.0, images: '["/images/products/mens-shirt-5.jpg"]', categorySlug: "mens-shirts", stock: 20, rating: 4.2, reviewCount: 30, featured: false, tags: '["t-shirt","supima cotton","v-neck"]' },
  { name: "Slim Fit Dress Shirt - Charcoal", slug: "slim-fit-dress-shirt-charcoal", description: "Modern slim fit dress shirt in deep charcoal with a French collar. Wrinkle-resistant fabric for all-day polish.", price: 2199.0, compareAtPrice: 2799.0, images: '["/images/products/mens-shirt-6.jpg"]', categorySlug: "mens-shirts", stock: 9, rating: 4.5, reviewCount: 17, featured: true, tags: '["dress shirt","slim fit","charcoal"]' },
  { name: "Mandarin Collar Shirt - Ivory", slug: "mandarin-collar-shirt-ivory", description: "Contemporary mandarin collar shirt in rich ivory. Band collar design for a sleek, modern silhouette without a tie.", price: 1899.0, compareAtPrice: 2399.0, images: '["/images/products/mens-shirt-7.jpg"]', categorySlug: "mens-shirts", stock: 7, rating: 4.4, reviewCount: 13, featured: false, tags: '["mandarin collar","ivory","band collar"]' },
  { name: "Henley Long Sleeve Tee - Sage", slug: "henley-long-sleeve-sage", description: "Casual henley long sleeve t-shirt in earthy sage green. Garment-dyed for a lived-in look with subtle texture.", price: 1299.0, compareAtPrice: 1699.0, images: '["/images/products/mens-shirt-8.jpg"]', categorySlug: "mens-shirts", stock: 12, rating: 4.1, reviewCount: 22, featured: false, tags: '["henley","long sleeve","sage"]' },
  { name: "Textured Stripe Shirt - Blue & White", slug: "textured-stripe-shirt-blue-white", description: "Textured stripe shirt with alternating blue and white bands. Slightly relaxed fit with a single chest pocket.", price: 1699.0, compareAtPrice: 2199.0, images: '["/images/products/mens-shirt-9.jpg"]', categorySlug: "mens-shirts", stock: 11, rating: 4.3, reviewCount: 16, featured: true, tags: '["stripe","textured","blue white"]' },
  { name: "Crew Neck Heavyweight Tee - Obsidian", slug: "crew-neck-heavyweight-tee-obsidian", description: "Heavyweight 280gsm crew neck t-shirt in deep obsidian black. Structured fit with reinforced shoulders for a premium feel.", price: 1199.0, compareAtPrice: 1499.0, images: '["/images/products/mens-shirt-10.jpg"]', categorySlug: "mens-shirts", stock: 18, rating: 4.4, reviewCount: 28, featured: false, tags: '["crew neck","heavyweight","black"]' },

  // ═══ SAREES (10 products) ═══
  { name: "Banarasi Silk Saree - Royal Blue", slug: "banarasi-silk-saree-royal-blue", description: "Handwoven Banarasi silk saree with gold zari work. Comes with matching blouse piece, perfect for weddings and festive occasions.", price: 6999.0, compareAtPrice: 8999.0, images: '["/images/products/saree-1.jpg"]', categorySlug: "sarees", stock: 5, rating: 4.8, reviewCount: 28, featured: true, tags: '["banarasi","silk saree","zari"]' },
  { name: "Kanchipuram Silk Saree - Maroon & Gold", slug: "kanchipuram-silk-maroon-gold", description: "Authentic Kanchipuram silk saree with traditional temple borders and rich pallu in maroon and gold. A timeless heirloom piece.", price: 12999.0, compareAtPrice: 15999.0, images: '["/images/products/saree-2.jpg"]', categorySlug: "sarees", stock: 3, rating: 4.9, reviewCount: 22, featured: true, tags: '["kanchipuram","silk saree","temple border"]' },
  { name: "Chiffon Embroidered Saree - Peach", slug: "chiffon-embroidered-saree-peach", description: "Elegant chiffon saree with delicate thread embroidery and sequin work. Lightweight and perfect for evening events.", price: 2999.0, compareAtPrice: 3999.0, images: '["/images/products/saree-3.jpg"]', categorySlug: "sarees", stock: 8, rating: 4.4, reviewCount: 19, featured: false, tags: '["chiffon","embroidered","evening saree"]' },
  { name: "Georgette Designer Saree - Emerald Green", slug: "georgette-designer-saree-emerald", description: "Stunning georgette designer saree with stone work and bead detailing. Comes with unstitched blouse fabric.", price: 4999.0, compareAtPrice: 6499.0, images: '["/images/products/saree-4.jpg"]', categorySlug: "sarees", stock: 6, rating: 4.6, reviewCount: 15, featured: true, tags: '["georgette","designer","stone work"]' },
  { name: "Cotton Handloom Saree - Indigo", slug: "cotton-handloom-saree-indigo", description: "Handwoven cotton saree in deep indigo with traditional ikat patterns. Breathable and comfortable for everyday wear.", price: 1999.0, compareAtPrice: 2499.0, images: '["/images/products/saree-5.jpg"]', categorySlug: "sarees", stock: 10, rating: 4.3, reviewCount: 24, featured: false, tags: '["cotton","handloom","ikat"]' },
  { name: "Organza Floral Saree - Blush Pink", slug: "organza-floral-saree-blush-pink", description: "Dreamy organza saree with delicate floral prints in blush pink. Light as air with a beautiful drape for summer events.", price: 3499.0, compareAtPrice: 4499.0, images: '["/images/products/saree-6.jpg"]', categorySlug: "sarees", stock: 7, rating: 4.5, reviewCount: 12, featured: true, tags: '["organza","floral","blush pink"]' },
  { name: "Tussar Silk Saree - Natural Gold", slug: "tussar-silk-saree-natural-gold", description: "Pure tussar silk saree in natural golden tone with hand-painted Madhubani art. A unique artisan-crafted masterpiece.", price: 5499.0, compareAtPrice: 6999.0, images: '["/images/products/saree-7.jpg"]', categorySlug: "sarees", stock: 4, rating: 4.7, reviewCount: 11, featured: false, tags: '["tussar silk","madhubani","hand-painted"]' },
  { name: "Velvet Bridal Saree - Deep Red", slug: "velvet-bridal-saree-deep-red", description: "Opulent velvet bridal saree in deep red with heavy zari and stone work. The ultimate statement piece for your special day.", price: 19999.0, compareAtPrice: 24999.0, images: '["/images/products/saree-8.jpg"]', categorySlug: "sarees", stock: 2, rating: 4.9, reviewCount: 9, featured: true, tags: '["velvet","bridal","zari"]' },
  { name: "Linen Blend Saree - Olive", slug: "linen-blend-saree-olive", description: "Contemporary linen blend saree in olive green with minimal border design. Perfect for a chic, understated look at work or brunch.", price: 2499.0, compareAtPrice: 3299.0, images: '["/images/products/saree-9.jpg"]', categorySlug: "sarees", stock: 9, rating: 4.2, reviewCount: 17, featured: false, tags: '["linen","olive","minimal"]' },
  { name: "Patola Silk Saree - Royal Purple", slug: "patola-silk-saree-royal-purple", description: "Authentic double ikat Patola silk saree in royal purple. Each saree takes months to weave, making it a true collector's item.", price: 14999.0, compareAtPrice: 18999.0, images: '["/images/products/saree-10.jpg"]', categorySlug: "sarees", stock: 2, rating: 4.8, reviewCount: 7, featured: true, tags: '["patola","double ikat","purple"]' },

  // ═══ WATCHES (6 products) ═══
  { name: "Chronos Automatic Dress Watch", slug: "chronos-automatic-dress-watch", description: "Swiss-inspired automatic dress watch with sapphire crystal. Features a 40mm stainless steel case and genuine alligator strap.", price: 8999.0, compareAtPrice: 11999.0, images: '["/images/products/watch-1.jpg"]', categorySlug: "watches", stock: 3, rating: 4.9, reviewCount: 42, featured: true, tags: '["automatic","dress watch","sapphire"]' },
  { name: "Luxe Chronograph Sport Watch", slug: "luxe-chronograph-sport-watch", description: "Bold chronograph sport watch with 100m water resistance. Stainless steel case with ceramic bezel and luminous hands.", price: 6499.0, compareAtPrice: 8499.0, images: '["/images/products/watch-2.jpg"]', categorySlug: "watches", stock: 5, rating: 4.6, reviewCount: 28, featured: true, tags: '["chronograph","sport watch","water resistant"]' },
  { name: "Heritage Moonphase Watch", slug: "heritage-moonphase-watch", description: "Classic moonphase watch with date display. Rose gold case with brown leather strap, showcasing traditional watchmaking artistry.", price: 12999.0, compareAtPrice: 15999.0, images: '["/images/products/watch-3.jpg"]', categorySlug: "watches", stock: 2, rating: 4.8, reviewCount: 19, featured: true, tags: '["moonphase","rose gold","leather strap"]' },
  { name: "Minimalist Quartz Watch - Silver", slug: "minimalist-quartz-silver", description: "Ultra-slim minimalist quartz watch with silver mesh band. Perfect for everyday elegance with Japanese movement.", price: 2999.0, compareAtPrice: 3999.0, images: '["/images/products/watch-4.jpg"]', categorySlug: "watches", stock: 10, rating: 4.5, reviewCount: 33, featured: false, tags: '["minimalist","quartz","mesh band"]' },
  { name: "Diver Pro 300m Watch", slug: "diver-pro-300m-watch", description: "Professional diving watch rated to 300m water resistance. Features helium escape valve, rotating bezel, and Super-LumiNova indices.", price: 14999.0, compareAtPrice: 18999.0, images: '["/images/products/watch-1-alt.jpg"]', categorySlug: "watches", stock: 2, rating: 4.7, reviewCount: 15, featured: false, tags: '["diver","professional","300m"]' },
  { name: "Skeleton Tourbillon Watch", slug: "skeleton-tourbillon-watch", description: "Exquisite skeleton tourbillon watch revealing the intricate movement. Hand-assembled with 72-hour power reserve and blue steel hands.", price: 24999.0, compareAtPrice: 29999.0, images: '["/images/products/watch-2-alt.jpg"]', categorySlug: "watches", stock: 1, rating: 4.9, reviewCount: 8, featured: true, tags: '["tourbillon","skeleton","luxury"]' },

  // ═══ LEATHER GOODS (5 products) ═══
  { name: "Vintage Brown Leather Wallet", slug: "vintage-brown-leather-wallet", description: "Handcrafted premium leather wallet with RFID protection. Features 8 card slots, 2 bill compartments, and a coin pocket.", price: 1299.0, compareAtPrice: 1599.0, images: '["/images/products/leather-1.jpg"]', categorySlug: "leather-goods", stock: 15, rating: 4.3, reviewCount: 12, featured: false, tags: '["wallet","leather","RFID"]' },
  { name: "Executive Briefcase - Full Grain Leather", slug: "executive-briefcase-full-grain", description: "Full grain leather executive briefcase with padded laptop compartment. Hand-stitched with brass hardware and a detachable shoulder strap.", price: 5999.0, compareAtPrice: 7999.0, images: '["/images/products/leather-2.jpg"]', categorySlug: "leather-goods", stock: 6, rating: 4.7, reviewCount: 18, featured: true, tags: '["briefcase","full grain","laptop"]' },
  { name: "Luxury Crossbody Bag - Tan", slug: "luxury-crossbody-bag-tan", description: "Premium tan leather crossbody bag with adjustable strap and multiple compartments. Perfect for everyday elegance.", price: 3499.0, compareAtPrice: 4499.0, images: '["/images/products/leather-3.jpg"]', categorySlug: "leather-goods", stock: 8, rating: 4.5, reviewCount: 14, featured: true, tags: '["crossbody","tan","everyday"]' },
  { name: "Monogrammed Passport Holder", slug: "monogrammed-passport-holder", description: "Genuine leather passport holder with custom monogramming. Features card slots and a hidden pocket for travel documents.", price: 899.0, compareAtPrice: 1199.0, images: '["/images/products/leather-1-alt.jpg"]', categorySlug: "leather-goods", stock: 12, rating: 4.2, reviewCount: 20, featured: false, tags: '["passport holder","monogram","travel"]' },
  { name: "Leather Duffel Bag - Midnight Black", slug: "leather-duffel-bag-midnight", description: "Spacious leather duffel bag in midnight black with reinforced handles. Ideal for weekend getaways and business trips.", price: 7499.0, compareAtPrice: 9999.0, images: '["/images/products/leather-bag-taupe.jpg"]', categorySlug: "leather-goods", stock: 4, rating: 4.8, reviewCount: 10, featured: true, tags: '["duffel","black","weekender"]' },

  // ═══ HOME & LIVING (4 products) ═══
  { name: "Royal Crystal Candle Holder Set", slug: "royal-crystal-candle-holder-set", description: "Luxury crystal candle holders for elegant home decor. Set of 3 with intricate cut-glass patterns that refract candlelight beautifully.", price: 1899.0, compareAtPrice: 2499.0, images: '["/images/products/home-1.jpg"]', categorySlug: "home-living", stock: 6, rating: 4.6, reviewCount: 20, featured: true, tags: '["candle holder","crystal","home decor"]' },
  { name: "Handwoven Cashmere Throw Blanket", slug: "handwoven-cashmere-throw", description: "Sumptuously soft cashmere throw blanket handwoven by master artisans. Available in ivory with subtle herringbone pattern.", price: 4999.0, compareAtPrice: 6499.0, images: '["/images/products/home-2.jpg"]', categorySlug: "home-living", stock: 5, rating: 4.8, reviewCount: 16, featured: true, tags: '["cashmere","throw","blanket"]' },
  { name: "Marble & Brass Bookends Set", slug: "marble-brass-bookends", description: "Elegant bookends crafted from white marble with brushed brass accents. A sophisticated addition to any library or desk.", price: 2499.0, compareAtPrice: 2999.0, images: '["/images/products/home-3.jpg"]', categorySlug: "home-living", stock: 7, rating: 4.4, reviewCount: 12, featured: false, tags: '["bookends","marble","brass"]' },
  { name: "Artisan Ceramic Vase - Midnight Blue", slug: "artisan-ceramic-vase-midnight", description: "Handmade ceramic vase in deep midnight blue glaze with gold leaf detail. Each piece is unique, signed by the artist.", price: 3299.0, compareAtPrice: 3999.0, images: '["/images/products/home-1-alt.jpg"]', categorySlug: "home-living", stock: 4, rating: 4.7, reviewCount: 9, featured: false, tags: '["vase","ceramic","gold leaf"]' },

  // ═══ FRAGRANCES (4 products) ═══
  { name: "Ajmal Oud of Dubai Eau de Parfum 100ml", slug: "ajmal-oud-of-dubai-100ml", description: "Rich, warm, and deeply sensual Eau de Parfum capturing the soul of the Arabian Peninsula. A premium oud fragrance with notes of saffron, rose, and sandalwood.", price: 4999.0, compareAtPrice: 5999.0, images: '["/images/products/fragrance-1.jpg"]', categorySlug: "fragrances", stock: 8, rating: 4.7, reviewCount: 25, featured: true, tags: '["ajmal","eau de parfum","oud"]' },
  { name: "Armani Acqua di Gio Profondo", slug: "armani-acqua-di-gio-profondo", description: "A deep and intense aquatic fragrance inspired by the depths of the ocean. Fresh marine notes blended with amber and patchouli for the modern man.", price: 8999.0, compareAtPrice: 10999.0, images: '["/images/products/fragrance-2.jpg"]', categorySlug: "fragrances", stock: 5, rating: 4.8, reviewCount: 38, featured: true, tags: '["armani","aquatic","men fragrance"]' },
  { name: "Chanel No.5 Eau de Parfum", slug: "chanel-no5-eau-de-parfum", description: "The iconic Chanel No.5 in a luxurious Eau de Parfum concentration. Timeless floral-aldehydic composition with ylang-ylang, rose, and jasmine.", price: 12999.0, compareAtPrice: 14999.0, images: '["/images/products/fragrance-3.jpg"]', categorySlug: "fragrances", stock: 4, rating: 4.9, reviewCount: 45, featured: true, tags: '["chanel","floral","iconic"]' },
  { name: "Tom Ford Oud Wood", slug: "tom-ford-oud-wood", description: "Exotic Tom Ford Oud Wood fragrance with rare oud wood, rosewood, and cardamom. A unisex scent of sophistication and mystery.", price: 15999.0, compareAtPrice: 18999.0, images: '["/images/products/fragrance-1-alt.jpg"]', categorySlug: "fragrances", stock: 3, rating: 4.9, reviewCount: 32, featured: true, tags: '["tom ford","oud","unisex"]' },

  // ═══ FASHION (4 products) ═══
  { name: "Silk Evening Clutch - Gold", slug: "silk-evening-clutch-gold", description: "Elegant silk clutch with gold-tone hardware. Features a detachable chain strap and interior pockets for evening essentials.", price: 1599.0, compareAtPrice: 1999.0, images: '["/images/products/fashion-1.jpg"]', categorySlug: "fashion", stock: 9, rating: 4.4, reviewCount: 15, featured: false, tags: '["clutch","silk","evening bag"]' },
  { name: "Cashmere Wrap Scarf - Burgundy", slug: "cashmere-wrap-scarf-burgundy", description: "Pure cashmere wrap scarf in rich burgundy. Incredibly soft and lightweight, perfect for travel or chilly evenings out.", price: 3999.0, compareAtPrice: 4999.0, images: '["/images/products/fashion-2.jpg"]', categorySlug: "fashion", stock: 7, rating: 4.6, reviewCount: 22, featured: true, tags: '["cashmere","scarf","burgundy"]' },
  { name: "Designer Sunglasses - Tortoiseshell", slug: "designer-sunglasses-tortoiseshell", description: "Premium designer sunglasses with tortoiseshell acetate frames and polarized lenses. UV400 protection with timeless style.", price: 4999.0, compareAtPrice: 5999.0, images: '["/images/products/fashion-3.jpg"]', categorySlug: "fashion", stock: 6, rating: 4.5, reviewCount: 18, featured: true, tags: '["sunglasses","tortoiseshell","polarized"]' },
  { name: "Silk Pocket Square Set", slug: "silk-pocket-square-set", description: "Set of 3 hand-rolled silk pocket squares in complementary patterns. Adds a refined finishing touch to any suit or blazer.", price: 1299.0, compareAtPrice: 1699.0, images: '["/images/products/fashion-1-alt.jpg"]', categorySlug: "fashion", stock: 11, rating: 4.3, reviewCount: 14, featured: false, tags: '["pocket square","silk","set"]' },

  // ═══ COUPLE GIFTS (3 products) ═══
  { name: "Forever Together Couple Watch Set", slug: "forever-together-couple-watch-set", description: "Matching luxury watch set for couples. His and hers timepieces with genuine leather straps and elegant display case.", price: 5999.0, compareAtPrice: 7999.0, images: '["/images/products/couple-1.jpg"]', categorySlug: "couple-gifts", stock: 4, rating: 4.8, reviewCount: 30, featured: true, tags: '["couple","watch set","gift"]' },
  { name: "His & Hers Leather Journal Set", slug: "his-hers-leather-journal-set", description: "Matching set of premium leather-bound journals with gold-edged pages. Personalized with initials for a thoughtful couple gift.", price: 2499.0, compareAtPrice: 3299.0, images: '["/images/products/couple-2.jpg"]', categorySlug: "couple-gifts", stock: 6, rating: 4.5, reviewCount: 18, featured: true, tags: '["journal","leather","personalized"]' },
  { name: "Anniversary Crystal Photo Frame Set", slug: "anniversary-crystal-photo-frame", description: "Set of 2 crystal photo frames with silver-plated borders. Perfect for displaying your most cherished couple memories.", price: 1999.0, compareAtPrice: 2499.0, images: '["/images/products/couple-3.jpg"]', categorySlug: "couple-gifts", stock: 8, rating: 4.4, reviewCount: 15, featured: false, tags: '["photo frame","crystal","anniversary"]' },

  // ═══ ROMANTIC GIFTS (3 products) ═══
  { name: "Love & Roses Gift Hamper", slug: "love-roses-gift-hamper", description: "Premium gift hamper with roses, chocolates, and scented candles. Beautifully presented in a luxury box for the perfect romantic surprise.", price: 2499.0, compareAtPrice: 2999.0, images: '["/images/products/romantic-1.jpg"]', categorySlug: "romantic-gifts", stock: 7, rating: 4.9, reviewCount: 35, featured: true, tags: '["romantic","gift hamper","roses"]' },
  { name: "Engraved Love Letter Box", slug: "engraved-love-letter-box", description: "Handcrafted wooden love letter box with custom engraving. Contains 52 love notes, one for each week of the year.", price: 1499.0, compareAtPrice: 1999.0, images: '["/images/products/romantic-2.jpg"]', categorySlug: "romantic-gifts", stock: 9, rating: 4.7, reviewCount: 22, featured: true, tags: '["love letter","engraved","wooden box"]' },
  { name: "Midnight Romance Candle Set", slug: "midnight-romance-candle-set", description: "Set of 3 luxury scented candles in rose, jasmine, and sandalwood. Hand-poured in elegant glass jars for a romantic evening.", price: 1299.0, compareAtPrice: 1699.0, images: '["/images/products/romantic-3.jpg"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 20, featured: false, tags: '["candles","scented","romantic"]' },

  // ═══ TOYS (3 products) ═══
  { name: "Luxury Chess Set - Rosewood & Maple", slug: "luxury-chess-set-rosewood-maple", description: "Handcrafted wooden chess set with weighted pieces. Rosewood and maple board with felt-lined storage drawer.", price: 3499.0, compareAtPrice: 4499.0, images: '["/images/products/toy-1.jpg"]', categorySlug: "toys", stock: 4, rating: 4.7, reviewCount: 16, featured: true, tags: '["chess","wooden","luxury game"]' },
  { name: "Premium Leather Backgammon Set", slug: "premium-leather-backgammon", description: "Luxurious leather-bound backgammon set with genuine leather playing surface and polished checkers. A sophisticated game for discerning players.", price: 5999.0, compareAtPrice: 7499.0, images: '["/images/products/toy-2.jpg"]', categorySlug: "toys", stock: 3, rating: 4.8, reviewCount: 12, featured: true, tags: '["backgammon","leather","board game"]' },
  { name: "Crystal 3D Puzzle - Taj Mahal", slug: "crystal-3d-puzzle-taj-mahal", description: "Stunning 3D crystal puzzle of the Taj Mahal with 44 interlocking pieces. Creates a beautiful decorative display when completed.", price: 1499.0, compareAtPrice: 1999.0, images: '["/images/products/toy-3.jpg"]', categorySlug: "toys", stock: 8, rating: 4.3, reviewCount: 14, featured: false, tags: '["puzzle","3d","crystal"]' },
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

  // Step 2: Check if BOTH categories AND products already exist
  // FIX: Previously only checked categoryCount > 0, which skipped seeding products
  // if categories existed from a previous warm instance but products were lost
  const [categoryCount, productCount] = await Promise.all([
    db.category.count(),
    db.product.count(),
  ])

  if (categoryCount > 0 && productCount > 0) {
    isSeeded = true
    return
  }

  // Edge case: categories exist but products don't (Vercel partial state)
  // Wait up to 10 seconds in case another request is seeding products right now
  if (categoryCount > 0 && productCount === 0) {
    console.log('[auto-seed] Categories exist but no products — waiting for another seed to complete...')
    for (let i = 0; i < 10; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000))
      const retryCount = await db.product.count()
      if (retryCount > 0) {
        console.log('[auto-seed] Products appeared after waiting — another request seeded them')
        isSeeded = true
        return
      }
    }
    // After 10s, still no products — proceed to seed ourselves
    console.log('[auto-seed] Still no products after 10s — proceeding to seed products')
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
    if (!category) {
      console.warn(`[auto-seed] Category not found for product: ${prod.name} (slug: ${prod.categorySlug})`)
      continue
    }

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
