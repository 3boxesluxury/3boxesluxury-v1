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
 *   - 48 real products scraped from 3boxesgifts.com Shopify store
 *   - All images use Shopify CDN URLs (direct from store)
 *   - Added wait-up-to-10s logic if categories exist but products don't
 *   - Category slugs match exactly between CATEGORIES and PRODUCTS arrays
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

// ─── 48 SCRAPED PRODUCTS FROM SHOPIFY ───
// Distribution: couple-gifts(1), fashion(3), fragrances(7), home-living(14), jewelry(11), leather-goods(6), romantic-gifts(6)
// Categories with 0 Shopify products: watches, sarees, mens-shirts, toys
const PRODUCTS = [
  { name: "Ajmal Oud of Dubai Eau de Parfum 100ml", slug: "ajmal-oud-of-dubai-eau-de-parfum-100ml", description: "Ajmal Oud of Dubai – The Essence of Arabian LuxuryTransport yourself to the golden sands and opulent palaces of Dubai with Oud of Dubai by Ajmal – one of the most prestigi", price: 4999.0, compareAtPrice: 5999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716juhp9cAL._SL1500.jpg?v=1777487051"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"ajmal"' },
  { name: "Amara Heart Locket Necklace – 18K Gold-Tone Engraved Heart Pendant", slug: "amara-heart-locket-necklace-18k-gold-tone-engraved-heart-pendant", description: "Some jewellery is worn. This one is felt. The Amara Heart Locket Necklace is a timeless, sen", price: 799.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51BqqEpXlZL._SY695.jpg?v=1776837923"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Artifi Gold Bracelet for Men & Women | Adjustable Designer Bangle with Blue Evil Eye Charm | Anti Tarnish Fashion Jewelry | Stylish Daily Wear Bracelet Gift for Unisex Adults", slug: "artifi-gold-bracelet-for-men-women-adjustable-designer-bangle-with-blue-evil-eye-charm-anti-tarnish-fashion-jewelry-stylish-daily-wear-bracelet-gift-for-unisex-adults", description: "Stylish Gold Bracelet Set for Women - Artifi gold plated bracelet set designed with multiple styles including chain bracelet, crystal bracelet, and cuff bracelet, perfect fashion jewelry set for wo", price: 999.0, compareAtPrice: 1399.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/516TaGZ77AL._SY625.jpg?v=1776836471"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Aurelia Gold Hand Chain Bracelet – Slave Bracelet with Ring", slug: "aurelia-gold-hand-chain-bracelet-slave-bracelet-with-ring", description: "Adorn your hands with effortless elegance. The Aurelia Gold Hand Chain Bracelet is a stunning slave bracelet that drapes gracef", price: 569.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61C82Y0gpEL._SY625.jpg?v=1776836844"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Aurora Pastel Gemstone Link Bracelet – Moonston", slug: "aurora-pastel-gemstone-link-bracelet-moonston", description: "Soft, dreamy, and utterly feminine — the Aurora Pastel Gemstone Link Bracelet is a wrist full of quiet luxury. Inspired by the", price: 699.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61GIGhv955S._SY625.jpg?v=1776838316"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Best Wifey In The World – Decorative Wooden Tab", slug: "best-wifey-in-the-world-wooden-table-plaque", description: "She deserves to know it every single day. The \\\"Best Wifey In The World\\\" Wooden Table Plaque is a vibrant, heartfelt keepsake th", price: 499.0, compareAtPrice: 699.99, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81KhVm4Kd6L._SL1500.jpg?v=1776627543"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["romantic-gifts"]' },
  { name: "Bla Bli Blu Ivory Oud Parfum 100ml", slug: "bla-bli-blu-ivory-oud-parfum-100ml", description: "Bla Bli Blu Ivory Oud – Raw. Rare. Unforgettable.Bold in colour, bolder in scent. Ivory Oud by Bla Bli Blu is a statement-making unisex parfum that comman", price: 3999.0, compareAtPrice: 4999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61mNqpSRf0L._SL1500.jpg?v=1777521129"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"bla b"' },
  { name: "Celeste Swirl Stud Earrings – Emerald Green & Peach Crystal Gold-Tone", slug: "celeste-swirl-stud-earrings-emerald-green-peach-crystal-gold-tone", description: "Turn every glance into a double-take. The Celeste Swirl Stud Earrings are a bold, artistic jewellery piece that blends sculptur", price: 799.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51ESBttDFtL._SY625.jpg?v=1776837793"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Contraband Hands Off Eau de Parfum", slug: "contraband-hands-off-eau-de-parfum", description: "Contraband Hands Off – The Scent of Bold MovesDare to be different. Contraband Hands Off is a daring, dark, and seductive men\\'s Eau de Parfum crafted for those who play by", price: 3499.0, compareAtPrice: 4299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81g0mVyrVZL._SL1500.jpg?v=1777486781"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"eau d"' },
  { name: "Crystal Teddy Bear – Happy Birthday Glass Figurine Keepsake", slug: "sweetheart-birthday-bear-crystal-glass-edition", description: "Some gifts are forgotten. This one is kept forever. The Crystal Teddy Bear Happy Birthday Figurine is a breathtaking keepsake c", price: 299.0, compareAtPrice: 489.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71lvIdpjVjL._SL1500.jpg?v=1776626785"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["romantic-gifts"]' },
  { name: "Dreamy Girl Resin Planter Pot | Decorative Face Planter", slug: "dreamy-girl-resin-planter-pot-decorative-face-planter", description: "Meet your new favourite desk companion! This whimsical Dreamy Girl Resin Planter features a charming hand-painted girl figure with lavender hair, rosy cheeks, and a serene smile —", price: 849.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71FT2h9bX0L._SL1500.jpg?v=1778356317"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"desk "' },
  { name: "Elegant Gold-Plated Crystal Bangle for Women | Stylish, Durable Anti-Tarnish, Stainless Steel Bracelet | Perfect for Parties & Event Wear", slug: "elegant-gold-plated-crystal-bangle-for-women-stylish-durable-anti-tarnish-stainless-steel-bracelet-perfect-for-parties-event-wear", description: "ELEGANT DESIGN: Features a stunning double-row crystal embellishment on a gold-plated bangle, adding a touch of glamour to any party or event outfit.PREMIUM MATERIAL: Crafted from high-grade st", price: 999.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61-VlFFr8GL._SY695.jpg?v=1776836297"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Executive 3-in-1 Men\\'s Gift Set – Woven Leather Wallet, Keychain & Pen", slug: "executive-3-in-1-mens-gift-set-woven-leather-wallet-keychain-pen", description: "Gifting Made Effortlessly ImpressiveFor the man who commands attention in every room — the Executive 3-in-1 Men\\'s Gift Set is a curated collection of everyday essentials,", price: 1299.0, compareAtPrice: 1799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51x7bf9rv9L.jpg?v=1776973749"]', categorySlug: "leather-goods", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"birth"' },
  { name: "Executive Corporate Gift Set – Notebook, Card Holder, Pen & Keychain (4-in-1)", slug: "executive-corporate-gift-set-notebook-card-holder-pen-keychain-4-in-1", description: "Executive Corporate Gift Set – The Complete Professional PackageMake a lasting impression with this premium 4-in-1 Executive Corporate Gift Set – thoughtfully curated for", price: 1299.0, compareAtPrice: 1799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/41D9WLaBbpL.jpg?v=1777523269"]', categorySlug: "couple-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"corpo"' },
  { name: "Eze Magic Perfume – Luxury Sphere Fragrance", slug: "eze-magic-perfume-luxury-sphere-fragrance", description: "Eze Magic – Where Sorcery Meets ScentIntroducing Eze Magic – a one-of-a-kind luxury perfume that captivates before you even open it. Encased in a stunning matte gold spher", price: 2999.0, compareAtPrice: 3999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61hCdP5svEL._SL1024.jpg?v=1777487344"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"eze m"' },
  { name: "Flutter Trio Butterfly Bangle – White, Gold & Black Enamel Cuff Bracelet", slug: "flutter-trio-butterfly-bangle-white-gold-black-enamel-cuff-bracelet", description: "Embrace transformation. The Flutter Trio Butterfly Bangle is a stunning gold-tone cuff bracelet that celebrates freedom, femini", price: 899.0, compareAtPrice: 1100.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51UTFMZWTrL._SY625.jpg?v=1776838080"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "For the Man with Style – Premium Men\\'s Gift Hamper", slug: "for-the-man-with-style-premium-mens-gift-hamper", description: "The Perfect Gift for Every Man Who Means BusinessCurated for the modern gentleman, this luxurious 4-in-1 gift hamper brings together everyday essentials in one sleek black gift box. Whethe", price: 1999.0, compareAtPrice: 2799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/611x18rL3HL._SL1080.jpg?v=1776971688"]', categorySlug: "fashion", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"birth"' },
  { name: "Forever Yes – Romantic Proposal Couple Figurine Set – Car Dashboard Decor", slug: "romantic-couple-proposal-figurine-set-car-dashboard-decor", description: "Some moments deserve to be remembered forever. The Forever Yes Romantic Proposal Couple Figurine Set captures the most magical", price: 599.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71caXBpEzDL._SL1500.jpg?v=1776627940"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["romantic-gifts"]' },
  { name: "Forever Yours – Romantic Wedding Couple Resin Figurine", slug: "forever-in-your-arms-romantic-couple-figurine", description: "Love lifted me. The Forever Yours Romantic Wedding Couple Figurine captures the most tender moment of a wedding day — the groom", price: 449.99, compareAtPrice: 699.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g87QxbdeL._SL1500__1.jpg?v=1776627237"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["romantic-gifts"]' },
  { name: "Glam Collection – 21-Pair Mixed Stud Earring Set", slug: "glam-collection-21-pair-mixed-stud-earring-set", description: "Elevate every look with our Glam Collection 21-Pair Mixed Stud Earring Set — a curated assortment of charming, fashion-forward", price: 899.0, compareAtPrice: 1100.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71SkAVXh7PL._SY625.jpg?v=1776836614"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Glam Spin 360° Rotating Makeup Organiser – 5-Compartment Vanity Storage with Gold Feet", slug: "cosmetic-organizer", description: "Organisation never looked this good. The Glam Spin 360° Rotating Makeup Organiser combines effortless functionality with boutiq", price: 499.0, compareAtPrice: 700.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81eqbEpACkL._SL1500_dd125ce9-86ed-4b94-940a-1aa10526f306.jpg?v=1776573473"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Golden Crescent Moon Metal Planter | Luxury Desk Planter with Stand", slug: "golden-crescent-moon-metal-planter-luxury-desk-planter-with-stand", description: "Bring celestial elegance to your space with this Golden Crescent Moon Metal Planter — a showstopper that\\'s equal parts art and nature. The graceful crescent moon-shaped iron stand", price: 1299.0, compareAtPrice: 1799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61cvpKv9PxL._SL1500.jpg?v=1778356599"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"gold "' },
  { name: "Golden Love Swan Couple Brass Figurine | Decorative Bird Statue for Home", slug: "golden-love-swan-couple-brass-figurine-decorative-bird-statue-for-home", description: "Celebrate love, loyalty, and togetherness with this stunning Golden Love Swan Couple Brass Figurine. Handcrafted from premium brass, this pair of graceful swans facing each other s", price: 1399.0, compareAtPrice: 1999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71qLW6UYAFL._SL1500.jpg?v=1778357058"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"brass"' },
  { name: "Happy Birthday Wooden Music Box | Hand-Crank Engraved Musical Gift Box", slug: "happy-birthday-wooden-music-box-hand-crank-engraved-musical-gift-box", description: "Make someone\\'s birthday truly unforgettable with this enchanting Happy Birthday Wooden Music Box. Crafted from premium dark wood with intricate gold laser engravings, this hand-cra", price: 699.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/710vUgbQm-L._SL1200.jpg?v=1778357717"]', categorySlug: "romantic-gifts", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"birth"' },
  { name: "Lattafa Pride Shaheen Gold Eau de Parfum 100ml", slug: "lattafa-pride-shaheen-gold-eau-de-parfum-100ml", description: "Lattafa Pride Shaheen Gold – Soar Above the OrdinaryInspired by the majestic Shaheen falcon – a symbol of power, nobility, and freedom – Shaheen Gold by Lattafa Pr", price: 4499.0, compareAtPrice: 5499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61Av7nf32qL._SL1200.jpg?v=1777521886"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"eau d"' },
  { name: "Lumière Chunky Gold Huggie Hoop Earrings", slug: "lumiere-chunky-gold-huggie-hoop-earrings", description: "Less is more — and these say it all. The Lumière Chunky Gold Huggie Hoops are the ultimate everyday luxury earring, crafted for", price: 599.0, compareAtPrice: 899.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61g_74zKC6L._SY625.jpg?v=1776837312"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Luxe Sip Glass Tumbler – 400ml Borosilicate Can Glass with Straw & Lid", slug: "kikiluxxa-glass-coffee-sipper-tumbler-mug-with-straw-and-lid", description: "Elevate every sip. The Luxe Sip Glass Tumbler is where premium craftsmanship meets everyday indulgence — a beautifully designed", price: 400.0, compareAtPrice: 600.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61JlzOYPsdL.jpg?v=1776625611"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Men\\'s Reversible Textured Leather Belt – Black & Brown with Silver Buckle", slug: "mens-reversible-textured-leather-belt-black-brown-with-silver-buckle", description: "Two Belts. One Buckle. Endless Outfits.Why own one belt when you can have two? The Men\\'s Reversible Textured Leather Belt flips effortlessly from sleek black</stro", price: 599.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81hIaTcUUyL._SY606.jpg?v=1776973987"]', categorySlug: "leather-goods", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"gift "' },
  { name: "Men\\'s Woven Texture Slim Bifold Leather Wallet – Dark Brown with Metal Logo", slug: "mens-woven-texture-slim-bifold-leather-wallet-dark-brown-with-metal-logo", description: "Carry Less. Look More.Some accessories whisper luxury — this one speaks it fluently. The Men\\'s Woven Texture Slim Bifold Wallet in deep dark brown is crafted with an intri", price: 499.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51qC0XooIGL.jpg?v=1776974769"]', categorySlug: "leather-goods", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"bifol"' },
  { name: "Noir Heart Gold Bangle – Crystal & Enamel Heart Bracelet", slug: "noir-heart-gold-bangle-crystal-enamel-heart-bracelet", description: "Make a bold yet romantic statement with the Noir Heart Gold Bangle — a luxurious gold-tone cuff bracelet that beautifully blend", price: 999.0, compareAtPrice: 1100.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61zEkPSefOL._SX625.jpg?v=1776837002"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Nordic Donut Ceramic Vase | Matte White Ring Vase for Home Decor", slug: "nordic-donut-ceramic-vase-matte-white-ring-vase-for-home-decor", description: "Elevate your living space with the effortlessly chic Nordic Donut Ceramic Vase — a minimalist masterpiece inspired by Scandinavian design. Its iconic hollow ring shape and smooth m", price: 899.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71AO8RwOCjL._SL1000.jpg?v=1778357288"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"ceram"' },
  { name: "Pack of two", slug: "pack-of-two", description: "Indulge in the warmth and ambiance of our Scented Candles Pack of Two. Each candle is carefully crafted to fill your space with delightful fragrances that create a calming atmosphere. Perfect for rela", price: 499.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/products/image_QwT2_1.5x.png?v=1701509362"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Palm Buddha Resin Statue | Black & Gold Meditating Buddha Figurine", slug: "palm-buddha-resin-statue-black-gold-meditating-buddha-figurine", description: "Invite peace, prosperity, and positive energy into your home with this exquisite Palm Buddha Resin Statue. Masterfully crafted, the serene Buddha figure rests within a cupped hand", price: 1099.0, compareAtPrice: 1599.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81uBEI52sjL._SL1500.jpg?v=1778356860"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"buddh"' },
  { name: "Park Avenue Good Morning 7-in-1 Men\\'s Grooming Kit with Free Travel Pouch", slug: "park-avenue-good-morning-grooming-collection-7-in-1-combo-grooming-kit", description: "The Gentleman\\'s Grooming Ritual, Perfectly PackagedStart every morning with confidence. The Park Avenue Good Morning 7-in-1 Grooming Kit is a premium, all-in-one collectio", price: 699.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71_oZ0PCZwL._SL1500.jpg?v=1776594349"]', categorySlug: "fashion", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"Fathe"' },
  { name: "Peacock Soul Beaded Charm Bracelet – Chrysocolla & Blue Agate Stone Beads", slug: "peacock-soul-beaded-charm-bracelet-chrysocolla-blue-agate-stone-beads", description: "Wear the energy of nature on your wrist. The Peacock Soul Beaded Charm Bracelet is a stunning handcrafted piece featuring rich", price: 799.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71Usb9RFekL._SY695.jpg?v=1776837558"]', categorySlug: "jewelry", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["jewelry"]' },
  { name: "Premium 4-in-1 Men\\'s Gift Set – Watch, Perfume, Belt & Wallet in Red Gift Box", slug: "premium-4-in-1-mens-gift-set-watch-perfume-belt-wallet-in-red-gift-box", description: "The Ultimate Gift for the Man Who Has EverythingFour essentials. One stunning red box. Zero effort on your part.The Premium 4-in-1 Men\\'s Gift Set brings together th", price: 1799.0, compareAtPrice: 2499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81uO-rAPMpL._SX679.jpg?v=1776974518"]', categorySlug: "leather-goods", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"corpo"' },
  { name: "Rose of No Man\\'s Land Premium PU Leather Makeup & Travel Organiser Bag", slug: "rose-of-no-mans-land-premium-pu-leather-makeup-travel-organiser-bag", description: "Carry Your World in StyleMeet the bag that makes getting ready feel like a luxury ritual. The Rose of No Man\\'s Land Premium Makeup & Travel Organiser is crafted in ric", price: 899.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71qSTWtRyAL._SL1500.jpg?v=1776972506"]', categorySlug: "fashion", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"beaut"' },
  { name: "Scented Candels", slug: "pack-of-two-copy-1", description: "Illuminate your space with the warm, inviting glow of our Scented Candles. Crafted with premium wax and infused with captivating fragrances, each candle transforms any room into a sanctuary of comfort", price: 499.0, compareAtPrice: 799.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_12_1_af106263-9e79-437f-8762-015a1bc8b759.png?v=1774078872"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Scented Candels", slug: "secrented-candels", description: "Illuminate your space with the warm glow of our Scented Candles. Each candle is carefully crafted to fill your home with enchanting fragrances that create the perfect ambiance for any moment. Whether", price: 300.0, compareAtPrice: 325.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_1_1.png?v=1774078497"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Scented Candels", slug: "secrented-candels-copy", description: "Illuminate your space with the warm glow of our Scented Candles. Crafted with premium wax and infused with captivating fragrances, each candle transforms any room into a sanctuary of comfort and relax", price: 300.0, compareAtPrice: 325.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_17_1.png?v=1774078826"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Scented Candels", slug: "secrented-candels-copy-1", description: "Illuminate your space with the warm glow of our Scented Candles. Each candle is carefully crafted to fill your home with delightful fragrances that create a calming and inviting atmosphere. Perfect fo", price: 300.0, compareAtPrice: 325.99, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_7_1_eaaa02e5-18ef-44f1-a2ae-aa854f1017ed.png?v=1774078791"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Scented Candels", slug: "secrented-candels-copy-copy", description: "Elevate your space with our luxurious Scented Candles pack of 5. Each candle is carefully crafted to fill your home with captivating fragrances that create a warm, inviting atmosphere. Perfect for rel", price: 1200.0, compareAtPrice: 1500.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/BlueWhiteMinimalistPodiumDisplayBabyShoesCollectionInstagramPost_4_1.png?v=1774078685"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "Teal Sip Set – Turquoise Ceramic Coffee Mugs, Set of 4 (200ml)", slug: "solimo-ceramic-coffee-mugs", description: "Start every morning with colour, warmth, and style. The Teal Sip Set brings together four beautifully crafted <s", price: 399.0, compareAtPrice: 498.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71NdtEN_aWL._SL1500.jpg?v=1776625863"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "The Man Company Oud Regal Eau de Parfum 100ml – Pour Homme", slug: "the-man-company-oud-regal-eau-de-parfum-100ml-pour-homme", description: "The Man Company Oud Regal – Bold. Powerful. Unforgettable.Some fragrances whisper. Oud Regal commands. Crafted for the man who owns every room he walks into, this premium", price: 2799.0, compareAtPrice: 3499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61wg5Dt8JxL._SL1100.jpg?v=1777522121"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"eau d"' },
  { name: "The Man Company Perfume Gift Set – Black, Blanc, Fire & Night (4 x 50ml)", slug: "the-man-company-perfume-gift-set-black-blanc-fire-night-4-x-50ml", description: "The Man Company – 4-Fragrance Gift SetFour iconic scents. One legendary gift. The The Man Company Perfume Gift Set brings together four distinct fragrances – Black", price: 2499.0, compareAtPrice: 3499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/61CHYO2caVL._SL1100.jpg?v=1777520430"]', categorySlug: "fragrances", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"eau d"' },
  { name: "Vanity Queen 360° Rotating Makeup Organiser – Large Multi-Compartment Beauty Storage", slug: "360-rotating-makeup-organizer", description: "360° Rotating Makeup Organizer – Smooth 360 degree rotation design allows easy access to all your cosmetics, makeup brushes, skincare bottles and accessories without cluttering your vanity, bathroo", price: 499.0, compareAtPrice: 700.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/71TE3F8ba5L._SL1500.jpg?v=1776573632"]', categorySlug: "home-living", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '["home-living"]' },
  { name: "WildHorn 3-in-1 Men\\'s Gift Set – Genuine Leather Wallet, Keychain & Pen", slug: "wildhorn-3-in-1-mens-gift-set-genuine-leather-wallet-keychain-pen", description: "Three Essentials. One Iconic Brand. Zero Compromise.Crafted for the man who appreciates quality in every detail, the WildHorn 3-in-1 Men\\'s Gift Set brings together three e", price: 999.0, compareAtPrice: 1499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/81QPrL3sobL._SL1500.jpg?v=1776975330"]', categorySlug: "leather-goods", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"corpo"' },
  { name: "WildHorn Genuine Leather Slim Bifold Wallet – Teal Blue", slug: "wildhorn-genuine-leather-slim-bifold-wallet-teal-blue", description: "Real Leather. Real Style. Real Everyday.Not all wallets are created equal. The WildHorn Genuine Leather Slim Bifold Wallet in striking teal blue is crafte", price: 799.0, compareAtPrice: 1299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/615Xib7EkuL._SL1014.jpg?v=1776975099"]', categorySlug: "leather-goods", stock: 10, rating: 4.5, reviewCount: 10, featured: true, tags: '"bifol"' },
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
  const [categoryCount, productCount] = await Promise.all([
    db.category.count(),
    db.product.count(),
  ])

  if (categoryCount > 0 && productCount > 0) {
    isSeeded = true
    return
  }

  // Edge case: categories exist but products don't (Vercel partial state)
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

  // Seed products — match to category by slug
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
