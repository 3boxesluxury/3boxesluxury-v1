/**
 * db.ts — Auto-Seeding PrismaClient for Vercel Serverless (v2)
 */

import { PrismaClient } from '@prisma/client'

if (process.env.VERCEL === '1') {
  process.env.DATABASE_URL = 'file:/tmp/3boxes-dev.db';
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  _dbSeeded: boolean | undefined
}

const TABLE_SQL: Record<string, string> = {
  User: `CREATE TABLE IF NOT EXISTS User (
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
  )`,
  Session: `CREATE TABLE IF NOT EXISTS Session (
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
  )`,
  Category: `CREATE TABLE IF NOT EXISTS Category (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    image TEXT,
    shopifyId TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  Product: `CREATE TABLE IF NOT EXISTS Product (
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
  )`,
  Order: `CREATE TABLE IF NOT EXISTS "Order" (
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
  )`,
  OrderItem: `CREATE TABLE IF NOT EXISTS OrderItem (
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
  )`,
  Cart: `CREATE TABLE IF NOT EXISTS Cart (
    id TEXT NOT NULL PRIMARY KEY,
    sessionId TEXT NOT NULL UNIQUE,
    userId TEXT,
    couponCode TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  CartItem: `CREATE TABLE IF NOT EXISTS CartItem (
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
  )`,
  WishlistItem: `CREATE TABLE IF NOT EXISTS WishlistItem (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    productId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id),
    FOREIGN KEY (productId) REFERENCES Product(id),
    UNIQUE(userId, productId)
  )`,
  UserPermission: `CREATE TABLE IF NOT EXISTS UserPermission (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT NOT NULL,
    permission TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (userId) REFERENCES User(id),
    UNIQUE(userId, permission)
  )`,
  AuditLog: `CREATE TABLE IF NOT EXISTS AuditLog (
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
  )`,
  Review: `CREATE TABLE IF NOT EXISTS Review (
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
  )`,
  Vendor: `CREATE TABLE IF NOT EXISTS Vendor (
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
  )`,
  ProductVariant: `CREATE TABLE IF NOT EXISTS ProductVariant (
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
  )`,
  ProductImage: `CREATE TABLE IF NOT EXISTS ProductImage (
    id TEXT NOT NULL PRIMARY KEY,
    productId TEXT NOT NULL,
    url TEXT NOT NULL,
    alt TEXT,
    sort INTEGER NOT NULL DEFAULT 0,
    isActive BOOLEAN NOT NULL DEFAULT true,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (productId) REFERENCES Product(id)
  )`,
}

const ensuredTables = new Set<string>()

async function ensureTable(prisma: any, model: string): Promise<void> {
  if (ensuredTables.has(model)) return
  const sql = TABLE_SQL[model]
  if (!sql) return
  try {
    await prisma.$executeRawUnsafe(sql)
    ensuredTables.add(model)
  } catch {
    ensuredTables.add(model)
  }
}

let bgSeedStarted = false
function startBackgroundSeed(): void {
  if (bgSeedStarted) return
  bgSeedStarted = true
  import('@/lib/auto-seed')
    .then(m => m.ensureSeeded())
    .then(() => console.log('[db] Background seed complete'))
    .catch(err => console.error('[db] Background seed failed:', err.message?.substring(0, 200)))
}

const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = basePrisma

export const db = basePrisma.$extends({
  query: {
    async $allOperations({ model, args, query }) {
      await ensureTable(basePrisma, model)
      try {
        return await query(args)
      } catch (err: any) {
        if (err.message?.includes('does not exist') || err.message?.includes('no such table')) {
          ensuredTables.delete(model)
          await ensureTable(basePrisma, model)
          return query(args)
        }
        throw err
      }
    },
  },
})

if (typeof globalThis !== 'undefined' && !globalForPrisma._dbSeeded) {
  globalForPrisma._dbSeeded = true
  startBackgroundSeed()
}

export { ensureTable }