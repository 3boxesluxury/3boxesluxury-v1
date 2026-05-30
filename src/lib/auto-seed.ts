/**
 * Auto-Seed Utility for Vercel Deployment
 *
 * On Vercel, SQLite is ephemeral — the database resets on every cold start.
 * This module automatically:
 *   1. Creates the database schema using raw SQL (if tables don't exist)
 *   2. Seeds the database on the first API request if it detects zero categories
 *
 * ALL 46 products from the Shopify store are included so the site works
 * fully on Vercel with real product data, real images, and correct slugs.
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

  await createEssentialTablesRaw()
  schemaEnsured = true
  console.log('[auto-seed] Schema created successfully')
}

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

  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS Product_categoryId_idx ON Product(categoryId);`)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS Product_slug_idx ON Product(slug);`)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS Product_featured_idx ON Product(featured);`)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS Product_createdAt_idx ON Product(createdAt);`)

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
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS Session_userId_idx ON Session(userId);`)

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
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_email_idx" ON "Order"(email);`)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"(status);`)
  await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"(createdAt);`)

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
      console.warn(`[auto-seed] Warning creating table: ${err.message?.substring(0, 80)}`)
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// CATEGORIES — 11 categories matching the Shopify store
// ═══════════════════════════════════════════════════════════════════
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

// ═══════════════════════════════════════════════════════════════════
// ALL 46 PRODUCTS — Complete product catalog with real Shopify images
// Images and tags are pre-serialized as JSON strings for direct DB insert
// ═══════════════════════════════════════════════════════════════════
const PRODUCTS = [
  // ─── Fragrances (7 products) ───
  { name: "Ajmal Oud of Dubai Eau de Parfum 100ml", slug: "ajmal-oud-of-dubai-eau-de-parfum-100ml", description: "Ajmal Oud of Dubai - The Essence of Arabian Luxury. Rich, warm, and deeply sensual Eau de Parfum capturing the soul of the Arabian Peninsula. Fragrance Profile: Top Notes: Saffron, Rose, Bergamot. Heart Notes: Oud (Agarwood), Patchouli, Jasmine. Base Notes: Sandalwood, Amber, Musk, Vanilla. Volume: 100ml. Unisex - suitable for both men and women. Perfect for evening wear, special occasions, and gifting.", price: 4999.0, compareAtPrice: 5999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716juhp9cAL._SL1500.jpg?v=1777487051","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61EqyCC--0L._SL1500.jpg?v=1777487064","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AH9AhAQqL._SL1500.jpg?v=1777487065","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71GwcT8J-HL._SL1500.jpg?v=1777487064"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["ajmal","eau de parfum","gift","luxury perfume","oud"]' },
  { name: "Bla Bli Blu Ivory Oud Parfum 100ml", slug: "bla-bli-blu-ivory-oud-parfum-100ml", description: "Bla Bli Blu Ivory Oud - Raw. Rare. Unforgettable. Bold in colour, bolder in scent. A statement-making unisex parfum that commands attention. Rich, creamy oud accord softened by velvety musk and earthy patchouli. Fragrance Profile: Top Notes: Saffron, Pink Pepper, Bergamot. Heart Notes: Ivory Oud (Agarwood), Rose, Jasmine. Base Notes: Musk, Patchouli, Sandalwood, Amber. Parfum concentration, 100ml, unisex, iconic matte red cylindrical bottle.", price: 3999.0, compareAtPrice: 4999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61mNqpSRf0L._SL1500.jpg?v=1777521129","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51QDQrPLxTL._SL1500.jpg?v=1777521148","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61HE30S1IuL._SL1500.jpg?v=1777521149","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61OHCD2dmML._SL1500.jpg?v=1777521149","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71J54tWZgjL._SL1500.jpg?v=1777521149"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["bla bli blu","ivory oud","luxury gift","parfum","unisex fragrance"]' },
  { name: "Contraband Hands Off Eau de Parfum", slug: "contraband-hands-off-eau-de-parfum", description: "Contraband Hands Off - The Scent of Bold Moves. A daring, dark, and bold men's Eau de Parfum crafted for those who play by their own rules. Fragrance Profile: Top Notes: Bergamot, Black Pepper, Cardamom. Heart Notes: Leather, Oud, Smoky Vetiver. Base Notes: Amber, Musk, Sandalwood. Long-lasting, intense sillage. Premium dark glass bottle with signature asymmetric design.", price: 3499.0, compareAtPrice: 4299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81g0mVyrVZL._SL1500.jpg?v=1777486781","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61WyXC2wLLL._SL1500.jpg?v=1777486794","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61fbKgGr6hL._SL1200.jpg?v=1777486795","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/91415h4cRhL._SL1500.jpg?v=1777486795","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71WuYa_1CyL._SL1500.jpg?v=1777486795","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81hNelcYNPL._SL1500.jpg?v=1777486796"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["eau de parfum","gift","luxury","mens fragrance","perfume"]' },
  { name: "Eze Magic Perfume - Luxury Sphere Fragrance", slug: "eze-magic-perfume-luxury-sphere-fragrance", description: "Eze Magic - Where Sorcery Meets Scent. Encased in a stunning matte gold spherical bottle, this fragrance is as much a work of art as it is a sensory experience. Fragrance Profile: Top Notes: Cinnamon, Pink Pepper, Cardamom. Heart Notes: Nutmeg, Lavender, Spiced Woods. Base Notes: Sandalwood, Musk, Warm Amber. Iconic spherical matte gold bottle, unisex, warm spicy oriental fragrance.", price: 2999.0, compareAtPrice: 3999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hCdP5svEL._SL1024.jpg?v=1777487344","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51TSrM_ns1L._SL1088.jpg?v=1777487363","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/612r68-vm8L._SL1088.jpg?v=1777487365","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Wl4aSJiAL._SL1080.jpg?v=1777487364","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61c9iY4D2XL._SL1080.jpg?v=1777487364","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71LZsro49uL._SL1088.jpg?v=1777487365","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71PgLaLcFXL._SL1088.jpg?v=1777487365"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["eze magic","gift perfume","luxury perfume","oriental fragrance","unique bottle"]' },
  { name: "Lattafa Pride Shaheen Gold Eau de Parfum 100ml", slug: "lattafa-pride-shaheen-gold-eau-de-parfum-100ml", description: "Lattafa Pride Shaheen Gold - Soar Above the Ordinary. Inspired by the majestic Shaheen falcon, a symbol of power, nobility, and freedom. Rich, warm, and deeply oriental. Fragrance Profile: Top Notes: Bergamot, Saffron, Cardamom. Heart Notes: Rose, Oud (Agarwood), Jasmine. Base Notes: Amber, Sandalwood, Musk, Vanilla. EDP 100ml, iconic frosted bottle with embossed gold falcon and sculpted falcon cap.", price: 4499.0, compareAtPrice: 5499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Av7nf32qL._SL1200.jpg?v=1777521886","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41pOUcep22L._SL1200.jpg?v=1777521898","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/513irOSYYOL._SL1200.jpg?v=1777521899","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51wvc5BhVkL._SL1000.jpg?v=1777521899"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["eau de parfum","lattafa","luxury gift","oud fragrance","shaheen gold"]' },
  { name: "The Man Company Oud Regal Eau de Parfum 100ml - Pour Homme", slug: "the-man-company-oud-regal-eau-de-parfum-100ml-pour-homme", description: "The Man Company Oud Regal - Bold. Powerful. Unforgettable. A premium Eau de Parfum drawing from Arabic perfumery tradition. Fragrance Profile: Top Notes: Saffron, Black Pepper, Bergamot. Heart Notes: Oud (Agarwood), Rose, Patchouli. Base Notes: Sandalwood, Amber, Musk, Dark Resins. EDP 100ml Pour Homme, deep amber glass bottle with premium gold cap.", price: 2799.0, compareAtPrice: 3499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61wg5Dt8JxL._SL1100.jpg?v=1777522121","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/511ATPKNu9L._SL1100.jpg?v=1777522142","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51WrfW1cZkL._SX522.jpg?v=1777522141","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/616Mfglc5IL._SL1100.jpg?v=1777522142","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61v6Ryi4U4L._SL1100.jpg?v=1777522142","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61yfFFw70qL._SL1100.jpg?v=1777522142","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716q-9Npp2L._SL1100.jpg?v=1777522142","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71DNoBKT-9L._SL1100.jpg?v=1777522142","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71p5RT6wuAL._SL1100.jpg?v=1777522142"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["eau de parfum","luxury gift","mens fragrance","oud regal","the man company"]' },
  { name: "The Man Company Perfume Gift Set - Black, Blanc, Fire & Night (4 x 50ml)", slug: "the-man-company-perfume-gift-set-black-blanc-fire-night-4-x-50ml", description: "The Man Company - 4-Fragrance Gift Set. Four iconic scents: Black (bold, dark, oud & leather), Blanc (clean, citrus & white musk), Fire (intense, spice & amber), Night (deep, bergamot & patchouli). Set of 4 x 50ml bottles, up to 20% perfume oil concentration, 8-10 hours long-lasting. Premium sleek bottle design.", price: 2499.0, compareAtPrice: 3499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61CHYO2caVL._SL1100.jpg?v=1777520430","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51YHmOKd_uL._SL1100.jpg?v=1777520455","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/610pJcjBAZL._SL1100.jpg?v=1777520455","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61gudMwXHLL._SL1100.jpg?v=1777520456","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hP2czTpuL._SL1100.jpg?v=1777520455","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61lpDR58ryL._SL1100.jpg?v=1777520455","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AATi-UZSL._SL1100.jpg?v=1777520456","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71b_RkUVQEL._SL1100.jpg?v=1777520454"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["eau de parfum","luxury gift","mens fragrance","perfume gift set","the man company"]' },

  // ─── Jewelry (12 products) ───
  { name: "Amara Heart Locket Necklace - 18K Gold-Tone Engraved Heart Pendant", slug: "amara-heart-locket-necklace-18k-gold-tone-engraved-heart-pendant", description: "A beautifully engraved gold-tone heart locket pendant with an intricate swirl motif, suspended on a sleek snake chain. 18K gold-tone plating, pendant size ~2-2.5cm, chain length ~45-50cm adjustable. Lobster clasp closure. Alloy/Brass base with gold plating. Delicate enough for daily wear, meaningful enough to gift.", price: 799.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51BqqEpXlZL._SY695.jpg?v=1776837923","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61VLlmActxL._SY695.jpg?v=1776837913","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51IG7MJXtKL._SY625.jpg?v=1776837924","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51dRFS32w0L._SY695.jpg?v=1776837923","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51rE2urQDiL._SY695.jpg?v=1776837924","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61TSUNN-mVL._SY695.jpg?v=1776837924"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Artifi Gold Bracelet for Men & Women | Adjustable Designer Bangle with Blue Evil Eye Charm", slug: "artifi-gold-bracelet-for-men-women-adjustable-designer-bangle-with-blue-evil-eye-charm-anti-tarnish-fashion-jewelry-stylish-daily-wear-bracelet-gift-for-unisex-adults", description: "Stylish Gold Bracelet Set with multiple styles including chain bracelet, crystal bracelet, and cuff bracelet. Premium crystal and stone design. Adjustable and comfortable fit. Trendy layered bracelet look. Gold plated and durable finish. Perfect gift for women and girls.", price: 999.0, compareAtPrice: 1399.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/516TaGZ77AL._SY625.jpg?v=1776836471","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61REvVm5XlL._SY625.jpg?v=1776836485","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61kqNYyrQYL._SY695.jpg?v=1776836485","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61uNiriVrhL._SY625.jpg?v=1776836485"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Aurelia Gold Hand Chain Bracelet with Finger Ring", slug: "aurelia-gold-hand-chain-bracelet-with-finger-ring", description: "A stunning hand chain bracelet that drapes gracefully from finger to wrist. Gold-tone satellite chain with ball beads, triple-strand wrist design. 18K gold-tone plating, adjustable/lobster clasp. Perfect for weddings, mehendi ceremonies, beach holidays, festivals.", price: 569.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61C82Y0gpEL._SY625.jpg?v=1776836844","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/614ipz-JVqL._SY625.jpg?v=1776836855","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61jPljt83CL._SY625.jpg?v=1776836855"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Aurora Pastel Gemstone Link Bracelet - Moonstone", slug: "aurora-pastel-gemstone-link-bracelet-moonston", description: "Soft, dreamy, and utterly feminine. Alternating mint green cat's eye cabochons, creamy moonstone ovals, and deep sapphire blue faceted crystals in rose gold-tone link frame. Rose gold plating, lobster clasp with extension chain, adjustable ~17-20cm.", price: 699.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61GIGhv955S._SY625.jpg?v=1776838316","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51G5kHKiu9S._SY625.jpg?v=1776838305","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/516sKovN9uS._SY625.jpg?v=1776838316","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51JBNLtPvQS._SY625.jpg?v=1776838316","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Kt_-vBmxS._SY625.jpg?v=1776838316"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Celeste Swirl Stud Earrings - Emerald Green & Peach Crystal Gold-Tone", slug: "celeste-swirl-stud-earrings-emerald-green-peach-crystal-gold-tone", description: "Bold, artistic stud earrings blending sculptural gold-tone curves with emerald green faceted crystals and soft peach moonstone-style cabochon. 18K gold-tone plating, push-back butterfly stud. Alloy/Brass base with crystal accents.", price: 799.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51ESBttDFtL._SY625.jpg?v=1776837793","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/613DsEWdfCL._SY625.jpg?v=1776837778","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Ir8KFmVML._SY675.jpg?v=1776837793","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cf_QtCY0L._SX625.jpg?v=1776837793","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61y4gj3CkML._SY625.jpg?v=1776837793"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Elegant Gold-Plated Crystal Bangle for Women | Stylish, Durable Anti-Tarnish, Stainless Steel Bracelet", slug: "elegant-gold-plated-crystal-bangle-for-women-stylish-durable-anti-tarnish-stainless-steel-bracelet-perfect-for-parties-event-wear", description: "Stunning double-row crystal embellishment on a gold-plated bangle. High-grade stainless steel with gold plating. Hypoallergenic, 6.6cm diameter, 32gm. Pairs beautifully with both traditional and contemporary outfits.", price: 999.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61-VlFFr8GL._SY695.jpg?v=1776836297","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/5136pZlvrCL._SY675.jpg?v=1776836311","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51oKmPDLYpL._SY625.jpg?v=1776836311","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61-bD5ulO5L._SY695.jpg?v=1776836311","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61ObWJWxwrL._SY625.jpg?v=1776836312","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61UDmc1xINL._SY625.jpg?v=1776836312"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Flutter Trio Butterfly Bangle - White, Gold & Black Enamel Cuff Bracelet", slug: "flutter-trio-butterfly-bangle-white-gold-black-enamel-cuff-bracelet", description: "Gold-tone cuff bracelet with three butterflies in white shell, matte gold, and black enamel with crystal rhinestone bezels. 18K gold-tone plating, hinged spring clasp with safety lock. Stainless steel/Alloy base.", price: 899.0, compareAtPrice: 1100.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51UTFMZWTrL._SY625.jpg?v=1776838080","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/511J8-_WgrL._SY625.jpg?v=1776838094","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51A8U8PbWSL._SY625.jpg?v=1776838094","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Fek8GyCQL._SY625.jpg?v=1776838094","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/616XESnB1KL._SY625.jpg?v=1776838094","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61kd9haZ0sL._SY625.jpg?v=1776838094","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71IQR1SQugL._SY625.jpg?v=1776838094"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Glam Collection - 21-Pair Mixed Stud Earring Set", slug: "glam-collection-21-pair-mixed-stud-earring-set", description: "Curated assortment of 21 pairs of fashion-forward earrings. Crystal studs, pearl accents, gold-tone hearts, floral, moon, bow, shell motifs and more. Gold-tone metal with pastel and iridescent accents. Push-back studs and small hoops.", price: 899.0, compareAtPrice: 1100.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71SkAVXh7PL._SY625.jpg?v=1776836614","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61_M5a9E-SL._SY695.jpg?v=1776836631","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61dsieEf9mL._SY695.jpg?v=1776836631"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Lumiere Chunky Gold Huggie Hoop Earrings", slug: "lumiere-chunky-gold-huggie-hoop-earrings", description: "The ultimate everyday luxury earring. Wide, smooth gold-tone band with high-gloss mirror finish. 18K gold-tone plating, hinged snap-lock closure, ~15-18mm diameter. Brass/Alloy base with gold plating. Perfect for daily wear and stacking with studs.", price: 599.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g_74zKC6L._SY625.jpg?v=1776837312","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41cK16ts_vL._SY625.jpg?v=1776837326","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51hU4yABbaL._SY625.jpg?v=1776837327","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71n8b0PtPEL._SY625.jpg?v=1776837327","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61yljJzqyGL._SY625.jpg?v=1776837327","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61CUY0iyFXL._SY695.jpg?v=1776837327"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Noir Heart Gold Bangle - Crystal & Enamel Heart Bracelet", slug: "noir-heart-gold-bangle-crystal-enamel-heart-bracelet", description: "Luxurious gold-tone cuff bracelet with black enamel centre heart, open gold heart links and sparkling crystal-set bezels. 18K gold-tone plating, hinged clasp with safety lock. Stainless steel/Alloy base.", price: 999.0, compareAtPrice: 1100.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61zEkPSefOL._SX625.jpg?v=1776837002","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/514lesO9giL._SY695.jpg?v=1776837021","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51pERDGxuuL._SX625.jpg?v=1776837021","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61A4ksBHnEL._SX625.jpg?v=1776837021","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61uVGyeP-tL._SY695.jpg?v=1776837021","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61yGR7J2C3L._SY625.jpg?v=1776837021"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Peacock Soul Beaded Charm Bracelet - Chrysocolla & Blue Agate Stone Beads", slug: "peacock-soul-beaded-charm-bracelet-chrysocolla-blue-agate-stone-beads", description: "Handcrafted bracelet featuring rich teal, turquoise, and cobalt blue stone beads with ornate gold-tone peacock feather charm. ~10-12mm round beads, elastic stretch band. Natural-look stone beads with alloy charm. Perfect for yoga, wellness gifting, bohemian styling.", price: 799.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Usb9RFekL._SY695.jpg?v=1776837558","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71m4zsvSjjL._SX695.jpg?v=1776837572","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71sIi91Z-5L._SY695.jpg?v=1776837572","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81RoGAw_X1L._SX695.jpg?v=1776837572","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81psjiLtUjL._SX695.jpg?v=1776837572","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81t874TlGlL._SX695.jpg?v=1776837572"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },

  // ─── Leather Goods (7 products) ───
  { name: "Executive 3-in-1 Men's Gift Set - Woven Leather Wallet, Keychain & Pen", slug: "executive-3-in-1-mens-gift-set-woven-leather-wallet-keychain-pen", description: "Curated collection of everyday essentials in a premium matte black gift box with gold embossed logo. Includes: Woven Leather Card Holder/Wallet, Premium Metal Keychain with bottle opener, Sleek Ballpoint Pen with chrome finish. Zero wrapping needed - arrives gift-ready.", price: 1299.0, compareAtPrice: 1799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51x7bf9rv9L.jpg?v=1776973749","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/415qEA-XBaL.jpg?v=1776973791","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41E_dFsMe6L.jpg?v=1776973791","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41L6oGM0_yL.jpg?v=1776973791","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51nAP38CieL._SL1280.jpg?v=1776973791","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cTpSYPtdL.jpg?v=1776973791"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["birthday gift","corporate gift","executive gift","men\'s gift","wallet gift set"]' },
  { name: "Men's Reversible Textured Leather Belt - Black & Brown with Silver Buckle", slug: "mens-reversible-textured-leather-belt-black-brown-with-silver-buckle", description: "Two Belts in One. Reversible design - black textured side and smooth brown side. Woven check texture, rotating silver-tone pin buckle, premium PU leather. Works with formal suits, chinos, jeans and more.", price: 599.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81hIaTcUUyL._SY606.jpg?v=1776973987","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41PbrrCWwOL._SY606.jpg?v=1776974025"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["gift for men","leather belt","men\'s accessories","men\'s belt","reversible belt"]' },
  { name: "Men's Woven Texture Slim Bifold Leather Wallet - Dark Brown with Metal Logo", slug: "mens-woven-texture-slim-bifold-leather-wallet-dark-brown-with-metal-logo", description: "Diamond woven emboss pattern with signature silver metal logo charm. Slim bifold design with multiple card slots and cash compartment. Rich dark brown finish, versatile for any outfit.", price: 499.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51qC0XooIGL.jpg?v=1776974769","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41jM09w8HPL.jpg?v=1776974787","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61ExP5xdVmL.jpg?v=1776974787","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61e-oLFr21L._SY879.jpg?v=1776974787"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["bifold wallet","gift for men","leather wallet","men\'s wallet","premium wallet"]' },
  { name: "Premium 4-in-1 Men's Gift Set - Watch, Perfume, Belt & Wallet in Red Gift Box", slug: "premium-4-in-1-mens-gift-set-watch-perfume-belt-wallet-in-red-gift-box", description: "Four essentials in one stunning red box. Classic Analog Watch, Eau de Parfum/Cologne, Leather Belt, Genuine Leather Wallet. Bold red luxury gift box with individual compartments. Arrives gift-ready.", price: 1799.0, compareAtPrice: 2499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81uO-rAPMpL._SX679.jpg?v=1776974518","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/6103545_fsL._SX679.jpg?v=1776974487","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61pXozbm1xL._SX679.jpg?v=1776974517"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["corporate gift","Father\'s Day gift","men\'s gift set","perfume gift","watch gift"]' },
  { name: "Rose of No Man's Land Premium PU Leather Makeup & Travel Organiser Bag", slug: "rose-of-no-mans-land-premium-pu-leather-makeup-travel-organiser-bag", description: "Rich tan PU leather with gold-tone hardware. Multiple fabric-lined compartments and pockets. Cream fabric-lined interior, gold-tone zipper and hardware. Travel-ready size with top handle.", price: 899.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71qSTWtRyAL._SL1500.jpg?v=1776972506","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_0Ffcf45L._SL1500.jpg?v=1776972540","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71hj2Nr1dsL._SL1500.jpg?v=1776972541","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/815a4WOZOQL._SL1500.jpg?v=1776972542","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81GmYgAQdNL._SL1500.jpg?v=1776972541","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81JMCAllF_L._SL1500.jpg?v=1776972542","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81VpRyilS9L._SL1500.jpg?v=1776972542"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["beauty gift","cosmetic pouch","makeup bag","travel organiser","women\'s gift"]' },
  { name: "WildHorn 3-in-1 Men's Gift Set - Genuine Leather Wallet, Keychain & Pen", slug: "wildhorn-3-in-1-mens-gift-set-genuine-leather-wallet-keychain-pen", description: "Three everyday essentials in one premium collection. WildHorn Genuine Leather Bifold Wallet (Off White), WildHorn Leather Keychain (gunmetal carabiner), Matte Black Ballpoint Pen. Coordinated WildHorn branding.", price: 999.0, compareAtPrice: 1499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81QPrL3sobL._SL1500.jpg?v=1776975330","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41Mj2nA7agL._SL1440.jpg?v=1776975358","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61tWCfAZfvL._SX679.jpg?v=1776975359","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51QeAcXjGhL._SL1500.jpg?v=1776975359","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_a2CcjWVL._SL1500.jpg?v=1776975359","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ff--jCyML._SL1500.jpg?v=1776975359","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/713wShl9elL._SL1500.jpg?v=1776975360","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71WI6IUR5mL._SL1500.jpg?v=1776975360","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/718qAam-8GL._SL1500.jpg?v=1776975360"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["corporate gift","keychain gift","leather wallet","men\'s gift set","WildHorn"]' },
  { name: "WildHorn Genuine Leather Slim Bifold Wallet - Teal Blue", slug: "wildhorn-genuine-leather-slim-bifold-wallet-teal-blue", description: "Full-grain leather that develops a rich patina over time. Unique teal blue finish, WildHorn brass logo badge. Multiple card slots, main cash compartment, slim bifold profile. Genuine leather - not PU, not synthetic.", price: 799.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/615Xib7EkuL._SL1014.jpg?v=1776975099","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61SAlRCFWpL._SL1014.jpg?v=1776975119","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61wKNk2n_DL._SL1340.jpg?v=1776975120","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71HQKLBR1yL._SL1500.jpg?v=1776975120","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/91Nb0t_2_0L._SL1500.jpg?v=1776975121"]', categorySlug: "leather-goods", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["bifold wallet","genuine leather wallet","gift for men","men\'s wallet","WildHorn"]' },

  // ─── Fashion (5 products) ───
  { name: "Executive Corporate Gift Set - Notebook, Card Holder, Pen & Keychain (4-in-1)", slug: "executive-corporate-gift-set-notebook-card-holder-pen-keychain-4-in-1", description: "Premium 4-in-1 Executive Corporate Gift Set. A5 Textured Notebook, Business Card Holder, Metal Ballpoint Pen, Metal Keychain. Coordinated grey textured design. Premium orange gift box - ready to gift.", price: 1299.0, compareAtPrice: 1799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41D9WLaBbpL.jpg?v=1777523269","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/212s3xVoJbL.jpg?v=1777523382","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41Q15WRjtzL._SX522.jpg?v=1777523382","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41VcbhJdQTL.jpg?v=1777523382","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41zeruZGQ_L.jpg?v=1777523382","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51sQYzfCJdL.jpg?v=1777523382"]', categorySlug: "fashion", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["corporate gift","executive gift set","notebook gift","office gift","premium gift"]' },
  { name: "For the Man with Style - Premium Men's Gift Hamper", slug: "for-the-man-with-style-premium-mens-gift-hamper", description: "Luxurious 4-in-1 gift hamper in a sleek black gift box. Stainless Steel Thermal Flask, Genuine Leather Wallet, Leather Belt, Metal Keychain. Premium black gift box with shredded paper filler and message card.", price: 1999.0, compareAtPrice: 2799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/611x18rL3HL._SL1080.jpg?v=1776971688","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51wETvBLFLL._SL1024.jpg?v=1776971711","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/612N3iZJ7PL._SL1080.jpg?v=1776971712","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61LAs6NkWFL._SL1082.jpg?v=1776971712","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61MVpPA1vqL._SL1280.jpg?v=1776971712","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61joh9SrUdL._SL1297.jpg?v=1776971712","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g-wMzJ_TL._SL1500.jpg?v=1776971713","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hddOBlvAL._SL1280.jpg?v=1776971712","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71tSzM9qUfL._SL1500.jpg?v=1776971712"]', categorySlug: "fashion", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["birthday gift","corporate gift","gift hamper","leather wallet","men\'s gift"]' },
  { name: "Glam Spin 360 Rotating Makeup Organiser - 5-Compartment Vanity Storage with Gold Feet", slug: "cosmetic-organizer", description: "360 degree smooth rotation design, 5 spacious compartments. Premium eco-friendly ABS plastic with vertical stripe design and gold-plated feet. Scratch-proof base, smooth safe edges. Organises makeup brushes, lipsticks, eyeliners, nail polishes and skincare.", price: 499.0, compareAtPrice: 700.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81eqbEpACkL._SL1500_dd125ce9-86ed-4b94-940a-1aa10526f306.jpg?v=1776573473","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81jDTsczCVL._SL1500.jpg?v=1776573402","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71RQO6m8tFL._SL1500.jpg?v=1776573394","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/718l6EHhA8L._SL1500.jpg?v=1776573394","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71auGDqYdJL._SL1500.jpg?v=1776573394","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71sXRJ5Zu8L._SL1500.jpg?v=1776573394","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_Htf4CmL._SL1500.jpg?v=1776573393"]', categorySlug: "fashion", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Park Avenue Good Morning 7-in-1 Men's Grooming Kit with Free Travel Pouch", slug: "park-avenue-good-morning-grooming-collection-7-in-1-combo-grooming-kit", description: "Complete grooming ritual in one kit. 7 products: Deodorant 150ml, After Shave Lotion 45ml, Premium Soap 125g, Lather Shaving Cream 84g, Shaving Brush, Apache Razor, Free Travel Pouch. Skin-friendly formulas with coconut oil, aloe vera, tea tree oil and shea butter.", price: 699.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_oZ0PCZwL._SL1500.jpg?v=1776594349","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71BH7ovJuHL._SL1500.jpg?v=1776594366","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ZMQUimiNL._SL1500.jpg?v=1776594366","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81TyPE_WXNL._SL1500.jpg?v=1776594366","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81zv1VkbbfL._SL1500.jpg?v=1776594366"]', categorySlug: "fashion", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: '["Father\'s Day gift","grooming kit","men\'s gift","Park Avenue","shaving kit"]' },
  { name: "Vanity Queen 360 Rotating Makeup Organiser - Large Multi-Compartment Beauty Storage", slug: "360-rotating-makeup-organizer", description: "360 degree smooth rotation, large capacity with multiple compartments and drawers. Tall brush holder sections, wide compartments for skincare bottles. Premium plastic with modern finish. Available in White/Green. Multi-surface use for vanity, bathroom, bedroom, office.", price: 499.0, compareAtPrice: 700.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71TE3F8ba5L._SL1500.jpg?v=1776573632","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ck9ihCyaL._SL1500.jpg?v=1776573653","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71r48F-ZDSL._SL1500.jpg?v=1776573653","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71rqLDipgdL._SL1500.jpg?v=1776573654","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/615FtxNhBAL._SL1500.jpg?v=1776573663","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ZJgNMCfFL._SL1500.jpg?v=1776573662"]', categorySlug: "fashion", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },

  // ─── Home & Living (12 products) ───
  { name: "Dreamy Girl Resin Planter Pot | Decorative Face Planter", slug: "dreamy-girl-resin-planter-pot-decorative-face-planter", description: "Whimsical resin planter featuring a charming hand-painted girl figure with lavender hair, rosy cheeks, and a serene smile. Premium resin, hand-painted details. Planter pot / succulent holder / pen holder / desk organiser. Plant not included.", price: 849.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71FT2h9bX0L._SL1500.jpg?v=1778356317","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71IEESwueGL._SL1500.jpg?v=1778356371","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Ic-NFwePL._SL1500.jpg?v=1778356370","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71K3_j8TjXL._SL1500.jpg?v=1778356371","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71LhzjzNszL._SL1500.jpg?v=1778356371","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Np7iDHvUL._SL1500.jpg?v=1778356371","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71W3phXw9zL._SL1500.jpg?v=1778356371","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71rLf_oODQL._SL1500.jpg?v=1778356371","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71v-VPonzQL._SL1500.jpg?v=1778356371"]', categorySlug: "home-living", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["desk decor","face planter","gift for her","home decor","resin planter"]' },
  { name: "Golden Crescent Moon Metal Planter | Luxury Desk Planter with Stand", slug: "golden-crescent-moon-metal-planter-luxury-desk-planter-with-stand", description: "Celestial elegance - crescent moon-shaped iron stand cradles a gleaming gold spherical pot. Premium iron metal with gold finish, sturdy and rust-resistant. Perfect for succulents, air plants, or small indoor greens. Stand and pot included, plant not included.", price: 1299.0, compareAtPrice: 1799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cvpKv9PxL._SL1500.jpg?v=1778356599","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51bqXdb4V8L._SL1500.jpg?v=1778356618","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51lN-KKP--L._SL1500.jpg?v=1778356618","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51nr0UlpXVL._SL1500.jpg?v=1778356618","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51vZUuTr6GL._SL1500.jpg?v=1778356618","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Cgd4xZ6lL._SL1500.jpg?v=1778356618","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61KD1NUbgnL._SL1500.jpg?v=1778356619"]', categorySlug: "home-living", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["gold planter","home decor","luxury gift","metal planter","moon planter"]' },
  { name: "Luxe Sip Glass Tumbler - 400ml Borosilicate Can Glass with Straw & Lid", slug: "kikiluxxa-glass-coffee-sipper-tumbler-mug-with-straw-and-lid", description: "400ml borosilicate glass tumbler with leather-wrapped exterior, straw and lid. Lead-free, BPA-free. Temperature range -68F to 212F. Dishwasher safe. Perfect for hot and cold beverages.", price: 400.0, compareAtPrice: 600.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61JlzOYPsdL.jpg?v=1776625611","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41SQLEt1V0L.jpg?v=1776625640","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/517vBFHIHaL.jpg?v=1776625640","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51WyF7mSrzL.jpg?v=1776625640","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51cOuls3p4L.jpg?v=1776625640","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71xn2swop3L._SL1500.jpg?v=1776625641"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Nordic Donut Ceramic Vase | Matte White Ring Vase for Home Decor", slug: "nordic-donut-ceramic-vase-matte-white-ring-vase-for-home-decor", description: "Minimalist masterpiece inspired by Scandinavian design. Hollow ring shape with smooth matte white finish. Premium ceramic, sturdy and water-resistant. Pairs beautifully with dried flowers, pampas grass, fresh blooms, or tropical leaves.", price: 899.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AO8RwOCjL._SL1000.jpg?v=1778357288","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Gmb6W-gxL._SL1000.jpg?v=1778357307","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61aA11rt6WL._SL1500.jpg?v=1778357308","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71JGVt56JfL._SL1500.jpg?v=1778357307","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71QJg0TuB5L._SL1500.jpg?v=1778357308","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/813Kzy7rfqL._SL1500.jpg?v=1778357309"]', categorySlug: "home-living", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["ceramic vase","donut vase","home decor","minimalist gift","nordic decor"]' },
  { name: "Pack of two Scented Candles", slug: "pack-of-two", description: "Scented Candles Pack of Two. Carefully crafted to fill your space with delightful fragrances that create a calming atmosphere. Perfect for relaxation, meditation, or adding a touch of elegance to any room.", price: 499.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/products/image_QwT2_1.5x.png?v=1701509362"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Palm Buddha Resin Statue | Black & Gold Meditating Buddha Figurine", slug: "palm-buddha-resin-statue-black-gold-meditating-buddha-figurine", description: "Serene Buddha figure rests within a cupped hand, symbolising protection, wisdom, and divine grace. Matte black finish with rich gold accents. Premium resin, lightweight and durable. Ideal for home altar, living room shelf, office desk, meditation corner.", price: 1099.0, compareAtPrice: 1599.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81uBEI52sjL._SL1500.jpg?v=1778356860","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51wl3l_PFvL._SL1500.jpg?v=1778356881","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61508Q1_8qL._SL1500.jpg?v=1778356881","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61932TX-eDL._SL1500.jpg?v=1778356881","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61mK8W7ZbxL._SL1500.jpg?v=1778356881","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61tOpN9U8NL._SL1500.jpg?v=1778356881","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71HIrj4VX5L._SL1500.jpg?v=1778356882","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Zy65yepIL._SL1500.jpg?v=1778356882"]', categorySlug: "home-living", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["buddha statue","Diwali gift","home decor","resin figurine","spiritual gift"]' },
  { name: "Scented Candles", slug: "secrented-candels", description: "Illuminate your space with the warm glow of our Scented Candles. Each candle is carefully crafted to fill your home with enchanting fragrances. Hand-poured with quality ingredients for long-lasting aroma.", price: 300.0, compareAtPrice: 325.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_1_1.png?v=1774078497"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Scented Candles - Copy", slug: "secrented-candels-copy", description: "Premium wax with captivating fragrances. Long-lasting burn time for hours of delightful scent. Ideal for gifting or personal indulgence.", price: 300.0, compareAtPrice: 325.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_17_1.png?v=1774078826"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Scented Candles - Copy 1", slug: "secrented-candels-copy-1", description: "Carefully crafted to fill your home with delightful fragrances that create a calming and inviting atmosphere. Perfect for relaxation, meditation, or simply adding a touch of elegance to any room.", price: 300.0, compareAtPrice: 325.99, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_7_1_eaaa02e5-18ef-44f1-a2ae-aa854f1017ed.png?v=1774078791"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Scented Candles Pack of 5", slug: "secrented-candels-copy-copy", description: "Luxurious Scented Candles pack of 5 with a variety of premium scents to suit every mood and occasion. Ideal for personal use or as a thoughtful gift.", price: 1200.0, compareAtPrice: 1500.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_4_1.png?v=1774078685"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Teal Sip Set - Turquoise Ceramic Coffee Mugs, Set of 4 (200ml)", slug: "solimo-ceramic-coffee-mugs", description: "Four vibrant turquoise ceramic mugs, 200ml each. 100% food-grade ceramic, microwave and dishwasher safe. Perfect for tea, coffee, espresso, hot chocolate.", price: 399.0, compareAtPrice: 498.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71NdtEN_aWL._SL1500.jpg?v=1776625863","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51IyJ-kNDOL._SL1500.jpg?v=1776625884","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/6149ZjiMBYL._SL1500.jpg?v=1776625886","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71INbq_ZzSL._SL1500.jpg?v=1776625886","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71WjSQpHNoL._SL1500.jpg?v=1776625886","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71gFZOeJLcL._SL1500.jpg?v=1776625885","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71hZ9MOU-LL._SL1500.jpg?v=1776625885","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/815B-akw_0L._SL1500.jpg?v=1776625886"]', categorySlug: "home-living", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },

  // ─── Couple Gifts (3 products) ───
  { name: "Forever Yes - Romantic Proposal Couple Figurine Set - Car Dashboard Decor", slug: "romantic-couple-proposal-figurine-set-car-dashboard-decor", description: "Hand-painted resin miniature capturing the proposal moment. Boy kneels on one knee with red rose and ring, girl in flowing red gown and golden crown. Premium resin, cute chibi cartoon style. Perfect for car dashboard, desk ornament, shelf display.", price: 599.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71caXBpEzDL._SL1500.jpg?v=1776627940","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61BKtEgQVVL._SL1500.jpg?v=1776627955","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61VaRGDU2vL._SL1500.jpg?v=1776627956"]', categorySlug: "couple-gifts", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Forever Yours - Romantic Wedding Couple Resin Figurine", slug: "forever-in-your-arms-romantic-couple-figurine", description: "Groom sweeping his bride off her feet in a classic black tuxedo and flowing white gown. Hand-painted with exquisite attention to detail. Premium resin, smooth matte finish. Perfect for shelf decor, desk ornament, or cake topper alternative.", price: 449.99, compareAtPrice: 699.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g87QxbdeL._SL1500__1.jpg?v=1776627237","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61_Czh017zL._SL1500.jpg?v=1776627254","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/610nRp2eBqL._SL1500.jpg?v=1776627255","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61APySTSAYL._SL1500.jpg?v=1776627254","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61eYMJ1u6RL._SL1500.jpg?v=1776627254","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g87QxbdeL._SL1500.jpg?v=1776627255","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61oC85yW5BL._SL1500.jpg?v=1776627254"]', categorySlug: "couple-gifts", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Golden Love Swan Couple Brass Figurine | Decorative Bird Statue for Home", slug: "golden-love-swan-couple-brass-figurine-decorative-bird-statue-for-home", description: "Handcrafted premium brass swans facing each other, symbolising eternal love and harmony. Intricate hand-etched feather detailing with floral base, antique gold finish. Perfect for wedding gift, anniversary gift, Valentine's Day, housewarming, Diwali gifting.", price: 1399.0, compareAtPrice: 1999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71qLW6UYAFL._SL1500.jpg?v=1778357058","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/712PvDdCx-L._SL1500.jpg?v=1778357070","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71dqWPtnG8L._SL1500.jpg?v=1778357071","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81UjJy9ZlEL._SL1500.jpg?v=1778357072"]', categorySlug: "couple-gifts", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["brass figurine","home decor","love gift","swan couple","wedding gift"]' },

  // ─── Romantic Gifts (3 products) ───
  { name: "Best Wifey In The World - Decorative Wooden Table Plaque", slug: "best-wifey-in-the-world-wooden-table-plaque", description: "Premium MDF wood with striking black cutout silhouette base. Vivid multicolour typography - orange, pink, and grey lettering with playful heart accent. Freestanding table plaque/desk decor. Flat wooden stand, no assembly required.", price: 499.0, compareAtPrice: 699.99, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81KhVm4Kd6L._SL1500.jpg?v=1776627543","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71NnaDI9jUL._SL1500.jpg?v=1776627568","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71ubWbyG_rL._SL1500.jpg?v=1776627569","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/816nvYSaaRL._SL1500.jpg?v=1776627570","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81TIAWLypyL._SL1500.jpg?v=1776627570","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81cTVYwEDML._SL1500.jpg?v=1776627570"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Crystal Teddy Bear - Happy Birthday Glass Figurine Keepsake", slug: "sweetheart-birthday-bear-crystal-glass-edition", description: "Premium faceted crystal glass teddy bear holding a heart-shaped Happy Birthday plaque with pink crystal bow. High-quality faceted crystal glass with iridescent light refraction. Perfect as shelf decor, desk ornament, display keepsake.", price: 299.0, compareAtPrice: 489.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71lvIdpjVjL._SL1500.jpg?v=1776626785","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61sknW_-SUL._SL1500.jpg?v=1776626807","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/711pmFbx5BL._SL1500.jpg?v=1776626808","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71R0XSioxlL._SL1500.jpg?v=1776626808"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Happy Birthday Wooden Music Box | Hand-Crank Engraved Musical Gift Box", slug: "happy-birthday-wooden-music-box-hand-crank-engraved-musical-gift-box", description: "Premium dark wood with intricate gold laser engravings. Hand-crank music box plays the classic Happy Birthday tune. No batteries needed. Birthday cake and floral motifs engraved on all sides. Precision metal music movement.", price: 699.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/710vUgbQm-L._SL1200.jpg?v=1778357717","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51Wn1wICHlL.jpg?v=1778357732","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/610edhGyEJL._SL1080.jpg?v=1778357733","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/618ckIXdYQL._SL1200.jpg?v=1778357733","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61C30gwTGzL._SL1200.jpg?v=1778357733","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61FKBP1I1VS._SL1200.jpg?v=1778357733","https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61i15se3xTL._SL1207.jpg?v=1778357733"]', categorySlug: "romantic-gifts", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["birthday gift","hand crank","music box","unique gift","wooden gift"]' },
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
    if (!category) {
      console.warn(`[auto-seed] Category not found: ${prod.categorySlug}, skipping product: ${prod.name}`)
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
