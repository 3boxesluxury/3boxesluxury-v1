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
  { name: "Couple Friendly Gifts", slug: "couple-gifts", description: "Curated gift experiences for couples to share together", image: "/images/categories/couple-gifts.jpg" },
  { name: "Fashion & Beauty", slug: "fashion", description: "Beauty, grooming, and fashion accessories", image: "/images/categories/fashion.jpg" },
  { name: "Fragrance", slug: "fragrances", description: "Signature scents from the world's finest perfumers", image: "/images/categories/fragrances.jpg" },
  { name: "Home & Living", slug: "home-living", description: "Luxurious home decor, candles, and lifestyle accessories", image: "/images/categories/home-living.jpg" },
  { name: "Jewelry", slug: "jewelry", description: "Exquisite jewelry crafted with precious stones and metals", image: "/images/categories/jewelry.jpg" },
  { name: "Leather Goods", slug: "leather-goods", description: "Premium leather bags, wallets, belts, and accessories", image: "/images/categories/leather-goods.jpg" },
  { name: "Men's Shirts & T-Shirts", slug: "mens-shirts", description: "Premium shirts and t-shirts for the modern gentleman", image: "/images/categories/mens-shirts.jpg" },
  { name: "Romantic Gifts", slug: "romantic-gifts", description: "Thoughtful gift experiences to express your love", image: "/images/categories/romantic-gifts.jpg" },
  { name: "Saree", slug: "sarees", description: "Handwoven silk and designer sarees for every occasion", image: "/images/categories/sarees.jpg" },
  { name: "Toys", slug: "toys", description: "Premium collectible toys and luxury gifts for all ages", image: "/images/categories/toys.jpg" },
  { name: "Watches", slug: "watches", description: "Luxury timepieces from world-renowned makers", image: "/images/categories/watches.jpg" },
]

// Real products scraped from 3boxesgifts.com — all 48 products with real data
const PRODUCTS = [
  { name: "Happy Birthday Wooden Music Box | Hand-Crank Engraved Musical Gift Box", slug: "happy-birthday-wooden-music-box-hand-crank-engraved-musical-gift-box", description: "Make someone's birthday truly unforgettable with this enchanting Happy Birthday Wooden Music Box . Crafted from premium dark wood with intricate gold laser engravings, this hand-crank music box plays the classic Happy Birthday tune - a heartfelt, nostalgic gift that will be treasured for years to come.  Plays: Happy Birthday melody - hand-crank operated, no batteries needed  Material: Premium...", price: 699.0, compareAtPrice: 999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/710vUgbQm-L._SL1200.jpg?v=1778357717", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Wn1wICHlL.jpg?v=1778357732", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/610edhGyEJL._SL1080.jpg?v=1778357733", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/618ckIXdYQL._SL1200.jpg?v=1778357733", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61C30gwTGzL._SL1200.jpg?v=1778357733", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61FKBP1I1VS._SL1200.jpg?v=1778357733", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61i15se3xTL._SL1207.jpg?v=1778357733"], categorySlug: "home-living", stock: 0, rating: 3.8, reviewCount: 5, featured: true, tags: ["birthday gift", "hand crank", "music box", "unique gift", "wooden gift"] },
  { name: "Nordic Donut Ceramic Vase | Matte White Ring Vase for Home Decor", slug: "nordic-donut-ceramic-vase-matte-white-ring-vase-for-home-decor", description: "Elevate your living space with the effortlessly chic Nordic Donut Ceramic Vase - a minimalist masterpiece inspired by Scandinavian design. Its iconic hollow ring shape and smooth matte white finish make it a versatile statement piece that pairs beautifully with dried flowers, pampas grass, fresh blooms, or tropical leaves.  Material: Premium ceramic - smooth matte finish, sturdy &amp;...", price: 899.0, compareAtPrice: 1299.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AO8RwOCjL._SL1000.jpg?v=1778357288", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Gmb6W-gxL._SL1000.jpg?v=1778357307", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61aA11rt6WL._SL1500.jpg?v=1778357308", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71JGVt56JfL._SL1500.jpg?v=1778357307", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71QJg0TuB5L._SL1500.jpg?v=1778357308", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/813Kzy7rfqL._SL1500.jpg?v=1778357309"], categorySlug: "couple-gifts", stock: 0, rating: 3.9, reviewCount: 8, featured: false, tags: ["ceramic vase", "donut vase", "home decor", "minimalist gift", "nordic decor"] },
  { name: "Golden Love Swan Couple Brass Figurine | Decorative Bird Statue for Home", slug: "golden-love-swan-couple-brass-figurine-decorative-bird-statue-for-home", description: "Celebrate love, loyalty, and togetherness with this stunning Golden Love Swan Couple Brass Figurine . Handcrafted from premium brass, this pair of graceful swans facing each other symbolises eternal love and harmony - making it a cherished gift for couples and a timeless addition to any home.  Material: Premium brass - heavy, durable &amp; tarnish-resistant ✨ Design: Intricate hand-etched feather...", price: 1399.0, compareAtPrice: 1999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71qLW6UYAFL._SL1500.jpg?v=1778357058", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/712PvDdCx-L._SL1500.jpg?v=1778357070", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71dqWPtnG8L._SL1500.jpg?v=1778357071", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81UjJy9ZlEL._SL1500.jpg?v=1778357072"], categorySlug: "couple-gifts", stock: 0, rating: 4.0, reviewCount: 11, featured: false, tags: ["brass figurine", "home decor", "love gift", "swan couple", "wedding gift"] },
  { name: "Palm Buddha Resin Statue | Black & Gold Meditating Buddha Figurine", slug: "palm-buddha-resin-statue-black-gold-meditating-buddha-figurine", description: "Invite peace, prosperity, and positive energy into your home with this exquisite Palm Buddha Resin Statue . Masterfully crafted, the serene Buddha figure rests within a cupped hand - symbolising protection, wisdom, and divine grace. The striking matte black finish with rich gold accents makes this a timeless décor piece that elevates any space.  Material: Premium resin - lightweight, durable...", price: 1099.0, compareAtPrice: 1599.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81uBEI52sjL._SL1500.jpg?v=1778356860", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51wl3l_PFvL._SL1500.jpg?v=1778356881", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61508Q1_8qL._SL1500.jpg?v=1778356881", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61932TX-eDL._SL1500.jpg?v=1778356881", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61mK8W7ZbxL._SL1500.jpg?v=1778356881", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61tOpN9U8NL._SL1500.jpg?v=1778356881", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71HIrj4VX5L._SL1500.jpg?v=1778356882", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Zy65yepIL._SL1500.jpg?v=1778356882"], categorySlug: "couple-gifts", stock: 0, rating: 4.1, reviewCount: 14, featured: true, tags: ["buddha statue", "Diwali gift", "home decor", "resin figurine", "spiritual gift"] },
  { name: "Golden Crescent Moon Metal Planter | Luxury Desk Planter with Stand", slug: "golden-crescent-moon-metal-planter-luxury-desk-planter-with-stand", description: "Bring celestial elegance to your space with this Golden Crescent Moon Metal Planter - a showstopper that's equal parts art and nature. The graceful crescent moon-shaped iron stand cradles a gleaming gold spherical pot, creating a dramatic yet delicate display perfect for succulents, air plants, or small indoor greens.  Material: Premium iron metal with gold finish - sturdy &amp; rust-resistant ✨...", price: 1299.0, compareAtPrice: 1799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cvpKv9PxL._SL1500.jpg?v=1778356599", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51bqXdb4V8L._SL1500.jpg?v=1778356618", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51lN-KKP--L._SL1500.jpg?v=1778356618", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51nr0UlpXVL._SL1500.jpg?v=1778356618", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51vZUuTr6GL._SL1500.jpg?v=1778356618", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Cgd4xZ6lL._SL1500.jpg?v=1778356618", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61KD1NUbgnL._SL1500.jpg?v=1778356619"], categorySlug: "couple-gifts", stock: 0, rating: 4.2, reviewCount: 17, featured: false, tags: ["gold planter", "home decor", "luxury gift", "metal planter", "moon planter"] },
  { name: "Dreamy Girl Resin Planter Pot | Decorative Face Planter", slug: "dreamy-girl-resin-planter-pot-decorative-face-planter", description: "Meet your new favourite desk companion! This whimsical Dreamy Girl Resin Planter features a charming hand-painted girl figure with lavender hair, rosy cheeks, and a serene smile - resting her face in her hands like she's lost in a daydream. The open top doubles as a planter, making it a perfect blend of art and nature.  Material: Premium resin - durable, lightweight &amp; water-resistant  Design:...", price: 849.0, compareAtPrice: 999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71FT2h9bX0L._SL1500.jpg?v=1778356317", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71IEESwueGL._SL1500.jpg?v=1778356371", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Ic-NFwePL._SL1500.jpg?v=1778356370", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71K3_j8TjXL._SL1500.jpg?v=1778356371", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71LhzjzNszL._SL1500.jpg?v=1778356371", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Np7iDHvUL._SL1500.jpg?v=1778356371", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71W3phXw9zL._SL1500.jpg?v=1778356371", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71rLf_oODQL._SL1500.jpg?v=1778356371", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71v-VPonzQL._SL1500.jpg?v=1778356371"], categorySlug: "home-living", stock: 0, rating: 4.3, reviewCount: 20, featured: false, tags: ["desk decor", "face planter", "gift for her", "home decor", "resin planter"] },
  { name: "Executive Corporate Gift Set – Notebook, Card Holder, Pen & Keychain (4-in-1)", slug: "executive-corporate-gift-set-notebook-card-holder-pen-keychain-4-in-1", description: "Executive Corporate Gift Set - The Complete Professional Package Make a lasting impression with this premium 4-in-1 Executive Corporate Gift Set - thoughtfully curated for professionals, leaders, and go-getters. Whether it's a corporate gifting occasion, employee appreciation, or a business milestone, this set delivers elegance and utility in one beautifully presented orange gift box. What's...", price: 1299.0, compareAtPrice: 1799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41D9WLaBbpL.jpg?v=1777523269", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/212s3xVoJbL.jpg?v=1777523382", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41Q15WRjtzL._SX522.jpg?v=1777523382", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41VcbhJdQTL.jpg?v=1777523382", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41zeruZGQ_L.jpg?v=1777523382", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51sQYzfCJdL.jpg?v=1777523382"], categorySlug: "home-living", stock: 0, rating: 4.4, reviewCount: 23, featured: true, tags: ["corporate gift", "executive gift set", "notebook gift", "office gift", "premium gift"] },
  { name: "The Man Company Oud Regal Eau de Parfum 100ml – Pour Homme", slug: "the-man-company-oud-regal-eau-de-parfum-100ml-pour-homme", description: "The Man Company Oud Regal - Bold. Powerful. Unforgettable. Some fragrances whisper. Oud Regal commands. Crafted for the man who owns every room he walks into, this premium Eau de Parfum by The Man Company draws from the heart of Arabic perfumery tradition - rare oud, warm saffron, and deep resins - to create a scent that is nothing short of regal. Housed in a deep amber glass bottle with a bold...", price: 2799.0, compareAtPrice: 3499.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61wg5Dt8JxL._SL1100.jpg?v=1777522121", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/511ATPKNu9L._SL1100.jpg?v=1777522142", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51WrfW1cZkL._SX522.jpg?v=1777522141", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/616Mfglc5IL._SL1100.jpg?v=1777522142", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61v6Ryi4U4L._SL1100.jpg?v=1777522142", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61yfFFw70qL._SL1100.jpg?v=1777522142", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716q-9Npp2L._SL1100.jpg?v=1777522142", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71DNoBKT-9L._SL1100.jpg?v=1777522142", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71p5RT6wuAL._SL1100.jpg?v=1777522142"], categorySlug: "fragrances", stock: 0, rating: 4.5, reviewCount: 26, featured: false, tags: ["eau de parfum", "luxury gift", "mens fragrance", "oud regal", "the man company"] },
  { name: "Lattafa Pride Shaheen Gold Eau de Parfum 100ml", slug: "lattafa-pride-shaheen-gold-eau-de-parfum-100ml", description: "Lattafa Pride Shaheen Gold - Soar Above the Ordinary Inspired by the majestic Shaheen falcon - a symbol of power, nobility, and freedom - Shaheen Gold by Lattafa Pride is a regal Eau de Parfum that commands respect. The iconic frosted gold bottle crowned with a sculpted falcon in flight is a collector's masterpiece before you even experience the scent. Rich, warm, and deeply oriental, this...", price: 4499.0, compareAtPrice: 5499.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Av7nf32qL._SL1200.jpg?v=1777521886", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41pOUcep22L._SL1200.jpg?v=1777521898", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/513irOSYYOL._SL1200.jpg?v=1777521899", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51wvc5BhVkL._SL1000.jpg?v=1777521899"], categorySlug: "fragrances", stock: 0, rating: 4.6, reviewCount: 29, featured: false, tags: ["eau de parfum", "lattafa", "luxury gift", "oud fragrance", "shaheen gold"] },
  { name: "Bla Bli Blu Ivory Oud Parfum 100ml", slug: "bla-bli-blu-ivory-oud-parfum-100ml", description: "Bla Bli Blu Ivory Oud - Raw. Rare. Unforgettable. Bold in colour, bolder in scent. Ivory Oud by Bla Bli Blu is a statement-making unisex parfum that commands attention from the first spray. Housed in a striking matte crimson red bottle with an architectural silhouette, this fragrance is as visually arresting as it is olfactorily captivating. At its heart lies a rich, creamy oud accord softened by...", price: 3999.0, compareAtPrice: 4999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61mNqpSRf0L._SL1500.jpg?v=1777521129", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51QDQrPLxTL._SL1500.jpg?v=1777521148", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61HE30S1IuL._SL1500.jpg?v=1777521149", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61OHCD2dmML._SL1500.jpg?v=1777521149", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71J54tWZgjL._SL1500.jpg?v=1777521149"], categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 32, featured: true, tags: ["bla bli blu", "ivory oud", "luxury gift", "parfum", "unisex fragrance"] },
  { name: "The Man Company Perfume Gift Set – Black, Blanc, Fire & Night (4 x 50ml)", slug: "the-man-company-perfume-gift-set-black-blanc-fire-night-4-x-50ml", description: "The Man Company - 4-Fragrance Gift Set Four iconic scents. One legendary gift. The The Man Company Perfume Gift Set brings together four distinct fragrances - Black, Blanc, Fire &amp; Night - each crafted for the modern man who knows exactly who he is. With up to 20% perfume oil concentration and 8-10 hours of long-lasting wear , these are fragrances that mean business. What's Inside Black (Eau...", price: 2499.0, compareAtPrice: 3499.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61CHYO2caVL._SL1100.jpg?v=1777520430", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51YHmOKd_uL._SL1100.jpg?v=1777520455", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/610pJcjBAZL._SL1100.jpg?v=1777520455", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61gudMwXHLL._SL1100.jpg?v=1777520456", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hP2czTpuL._SL1100.jpg?v=1777520455", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61lpDR58ryL._SL1100.jpg?v=1777520455", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AATi-UZSL._SL1100.jpg?v=1777520456", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71b_RkUVQEL._SL1100.jpg?v=1777520454"], categorySlug: "fragrances", stock: 0, rating: 4.8, reviewCount: 35, featured: false, tags: ["eau de parfum", "luxury gift", "mens fragrance", "perfume gift set", "the man company"] },
  { name: "Eze Magic Perfume – Luxury Sphere Fragrance", slug: "eze-magic-perfume-luxury-sphere-fragrance", description: "Eze Magic - Where Sorcery Meets Scent Introducing Eze Magic - a one-of-a-kind luxury perfume that captivates before you even open it. Encased in a stunning matte gold spherical bottle, this fragrance is as much a work of art as it is a sensory experience. The iconic orb splits open to reveal a precision spray nozzle - pure theatre, pure magic. Fragrance Profile Top Notes: Cinnamon, Pink Pepper,...", price: 2999.0, compareAtPrice: 3999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hCdP5svEL._SL1024.jpg?v=1777487344", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51TSrM_ns1L._SL1088.jpg?v=1777487363", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/612r68-vm8L._SL1088.jpg?v=1777487365", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Wl4aSJiAL._SL1080.jpg?v=1777487364", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61c9iY4D2XL._SL1080.jpg?v=1777487364", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71LZsro49uL._SL1088.jpg?v=1777487365", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71PgLaLcFXL._SL1088.jpg?v=1777487365"], categorySlug: "fragrances", stock: 0, rating: 4.9, reviewCount: 38, featured: false, tags: ["eze magic", "gift perfume", "luxury perfume", "oriental fragrance", "unique bottle"] },
  { name: "Ajmal Oud of Dubai Eau de Parfum 100ml", slug: "ajmal-oud-of-dubai-eau-de-parfum-100ml", description: "Ajmal Oud of Dubai - The Essence of Arabian Luxury Transport yourself to the golden sands and opulent palaces of Dubai with Oud of Dubai by Ajmal - one of the most prestigious names in Middle Eastern perfumery. This rich, warm, and deeply sensual Eau de Parfum captures the soul of the Arabian Peninsula in every spray. Fragrance Profile Top Notes: Saffron, Rose, Bergamot Heart Notes: Oud...", price: 4999.0, compareAtPrice: 5999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716juhp9cAL._SL1500.jpg?v=1777487051", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61EqyCC--0L._SL1500.jpg?v=1777487064", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AH9AhAQqL._SL1500.jpg?v=1777487065", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71GwcT8J-HL._SL1500.jpg?v=1777487064"], categorySlug: "fragrances", stock: 0, rating: 5.0, reviewCount: 41, featured: true, tags: ["ajmal", "eau de parfum", "gift", "luxury perfume", "oud"] },
  { name: "Contraband Hands Off Eau de Parfum", slug: "contraband-hands-off-eau-de-parfum", description: "Contraband Hands Off - The Scent of Bold Moves Dare to be different. Contraband Hands Off is a daring, dark, and seductive men's Eau de Parfum crafted for those who play by their own rules. Housed in a striking asymmetric dark glass bottle, this fragrance is as bold as the man who wears it. Fragrance Profile Top Notes: Bergamot, Black Pepper, Cardamom Heart Notes: Leather, Oud, Smoky Vetiver Base...", price: 3499.0, compareAtPrice: 4299.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81g0mVyrVZL._SL1500.jpg?v=1777486781", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61WyXC2wLLL._SL1500.jpg?v=1777486794", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61fbKgGr6hL._SL1200.jpg?v=1777486795", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/91415h4cRhL._SL1500.jpg?v=1777486795", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71WuYa_1CyL._SL1500.jpg?v=1777486795", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81hNelcYNPL._SL1500.jpg?v=1777486796"], categorySlug: "fragrances", stock: 0, rating: 3.8, reviewCount: 44, featured: false, tags: ["eau de parfum", "gift", "luxury", "mens fragrance", "perfume"] },
  { name: "WildHorn 3-in-1 Men's Gift Set – Genuine Leather Wallet, Keychain & Pen", slug: "wildhorn-3-in-1-mens-gift-set-genuine-leather-wallet-keychain-pen", description: "Three Essentials. One Iconic Brand. Zero Compromise. Crafted for the man who appreciates quality in every detail, the WildHorn 3-in-1 Men's Gift Set brings together three everyday essentials in one cohesive, premium collection. The off-white leather wallet is a bold style statement, the branded leather keychain adds a rugged charm, and the sleek ballpoint pen completes the set with...", price: 999.0, compareAtPrice: 1499.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81QPrL3sobL._SL1500.jpg?v=1776975330", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41Mj2nA7agL._SL1440.jpg?v=1776975358", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61tWCfAZfvL._SX679.jpg?v=1776975359", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51QeAcXjGhL._SL1500.jpg?v=1776975359", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_a2CcjWVL._SL1500.jpg?v=1776975359", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ff--jCyML._SL1500.jpg?v=1776975359", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/713wShl9elL._SL1500.jpg?v=1776975360", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71WI6IUR5mL._SL1500.jpg?v=1776975360", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/718qAam-8GL._SL1500.jpg?v=1776975360"], categorySlug: "leather-goods", stock: 15, rating: 3.9, reviewCount: 47, featured: false, tags: ["corporate gift", "keychain gift", "leather wallet", "men's gift set", "WildHorn"] },
  { name: "WildHorn Genuine Leather Slim Bifold Wallet – Teal Blue", slug: "wildhorn-genuine-leather-slim-bifold-wallet-teal-blue", description: "Real Leather. Real Style. Real Everyday. Not all wallets are created equal. The WildHorn Genuine Leather Slim Bifold Wallet in striking teal blue is crafted from full-grain leather that develops a rich, personal patina over time - getting better with every use, every adventure, every story. The smooth, burnished finish gives it a vintage yet contemporary feel, while the iconic WildHorn brass logo...", price: 799.0, compareAtPrice: 1299.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/615Xib7EkuL._SL1014.jpg?v=1776975099", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61SAlRCFWpL._SL1014.jpg?v=1776975119", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61wKNk2n_DL._SL1340.jpg?v=1776975120", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71HQKLBR1yL._SL1500.jpg?v=1776975120", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/91Nb0t_2_0L._SL1500.jpg?v=1776975121"], categorySlug: "leather-goods", stock: 15, rating: 4.0, reviewCount: 50, featured: true, tags: ["bifold wallet", "genuine leather wallet", "gift for men", "men's wallet", "WildHorn"] },
  { name: "Men's Woven Texture Slim Bifold Leather Wallet – Dark Brown with Metal Logo", slug: "mens-woven-texture-slim-bifold-leather-wallet-dark-brown-with-metal-logo", description: "Carry Less. Look More. Some accessories whisper luxury - this one speaks it fluently. The Men's Woven Texture Slim Bifold Wallet in deep dark brown is crafted with an intricate diamond woven emboss pattern that catches the light just right, paired with a signature silver metal logo charm that adds a boutique, high-end finish. Slim enough to slide into any pocket, yet spacious enough to hold...", price: 499.0, compareAtPrice: 799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51qC0XooIGL.jpg?v=1776974769", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41jM09w8HPL.jpg?v=1776974787", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61ExP5xdVmL.jpg?v=1776974787", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61e-oLFr21L._SY879.jpg?v=1776974787"], categorySlug: "leather-goods", stock: 15, rating: 4.1, reviewCount: 53, featured: false, tags: ["bifold wallet", "gift for men", "leather wallet", "men's wallet", "premium wallet"] },
  { name: "Premium 4-in-1 Men's Gift Set – Watch, Perfume, Belt & Wallet in Red Gift Box", slug: "premium-4-in-1-mens-gift-set-watch-perfume-belt-wallet-in-red-gift-box", description: "The Ultimate Gift for the Man Who Has Everything Four essentials. One stunning red box. Zero effort on your part. The Premium 4-in-1 Men's Gift Set brings together the most-loved accessories a man reaches for every single day - a classic watch, a signature fragrance, a leather belt, and a sleek wallet - all beautifully arranged in a bold red luxury gift box that's ready to present the moment it...", price: 1799.0, compareAtPrice: 2499.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81uO-rAPMpL._SX679.jpg?v=1776974518", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/6103545_fsL._SX679.jpg?v=1776974487", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61pXozbm1xL._SX679.jpg?v=1776974517"], categorySlug: "leather-goods", stock: 15, rating: 4.2, reviewCount: 6, featured: false, tags: ["corporate gift", "Father's Day gift", "men's gift set", "perfume gift", "watch gift"] },
  { name: "For the Man with Style – Premium Men's Gift Hamper", slug: "for-the-man-with-style-premium-mens-gift-hamper", description: "The Perfect Gift for Every Man Who Means Business Curated for the modern gentleman, this luxurious 4-in-1 gift hamper brings together everyday essentials in one sleek black gift box. Whether it's a birthday, anniversary, corporate gift, or just because - this set says it all. What's Inside the Box: Stainless Steel Thermal Flask - Keep beverages hot or cold for hours. Matte black finish with a...", price: 1999.0, compareAtPrice: 2799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/611x18rL3HL._SL1080.jpg?v=1776971688", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51wETvBLFLL._SL1024.jpg?v=1776971711", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/612N3iZJ7PL._SL1080.jpg?v=1776971712", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61LAs6NkWFL._SL1082.jpg?v=1776971712", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61MVpPA1vqL._SL1280.jpg?v=1776971712", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61joh9SrUdL._SL1297.jpg?v=1776971712", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g-wMzJ_TL._SL1500.jpg?v=1776971713", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hddOBlvAL._SL1280.jpg?v=1776971712", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71tSzM9qUfL._SL1500.jpg?v=1776971712"], categorySlug: "leather-goods", stock: 15, rating: 4.3, reviewCount: 9, featured: true, tags: ["birthday gift", "corporate gift", "gift hamper", "leather wallet", "men's gift"] },
  { name: "Rose of No Man's Land Premium PU Leather Makeup & Travel Organiser Bag", slug: "rose-of-no-mans-land-premium-pu-leather-makeup-travel-organiser-bag", description: "Carry Your World in Style Meet the bag that makes getting ready feel like a luxury ritual. The Rose of No Man's Land Premium Makeup &amp; Travel Organiser is crafted in rich tan PU leather with gold-tone hardware - a bag that looks as good on your vanity as it does in your suitcase. Open it up and discover a thoughtfully designed interior with multiple fabric-lined compartments and pockets ,...", price: 899.0, compareAtPrice: 1299.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71qSTWtRyAL._SL1500.jpg?v=1776972506", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_0Ffcf45L._SL1500.jpg?v=1776972540", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71hj2Nr1dsL._SL1500.jpg?v=1776972541", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/815a4WOZOQL._SL1500.jpg?v=1776972542", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81GmYgAQdNL._SL1500.jpg?v=1776972541", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81JMCAllF_L._SL1500.jpg?v=1776972542", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81VpRyilS9L._SL1500.jpg?v=1776972542"], categorySlug: "fashion", stock: 15, rating: 4.4, reviewCount: 12, featured: false, tags: ["beauty gift", "cosmetic pouch", "makeup bag", "travel organiser", "women's gift"] },
  { name: "Executive 3-in-1 Men's Gift Set – Woven Leather Wallet, Keychain & Pen", slug: "executive-3-in-1-mens-gift-set-woven-leather-wallet-keychain-pen", description: "Gifting Made Effortlessly Impressive For the man who commands attention in every room - the Executive 3-in-1 Men's Gift Set is a curated collection of everyday essentials, presented in a premium matte black gift box with a gold embossed logo. Sophisticated, practical, and ready to gift. Whether it's for a birthday, work anniversary, promotion, or festive occasion - this set makes a statement...", price: 1299.0, compareAtPrice: 1799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51x7bf9rv9L.jpg?v=1776973749", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/415qEA-XBaL.jpg?v=1776973791", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41E_dFsMe6L.jpg?v=1776973791", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41L6oGM0_yL.jpg?v=1776973791", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51nAP38CieL._SL1280.jpg?v=1776973791", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cTpSYPtdL.jpg?v=1776973791"], categorySlug: "leather-goods", stock: 15, rating: 4.5, reviewCount: 15, featured: false, tags: ["birthday gift", "corporate gift", "executive gift", "men's gift", "wallet gift set"] },
  { name: "Men's Reversible Textured Leather Belt – Black & Brown with Silver Buckle", slug: "mens-reversible-textured-leather-belt-black-brown-with-silver-buckle", description: "Two Belts. One Buckle. Endless Outfits. Why own one belt when you can have two? The Men's Reversible Textured Leather Belt flips effortlessly from sleek black to rich brown - giving you twice the versatility in a single, premium accessory. Whether you're dressing for the boardroom or a weekend dinner, this belt has you covered. The subtle woven check texture on the black side adds a refined,...", price: 599.0, compareAtPrice: 999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81hIaTcUUyL._SY606.jpg?v=1776973987", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41PbrrCWwOL._SY606.jpg?v=1776974025"], categorySlug: "leather-goods", stock: 15, rating: 4.6, reviewCount: 18, featured: true, tags: ["gift for men", "leather belt", "men's accessories", "men's belt", "reversible belt"] },
  { name: "Aurora Pastel Gemstone Link Bracelet – Moonston", slug: "aurora-pastel-gemstone-link-bracelet-moonston", description: "Soft, dreamy, and utterly feminine - the Aurora Pastel Gemstone Link Bracelet is a wrist full of quiet luxury. Inspired by the gentle hues of dawn, this bracelet features an alternating arrangement of mint green cat's eye cabochons, creamy moonstone ovals, and deep sapphire blue faceted crystals , all set in a delicate rose gold-tone link frame . Each stone catches the light differently - opaque,...", price: 699.0, compareAtPrice: 899.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61GIGhv955S._SY625.jpg?v=1776838316", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51G5kHKiu9S._SY625.jpg?v=1776838305", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/516sKovN9uS._SY625.jpg?v=1776838316", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51JBNLtPvQS._SY625.jpg?v=1776838316", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Kt_-vBmxS._SY625.jpg?v=1776838316"], categorySlug: "jewelry", stock: 15, rating: 4.7, reviewCount: 21, featured: false, tags: [] },
  { name: "Flutter Trio Butterfly Bangle – White, Gold & Black Enamel Cuff Bracelet", slug: "flutter-trio-butterfly-bangle-white-gold-black-enamel-cuff-bracelet", description: "Embrace transformation. The Flutter Trio Butterfly Bangle is a stunning gold-tone cuff bracelet that celebrates freedom, femininity, and grace - all in one breathtaking piece. Three beautifully detailed butterflies in white shell, matte gold, and black enamel sit gracefully along the bangle, each separated by a sparkling crystal rhinestone bezel . The rigid cuff silhouette with a secure hinged...", price: 899.0, compareAtPrice: 1100.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51UTFMZWTrL._SY625.jpg?v=1776838080", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/511J8-_WgrL._SY625.jpg?v=1776838094", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51A8U8PbWSL._SY625.jpg?v=1776838094", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Fek8GyCQL._SY625.jpg?v=1776838094", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/616XESnB1KL._SY625.jpg?v=1776838094", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61kd9haZ0sL._SY625.jpg?v=1776838094", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71IQR1SQugL._SY625.jpg?v=1776838094"], categorySlug: "jewelry", stock: 15, rating: 4.8, reviewCount: 24, featured: false, tags: [] },
  { name: "Amara Heart Locket Necklace – 18K Gold-Tone Engraved Heart Pendant", slug: "amara-heart-locket-necklace-18k-gold-tone-engraved-heart-pendant", description: "Some jewellery is worn. This one is felt . The Amara Heart Locket Necklace is a timeless, sentimental piece crafted for the woman who carries love close to her heart - literally. Featuring a beautifully engraved gold-tone heart locket pendant with an intricate swirl motif, suspended on a sleek snake chain , this necklace strikes the perfect balance between everyday elegance and emotional depth....", price: 799.0, compareAtPrice: 999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51BqqEpXlZL._SY695.jpg?v=1776837923", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61VLlmActxL._SY695.jpg?v=1776837913", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51IG7MJXtKL._SY625.jpg?v=1776837924", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51dRFS32w0L._SY695.jpg?v=1776837923", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51rE2urQDiL._SY695.jpg?v=1776837924", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61TSUNN-mVL._SY695.jpg?v=1776837924"], categorySlug: "jewelry", stock: 15, rating: 4.9, reviewCount: 27, featured: true, tags: [] },
  { name: "Celeste Swirl Stud Earrings – Emerald Green & Peach Crystal Gold-Tone", slug: "celeste-swirl-stud-earrings-emerald-green-peach-crystal-gold-tone", description: "Turn every glance into a double-take. The Celeste Swirl Stud Earrings are a bold, artistic jewellery piece that blends sculptural gold-tone curves with the rich brilliance of emerald green faceted crystals and a soft peach moonstone-style cabochon - a colour pairing that is both unexpected and utterly captivating. The fluid swirl design wraps elegantly around the stones, creating a dynamic,...", price: 799.0, compareAtPrice: 899.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51ESBttDFtL._SY625.jpg?v=1776837793", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/613DsEWdfCL._SY625.jpg?v=1776837778", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Ir8KFmVML._SY675.jpg?v=1776837793", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cf_QtCY0L._SX625.jpg?v=1776837793", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61y4gj3CkML._SY625.jpg?v=1776837793"], categorySlug: "jewelry", stock: 15, rating: 5.0, reviewCount: 30, featured: false, tags: [] },
  { name: "Peacock Soul Beaded Charm Bracelet – Chrysocolla & Blue Agate Stone Beads", slug: "peacock-soul-beaded-charm-bracelet-chrysocolla-blue-agate-stone-beads", description: "Wear the energy of nature on your wrist. The Peacock Soul Beaded Charm Bracelet is a stunning handcrafted piece featuring rich teal, turquoise, and cobalt blue stone beads - reminiscent of a peacock's iridescent plumage - paired with an ornate gold-tone peacock feather charm . Each bead carries a unique swirl of blue and green tones, making every bracelet one-of-a-kind. Whether worn as a...", price: 799.0, compareAtPrice: 999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Usb9RFekL._SY695.jpg?v=1776837558", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71m4zsvSjjL._SX695.jpg?v=1776837572", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71sIi91Z-5L._SY695.jpg?v=1776837572", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81RoGAw_X1L._SX695.jpg?v=1776837572", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81psjiLtUjL._SX695.jpg?v=1776837572", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81t874TlGlL._SX695.jpg?v=1776837572"], categorySlug: "jewelry", stock: 15, rating: 3.8, reviewCount: 33, featured: false, tags: [] },
  { name: "Lumière Chunky Gold Huggie Hoop Earrings", slug: "lumiere-chunky-gold-huggie-hoop-earrings", description: "Less is more - and these say it all. The Lumière Chunky Gold Huggie Hoops are the ultimate everyday luxury earring, crafted for women who appreciate clean, confident style with a polished finish. Featuring a wide, smooth gold-tone band with a high-gloss mirror finish, these huggies sit snugly against the earlobe for a sleek, modern look. The bold chunky profile adds weight and presence without...", price: 599.0, compareAtPrice: 899.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g_74zKC6L._SY625.jpg?v=1776837312", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41cK16ts_vL._SY625.jpg?v=1776837326", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51hU4yABbaL._SY625.jpg?v=1776837327", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71n8b0PtPEL._SY625.jpg?v=1776837327", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61yljJzqyGL._SY625.jpg?v=1776837327", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61CUY0iyFXL._SY695.jpg?v=1776837327"], categorySlug: "jewelry", stock: 15, rating: 3.9, reviewCount: 36, featured: true, tags: [] },
  { name: "Noir Heart Gold Bangle – Crystal & Enamel Heart Bracelet", slug: "noir-heart-gold-bangle-crystal-enamel-heart-bracelet", description: "Make a bold yet romantic statement with the Noir Heart Gold Bangle - a luxurious gold-tone cuff bracelet that beautifully blends love-inspired design with premium craftsmanship. Featuring a striking black enamel centre heart , surrounded by open gold heart links and sparkling crystal-set bezels , this bangle exudes confidence and elegance in equal measure. The rigid cuff silhouette with a secure...", price: 999.0, compareAtPrice: 1100.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61zEkPSefOL._SX625.jpg?v=1776837002", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/514lesO9giL._SY695.jpg?v=1776837021", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51pERDGxuuL._SX625.jpg?v=1776837021", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61A4ksBHnEL._SX625.jpg?v=1776837021", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61uVGyeP-tL._SY695.jpg?v=1776837021", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61yGR7J2C3L._SY625.jpg?v=1776837021"], categorySlug: "jewelry", stock: 15, rating: 4.0, reviewCount: 39, featured: false, tags: [] },
  { name: "Aurelia Gold Hand Chain Bracelet – Slave Bracelet with Ring", slug: "aurelia-gold-hand-chain-bracelet-slave-bracelet-with-ring", description: "Adorn your hands with effortless elegance. The Aurelia Gold Hand Chain Bracelet is a stunning slave bracelet that drapes gracefully from your finger to your wrist, creating a layered, goddess-like effect that turns heads at every occasion. Crafted with a delicate gold-tone satellite chain featuring evenly spaced ball beads, this hand harness combines bohemian charm with modern luxury. The...", price: 569.0, compareAtPrice: 899.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61C82Y0gpEL._SY625.jpg?v=1776836844", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/614ipz-JVqL._SY625.jpg?v=1776836855", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61jPljt83CL._SY625.jpg?v=1776836855"], categorySlug: "jewelry", stock: 15, rating: 4.1, reviewCount: 42, featured: false, tags: [] },
  { name: "Glam Collection – 21-Pair Mixed Stud Earring Set", slug: "glam-collection-21-pair-mixed-stud-earring-set", description: "Elevate every look with our Glam Collection 21-Pair Mixed Stud Earring Set - a curated assortment of charming, fashion-forward earrings perfect for gifting or building your everyday jewellery wardrobe. This delightful set includes a variety of styles - from crystal studs, pearl accents, and gold-tone hearts to playful floral, moon, bow, and shell motifs , plus fun novelty designs like love...", price: 899.0, compareAtPrice: 1100.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71SkAVXh7PL._SY625.jpg?v=1776836614", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61_M5a9E-SL._SY695.jpg?v=1776836631", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61dsieEf9mL._SY695.jpg?v=1776836631"], categorySlug: "jewelry", stock: 15, rating: 4.2, reviewCount: 45, featured: true, tags: [] },
  { name: "Artifi Gold Bracelet for Men & Women | Adjustable Designer Bangle with Blue Evil Eye Charm | Anti Tarnish Fashion Jewelry | Stylish Daily Wear Bracelet Gift for Unisex Adults", slug: "artifi-gold-bracelet-for-men-women-adjustable-designer-bangle-with-blue-evil-eye-charm-anti-tarnish-fashion-jewelry-stylish-daily-wear-bracelet-gift-for-unisex-adults", description: "Stylish Gold Bracelet Set for Women - Artifi gold plated bracelet set designed with multiple styles including chain bracelet, crystal bracelet, and cuff bracelet, perfect fashion jewelry set for women and girls. Premium Crystal and Stone Design - Features high-quality crystal studded bracelet and stone charm bracelet that adds shine and elegance, making it a perfect designer bracelet set for...", price: 999.0, compareAtPrice: 1399.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/516TaGZ77AL._SY625.jpg?v=1776836471", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61REvVm5XlL._SY625.jpg?v=1776836485", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61kqNYyrQYL._SY695.jpg?v=1776836485", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61uNiriVrhL._SY625.jpg?v=1776836485"], categorySlug: "jewelry", stock: 15, rating: 4.3, reviewCount: 48, featured: false, tags: [] },
  { name: "Elegant Gold-Plated Crystal Bangle for Women | Stylish, Durable Anti-Tarnish, Stainless Steel Bracelet | Perfect for Parties & Event Wear", slug: "elegant-gold-plated-crystal-bangle-for-women-stylish-durable-anti-tarnish-stainless-steel-bracelet-perfect-for-parties-event-wear", description: "ELEGANT DESIGN: Features a stunning double-row crystal embellishment on a gold-plated bangle, adding a touch of glamour to any party or event outfit. PREMIUM MATERIAL: Crafted from high-grade stainless steel with a lustrous gold plating, this bracelet is built for long-lasting durability and everyday wear. HYPOALLERGENIC CONSTRUCTION: Made with skin-friendly, hypoallergenic materials, making it...", price: 999.0, compareAtPrice: 1299.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61-VlFFr8GL._SY695.jpg?v=1776836297", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/5136pZlvrCL._SY675.jpg?v=1776836311", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51oKmPDLYpL._SY625.jpg?v=1776836311", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61-bD5ulO5L._SY695.jpg?v=1776836311", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61ObWJWxwrL._SY625.jpg?v=1776836312", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61UDmc1xINL._SY625.jpg?v=1776836312"], categorySlug: "jewelry", stock: 15, rating: 4.4, reviewCount: 51, featured: false, tags: [] },
  { name: "Forever Yes – Romantic Proposal Couple Figurine Set – Car Dashboard Decor", slug: "romantic-couple-proposal-figurine-set-car-dashboard-decor", description: "Some moments deserve to be remembered forever. The Forever Yes Romantic Proposal Couple Figurine Set captures the most magical moment in love - the proposal - in a beautifully crafted, hand-painted resin miniature that you'll treasure for years to come. The dapper boy kneels on one knee, red rose in hand, ring extended with hope and devotion. The charming girl in her flowing red gown and golden...", price: 599.0, compareAtPrice: 799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71caXBpEzDL._SL1500.jpg?v=1776627940", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61BKtEgQVVL._SL1500.jpg?v=1776627955", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61VaRGDU2vL._SL1500.jpg?v=1776627956"], categorySlug: "romantic-gifts", stock: 15, rating: 4.5, reviewCount: 54, featured: true, tags: [] },
  { name: "Best Wifey In The World – Decorative Wooden Tab", slug: "best-wifey-in-the-world-wooden-table-plaque", description: "She deserves to know it every single day. The \"Best Wifey In The World\" Wooden Table Plaque is a vibrant, heartfelt keepsake that celebrates the most important person in your life - in bold, beautiful style. Crafted from premium MDF wood with a striking black cutout silhouette base , this freestanding plaque features vivid multicolour typography - orange, pink, and grey lettering with a playful...", price: 499.0, compareAtPrice: 699.99, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81KhVm4Kd6L._SL1500.jpg?v=1776627543", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71NnaDI9jUL._SL1500.jpg?v=1776627568", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ubWbyG_rL._SL1500.jpg?v=1776627569", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/816nvYSaaRL._SL1500.jpg?v=1776627570", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81TIAWLypyL._SL1500.jpg?v=1776627570", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81cTVYwEDML._SL1500.jpg?v=1776627570"], categorySlug: "romantic-gifts", stock: 15, rating: 4.6, reviewCount: 7, featured: false, tags: [] },
  { name: "Forever Yours – Romantic Wedding Couple Resin Figurine", slug: "forever-in-your-arms-romantic-couple-figurine", description: "Love lifted me. The Forever Yours Romantic Wedding Couple Figurine captures the most tender moment of a wedding day - the groom sweeping his bride off her feet, both lost in a smile that says \"this is everything.\" Hand-painted with exquisite attention to detail, this charming resin sculpture features a groom in a classic black tuxedo holding his bride in a flowing white gown , her golden hair...", price: 449.99, compareAtPrice: 699.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g87QxbdeL._SL1500__1.jpg?v=1776627237", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61_Czh017zL._SL1500.jpg?v=1776627254", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/610nRp2eBqL._SL1500.jpg?v=1776627255", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61APySTSAYL._SL1500.jpg?v=1776627254", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61eYMJ1u6RL._SL1500.jpg?v=1776627254", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g87QxbdeL._SL1500.jpg?v=1776627255", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61oC85yW5BL._SL1500.jpg?v=1776627254"], categorySlug: "romantic-gifts", stock: 15, rating: 4.7, reviewCount: 10, featured: false, tags: [] },
  { name: "Crystal Teddy Bear – Happy Birthday Glass Figurine Keepsake", slug: "sweetheart-birthday-bear-crystal-glass-edition", description: "Some gifts are forgotten. This one is kept forever. The Crystal Teddy Bear Happy Birthday Figurine is a breathtaking keepsake crafted from premium faceted crystal glass - catching light from every angle and filling any space with a soft, magical shimmer. This adorable bear holds a delicate heart-shaped \"Happy Birthday\" plaque and wears a charming pink crystal bow at its chest - every detail...", price: 299.0, compareAtPrice: 489.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71lvIdpjVjL._SL1500.jpg?v=1776626785", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61sknW_-SUL._SL1500.jpg?v=1776626807", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/711pmFbx5BL._SL1500.jpg?v=1776626808", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71R0XSioxlL._SL1500.jpg?v=1776626808"], categorySlug: "romantic-gifts", stock: 15, rating: 4.8, reviewCount: 13, featured: true, tags: [] },
  { name: "Teal Sip Set – Turquoise Ceramic Coffee Mugs, Set of 4 (200ml)", slug: "solimo-ceramic-coffee-mugs", description: "Start every morning with colour, warmth, and style. The Teal Sip Set brings together four beautifully crafted vibrant turquoise ceramic mugs - a cheerful, coordinated set that transforms your daily brew into a little moment of joy. Each mug holds a generous 200ml - the perfect size for a rich espresso, a comforting chai, or your favourite afternoon tea. Crafted from 100% food-grade ceramic ,...", price: 399.0, compareAtPrice: 498.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71NdtEN_aWL._SL1500.jpg?v=1776625863", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51IyJ-kNDOL._SL1500.jpg?v=1776625884", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/6149ZjiMBYL._SL1500.jpg?v=1776625886", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71INbq_ZzSL._SL1500.jpg?v=1776625886", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71WjSQpHNoL._SL1500.jpg?v=1776625886", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71gFZOeJLcL._SL1500.jpg?v=1776625885", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71hZ9MOU-LL._SL1500.jpg?v=1776625885", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/815B-akw_0L._SL1500.jpg?v=1776625886"], categorySlug: "couple-gifts", stock: 15, rating: 4.9, reviewCount: 16, featured: false, tags: [] },
  { name: "Luxe Sip Glass Tumbler – 400ml Borosilicate Can Glass with Straw & Lid", slug: "kikiluxxa-glass-coffee-sipper-tumbler-mug-with-straw-and-lid", description: "Elevate every sip. The Luxe Sip Glass Tumbler is where premium craftsmanship meets everyday indulgence - a beautifully designed 400ml borosilicate glass tumbler that makes your morning coffee, afternoon bubble tea, or evening cocktail feel like a luxury ritual. Crafted in a sleek can-shaped silhouette with a leather-wrapped exterior for a tactile, slip-resistant grip, this tumbler is as...", price: 400.0, compareAtPrice: 600.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61JlzOYPsdL.jpg?v=1776625611", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41SQLEt1V0L.jpg?v=1776625640", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/517vBFHIHaL.jpg?v=1776625640", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51WyF7mSrzL.jpg?v=1776625640", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51cOuls3p4L.jpg?v=1776625640", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71xn2swop3L._SL1500.jpg?v=1776625641"], categorySlug: "couple-gifts", stock: 15, rating: 5.0, reviewCount: 19, featured: false, tags: [] },
  { name: "Park Avenue Good Morning 7-in-1 Men's Grooming Kit with Free Travel Pouch", slug: "park-avenue-good-morning-grooming-collection-7-in-1-combo-grooming-kit", description: "The Gentleman's Grooming Ritual, Perfectly Packaged Start every morning with confidence. The Park Avenue Good Morning 7-in-1 Grooming Kit is a premium, all-in-one collection that gives every man everything he needs for a smooth, refreshing, and confident start to his day - beautifully presented in a free travel pouch , ready to gift or carry anywhere. From a rich lather shaving cream infused with...", price: 699.0, compareAtPrice: 999.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_oZ0PCZwL._SL1500.jpg?v=1776594349", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71BH7ovJuHL._SL1500.jpg?v=1776594366", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ZMQUimiNL._SL1500.jpg?v=1776594366", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81TyPE_WXNL._SL1500.jpg?v=1776594366", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81zv1VkbbfL._SL1500.jpg?v=1776594366"], categorySlug: "fashion", stock: 15, rating: 3.8, reviewCount: 22, featured: true, tags: ["Father's Day gift", "grooming kit", "men's gift", "Park Avenue", "shaving kit"] },
  { name: "Vanity Queen 360° Rotating Makeup Organiser – Large Multi-Compartment Beauty Storage", slug: "360-rotating-makeup-organizer", description: "360° Rotating Makeup Organizer - Smooth 360 degree rotation design allows easy access to all your cosmetics, makeup brushes, skincare bottles and accessories without cluttering your vanity, bathroom countertop or dressing table. Large Capacity Makeup Storage with Drawers - Premium large makeup organiser with multiple compartments and drawers to neatly store makeup brushes, lipsticks, palettes,...", price: 499.0, compareAtPrice: 700.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71TE3F8ba5L._SL1500.jpg?v=1776573632", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ck9ihCyaL._SL1500.jpg?v=1776573653", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71r48F-ZDSL._SL1500.jpg?v=1776573653", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71rqLDipgdL._SL1500.jpg?v=1776573654", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/615FtxNhBAL._SL1500.jpg?v=1776573663", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ZJgNMCfFL._SL1500.jpg?v=1776573662"], categorySlug: "fashion", stock: 15, rating: 3.9, reviewCount: 25, featured: false, tags: [] },
  { name: "Glam Spin 360° Rotating Makeup Organiser – 5-Compartment Vanity Storage with Gold Feet", slug: "cosmetic-organizer", description: "Organisation never looked this good. The Glam Spin 360° Rotating Makeup Organiser combines effortless functionality with boutique-worthy aesthetics - a sleek, premium vanity storage solution designed for women who love their beauty space as polished as their look. The smooth 360° rotating base gives you instant access to every compartment from any angle - no stretching, no shuffling, no mess....", price: 499.0, compareAtPrice: 700.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81eqbEpACkL._SL1500_dd125ce9-86ed-4b94-940a-1aa10526f306.jpg?v=1776573473", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81jDTsczCVL._SL1500.jpg?v=1776573402", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71RQO6m8tFL._SL1500.jpg?v=1776573394", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/718l6EHhA8L._SL1500.jpg?v=1776573394", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71auGDqYdJL._SL1500.jpg?v=1776573394", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71sXRJ5Zu8L._SL1500.jpg?v=1776573394", "https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_Htf4CmL._SL1500.jpg?v=1776573393"], categorySlug: "fashion", stock: 15, rating: 4.0, reviewCount: 28, featured: false, tags: [] },
  { name: "Scented Candels", slug: "secrented-candels-copy-copy", description: "Elevate your space with our luxurious Scented Candles pack of 5. Each candle is carefully crafted to fill your home with captivating fragrances that create a warm, inviting atmosphere. Perfect for relaxation, meditation, or adding a touch of elegance to any room. The set includes a variety of premium scents to suit every mood and occasion. Ideal for personal use or as a thoughtful gift for loved...", price: 1200.0, compareAtPrice: 1500.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_4_1.png?v=1774078685"], categorySlug: "home-living", stock: 15, rating: 4.1, reviewCount: 31, featured: true, tags: [] },
  { name: "Scented Candels", slug: "secrented-candels-copy-1", description: "Illuminate your space with the warm glow of our Scented Candles. Each candle is carefully crafted to fill your home with delightful fragrances that create a calming and inviting atmosphere. Perfect for relaxation, meditation, or simply adding a touch of elegance to any room. Choose from a", price: 300.0, compareAtPrice: 325.99, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_7_1_eaaa02e5-18ef-44f1-a2ae-aa854f1017ed.png?v=1774078791"], categorySlug: "home-living", stock: 15, rating: 4.2, reviewCount: 34, featured: false, tags: [] },
  { name: "Scented Candels", slug: "secrented-candels-copy", description: "Illuminate your space with the warm glow of our Scented Candles. Crafted with premium wax and infused with captivating fragrances, each candle transforms any room into a sanctuary of comfort and relaxation. Perfect for creating ambiance during evenings, meditation, or special moments. Long-lasting burn time ensures hours of delightful scent that lingers beautifully throughout your home. Ideal for...", price: 300.0, compareAtPrice: 325.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_17_1.png?v=1774078826"], categorySlug: "home-living", stock: 15, rating: 4.3, reviewCount: 37, featured: false, tags: [] },
  { name: "Scented Candels", slug: "secrented-candels", description: "Illuminate your space with the warm glow of our Scented Candles. Each candle is carefully crafted to fill your home with enchanting fragrances that create the perfect ambiance for any moment. Whether you're unwinding after a long day, setting the mood for a special occasion, or simply refreshing your living space, our premium scented candles deliver long-lasting aroma and a soothing experience....", price: 300.0, compareAtPrice: 325.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_1_1.png?v=1774078497"], categorySlug: "home-living", stock: 15, rating: 4.4, reviewCount: 40, featured: true, tags: [] },
  { name: "Scented Candels", slug: "pack-of-two-copy-1", description: "Illuminate your space with the warm, inviting glow of our Scented Candles. Crafted with premium wax and infused with captivating fragrances, each candle transforms any room into a sanctuary of comfort and relaxation. Perfect for creating ambiance during intimate moments, unwinding after a long day, or adding a touch of elegance to your home décor. Long-lasting burn time ensures hours of...", price: 499.0, compareAtPrice: 799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_12_1_af106263-9e79-437f-8762-015a1bc8b759.png?v=1774078872"], categorySlug: "home-living", stock: 15, rating: 4.5, reviewCount: 43, featured: false, tags: [] },
  { name: "Pack of two", slug: "pack-of-two", description: "Indulge in the warmth and ambiance of our Scented Candles Pack of Two. Each candle is carefully crafted to fill your space with delightful fragrances that create a calming atmosphere. Perfect for relaxation, meditation, or adding a touch of elegance to any room. The duo pack offers great value, making it ideal for personal use or as a thoughtful gift. Transform your home into a sanctuary with...", price: 499.0, compareAtPrice: 799.0, images: ["https://cdn.shopify.com/s/files/1/0674/7327/7150/products/image_QwT2_1.5x.png?v=1701509362"], categorySlug: "home-living", stock: 15, rating: 4.6, reviewCount: 46, featured: false, tags: [] }
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
  const productCount = await db.product.count()
  if (categoryCount > 0 && productCount > 0) {
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
