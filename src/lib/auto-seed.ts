/**
 * Auto-Seed Utility for Vercel Deployment
 */

import { db } from './db'

let seedPromise: Promise<void> | null = null
let isSeeded = false
let schemaEnsured = false

async function ensureSchema(): Promise<void> {
  if (schemaEnsured) return
  try {
    await db$queryRawSELECT 1 FROM Category LIMIT 1`
    schemaEnsured = true
    return
  } catch {}
  console.log('[auto-seed] Creating database schema...')
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Category (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT, image TEXT, shopifyId TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Product (id TEXT NOT NULL PRIMARY KEY, productNumber TEXT NOT NULL UNIQUE, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, description TEXT NOT NULL, price REAL NOT NULL, compareAtPrice REAL, costPrice REAL, sku TEXT, images TEXT NOT NULL, categoryId TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 0, stockStatus TEXT NOT NULL DEFAULT 'in_stock', reorderLevel INTEGER NOT NULL DEFAULT 5, rating REAL NOT NULL DEFAULT 0, reviewCount INTEGER NOT NULL DEFAULT 0, featured BOOLEAN NOT NULL DEFAULT false, tags TEXT, occasions TEXT, recipientTypes TEXT, relationships TEXT, deliveryEstimate TEXT, vendorId TEXT, sourceUrl TEXT, platform TEXT, affiliateUrl TEXT, affiliateId TEXT, commission REAL, externalId TEXT, lastSyncedAt DATETIME, syncStatus TEXT NOT NULL DEFAULT 'active', isExternal BOOLEAN NOT NULL DEFAULT false, shopifyId TEXT, source TEXT, shopifyVariantId TEXT, shopifyData TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (categoryId) REFERENCES Category(id));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Product_categoryId_idx ON Product(categoryId);`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Product_shopifyId_idx ON Product(shopifyId);`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Product_slug_idx ON Product(slug);`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Product_featured_idx ON Product(featured);`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Product_createdAt_idx ON Product(createdAt);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS User (id TEXT NOT NULL PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT, role TEXT NOT NULL DEFAULT 'user', adminRole TEXT, corporateRole TEXT, avatar TEXT, phone TEXT, isActive BOOLEAN NOT NULL DEFAULT true, emailVerified BOOLEAN NOT NULL DEFAULT false, phoneVerified BOOLEAN NOT NULL DEFAULT false, twoFactorSecret TEXT, twoFactorEnabled BOOLEAN NOT NULL DEFAULT false, twoFactorRequired BOOLEAN NOT NULL DEFAULT false, approvalStatus TEXT NOT NULL DEFAULT 'pending', socialProvider TEXT, socialId TEXT, resetToken TEXT, resetTokenExpiry DATETIME, otpCode TEXT, otpExpiry DATETIME, emailVerifyToken TEXT, emailVerifyExpiry DATETIME, phoneVerifyCode TEXT, phoneVerifyExpiry DATETIME, lastLoginAt DATETIME, lastLoginIp TEXT, lastLoginDevice TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, preferredLanguage TEXT DEFAULT 'en', preferredCurrency TEXT DEFAULT 'INR', detectedCountry TEXT);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Session (id TEXT NOT NULL PRIMARY KEY, token TEXT NOT NULL UNIQUE, userId TEXT NOT NULL, ipAddress TEXT, userAgent TEXT, deviceInfo TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expiresAt DATETIME NOT NULL, lastActivity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (userId) REFERENCES User(id));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Session_userId_idx ON Session(userId);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Cart (id TEXT NOT NULL PRIMARY KEY, sessionId TEXT NOT NULL UNIQUE, userId TEXT, couponCode TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS CartItem (id TEXT NOT NULL PRIMARY KEY, cartId TEXT NOT NULL, productId TEXT NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, variantId TEXT, giftWrapping BOOLEAN NOT NULL DEFAULT false, greetingMessage TEXT, hidePrice BOOLEAN NOT NULL DEFAULT false, FOREIGN KEY (cartId) REFERENCES Cart(id), FOREIGN KEY (productId) REFERENCES Product(id));`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS WishlistItem (id TEXT NOT NULL PRIMARY KEY, userId TEXT NOT NULL, productId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (userId) REFERENCES User(id), FOREIGN KEY (productId) REFERENCES Product(id), UNIQUE(userId, productId));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS WishlistItem_userId_idx ON WishlistItem(userId);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS ProductVariant (id TEXT NOT NULL PRIMARY KEY, productId TEXT NOT NULL, name TEXT NOT NULL, sku TEXT, price REAL NOT NULL, compareAtPrice REAL, stock INTEGER NOT NULL DEFAULT 0, stockStatus TEXT NOT NULL DEFAULT 'in_stock', attributes TEXT NOT NULL, image TEXT, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (productId) REFERENCES Product(id));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS ProductVariant_productId_idx ON ProductVariant(productId);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS ProductImage (id TEXT NOT NULL PRIMARY KEY, productId TEXT NOT NULL, url TEXT NOT NULL, alt TEXT, sort INTEGER NOT NULL DEFAULT 0, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (productId) REFERENCES Product(id));`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Vendor (id TEXT NOT NULL PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, contactName TEXT, email TEXT, phone TEXT, address TEXT, gstNumber TEXT, isActive BOOLEAN NOT NULL DEFAULT true, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS "Order" (id TEXT NOT NULL PRIMARY KEY, orderNumber TEXT NOT NULL UNIQUE, email TEXT NOT NULL, firstName TEXT NOT NULL, lastName TEXT NOT NULL, address TEXT NOT NULL, city TEXT NOT NULL, state TEXT NOT NULL, zipCode TEXT NOT NULL, country TEXT NOT NULL, phone TEXT, subtotal REAL NOT NULL, shipping REAL NOT NULL, tax REAL NOT NULL, discount REAL NOT NULL DEFAULT 0, total REAL NOT NULL, status TEXT NOT NULL DEFAULT 'pending', paymentMethod TEXT NOT NULL DEFAULT 'card', paymentStatus TEXT NOT NULL DEFAULT 'pending', deliveryType TEXT NOT NULL DEFAULT 'standard', scheduledDate DATETIME, occasion TEXT, giftWrapping BOOLEAN NOT NULL DEFAULT false, giftWrapStyle TEXT, greetingMessage TEXT, hidePrice BOOLEAN NOT NULL DEFAULT false, couponCode TEXT, trackingNumber TEXT, trackingUrl TEXT, estimatedDelivery DATETIME, cancelledAt DATETIME, cancelReason TEXT, refundStatus TEXT, refundAmount REAL, refundedAt DATETIME, userId TEXT, shopifyOrderId TEXT, shopifyOrderName TEXT, shopifyOrderData TEXT, shopifyCartId TEXT, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (userId) REFERENCES User(id));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS "Order_email_idx" ON "Order"(email);`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"(status);`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS "Order_createdAt_idx" ON "Order"(createdAt);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS OrderItem (id TEXT NOT NULL PRIMARY KEY, orderId TEXT NOT NULL, productId TEXT NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, quantity INTEGER NOT NULL, image TEXT, variantId TEXT, variantName TEXT, giftWrapping BOOLEAN NOT NULL DEFAULT false, greetingMessage TEXT, hidePrice BOOLEAN NOT NULL DEFAULT false, FOREIGN KEY (orderId) REFERENCES "Order"(id), FOREIGN KEY (productId) REFERENCES Product(id));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS OrderItem_orderId_idx ON OrderItem(orderId);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Review (id TEXT NOT NULL PRIMARY KEY, productId TEXT NOT NULL, orderId TEXT, userId TEXT, userName TEXT NOT NULL, rating INTEGER NOT NULL, title TEXT, comment TEXT NOT NULL, verified BOOLEAN NOT NULL DEFAULT false, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (productId) REFERENCES Product(id));`)
  await db.$executeRawUnsafe(CREATE INDEX IF NOT EXISTS Review_productId_idx ON Review(productId);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS CurrencyRate (id TEXT NOT NULL PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL, symbol TEXT NOT NULL, rate REAL NOT NULL, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`)
  await db.$executeRawUnsafe(CREATE TABLE IF NOT EXISTS Offer (id TEXT NOT NULL PRIMARY KEY, title TEXT NOT NULL, description TEXT, code TEXT NOT NULL UNIQUE, type TEXT NOT NULL, value REAL NOT NULL, minOrder REAL, maxDiscount REAL, validFrom DATETIME NOT NULL, validTo DATETIME NOT NULL, isActive BOOLEAN NOT NULL DEFAULT true, usageLimit INTEGER, usedCount INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);`)
  schemaEnsured = true
  console.log('[auto-seed] Schema created successfully')
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

const PRODUCTS = [
  { name: "Ajmal Oud of Dubai Eau de Parfum 100ml", slug: "ajmal-oud-of-dubai-eau-de-parfum-100ml", description: "Rich, warm, and deeply sensual Eau de Parfum.", price: 4999.0, compareAtPrice: 5999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/716juhp9cAL._SL1500.jpg?v=1777487051"]', categorySlug: "fragrances", stock: 0, rating: 4.7, reviewCount: 25, featured: false, tags: '["ajmal","eau de parfum","gift","luxury perfume","oud"]' },
  { name: "Amara Heart Locket Necklace", slug: "amara-heart-locket-necklace-18k-gold-tone", description: "A beautifully engraved gold-tone heart locket pendant.", price: 799.0, compareAtPrice: 999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/51BqqEpXlZL._SY695.jpg?v=1776837923"]', categorySlug: "jewelry", stock: 10, rating: 4.7, reviewCount: 25, featured: false, tags: null },
  { name: "Radiant Rose Gold Diamond Stud Earrings", slug: "radiant-rose-gold-diamond-stud-earrings", description: "Elegant rose gold stud earrings.", price: 2499.0, compareAtPrice: 3299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/earring1.jpg"]', categorySlug: "jewelry", stock: 8, rating: 4.5, reviewCount: 18, featured: true, tags: '["earrings","diamond","rose gold"]' },
  { name: "Vintage Brown Leather Wallet", slug: "vintage-brown-leather-wallet", description: "Handcrafted premium leather wallet with RFID protection.", price: 1299.0, compareAtPrice: 1599.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/wallet1.jpg"]', categorySlug: "leather-goods", stock: 15, rating: 4.3, reviewCount: 12, featured: false, tags: '["wallet","leather","RFID"]' },
  { name: "Royal Crystal Candle Holder Set", slug: "royal-crystal-candle-holder-set", description: "Luxury crystal candle holders for elegant home decor.", price: 1899.0, compareAtPrice: 2499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/candle1.jpg"]', categorySlug: "home-living", stock: 6, rating: 4.6, reviewCount: 20, featured: true, tags: '["candle holder","crystal","home decor"]' },
  { name: "Forever Together Couple Watch Set", slug: "forever-together-couple-watch-set", description: "Matching luxury watch set for couples.", price: 5999.0, compareAtPrice: 7999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/couple-watch.jpg"]', categorySlug: "couple-gifts", stock: 4, rating: 4.8, reviewCount: 30, featured: true, tags: '["couple","watch set","gift"]' },
  { name: "Love & Roses Gift Hamper", slug: "love-roses-gift-hamper", description: "Premium gift hamper with roses, chocolates, and scented candles.", price: 2499.0, compareAtPrice: 2999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/hamper1.jpg"]', categorySlug: "romantic-gifts", stock: 7, rating: 4.9, reviewCount: 35, featured: true, tags: '["romantic","gift hamper","roses"]' },
  { name: "Silk Evening Clutch", slug: "silk-evening-clutch-gold", description: "Elegant silk clutch with gold-tone hardware.", price: 1599.0, compareAtPrice: 1999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/clutch1.jpg"]', categorySlug: "fashion", stock: 9, rating: 4.4, reviewCount: 15, featured: false, tags: '["clutch","silk","evening bag"]' },
  { name: "Chronos Automatic Dress Watch", slug: "chronos-automatic-dress-watch", description: "Swiss-inspired automatic dress watch with sapphire crystal.", price: 8999.0, compareAtPrice: 11999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/watch1.jpg"]', categorySlug: "watches", stock: 3, rating: 4.9, reviewCount: 42, featured: true, tags: '["automatic","dress watch","sapphire"]' },
  { name: "Banarasi Silk Saree", slug: "banarasi-silk-saree-royal-blue", description: "Handwoven Banarasi silk saree with gold zari work.", price: 6999.0, compareAtPrice: 8999.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/saree1.jpg"]', categorySlug: "sarees", stock: 5, rating: 4.8, reviewCount: 28, featured: true, tags: '["banarasi","silk saree","zari"]' },
  { name: "Premium White Egyptian Cotton Shirt", slug: "premium-white-egyptian-cotton-shirt", description: "Luxurious Egyptian cotton formal shirt.", price: 2499.0, compareAtPrice: 3299.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/shirt1.jpg"]', categorySlug: "mens-shirts", stock: 12, rating: 4.5, reviewCount: 22, featured: false, tags: '["egyptian cotton","formal shirt","white"]' },
  { name: "Luxury Chess Set", slug: "luxury-chess-set-rosewood-maple", description: "Handcrafted wooden chess set with weighted pieces.", price: 3499.0, compareAtPrice: 4499.0, images: '["https://cdn.shopify.com/s/files/1/0674/7327/7150/files/chess1.jpg"]', categorySlug: "toys", stock: 4, rating: 4.7, reviewCount: 16, featured: false, tags: '["chess","wooden","luxury game"]' },
]

const DEMO_USERS = [
  { email: 'admin@3boxesluxury.com', name: 'Admin', password: '$2a12$LJ3m4ys3Lg2RqwmnVYQWVuVxFOYnY3Yx1KQ9tBJCxGkEhJzGt5W6i', role: 'admin', isActive: true, approvalStatus: 'approved', emailVerified: true },
  { email: 'user@3boxesluxury.com', name: 'User', password: '$2a12$LJ3m4ys3Lg2RqwmnVYQWVuVxFOYnY3Yx1KQ9tBJCxGkEhJzGt5W6i', role: 'user', isActive: true, approvalStatus: 'approved', emailVerified: true },
]

async function doSeed(): Promise<void> {
  await ensureSchema()
  const categoryCount = await db.category.count()
  if (categoryCount > 0) { isSeeded = true; return }
  console.log('[auto-seed] Database is empty, seeding...')
  for (const cat of CATEGORIES) { await db.category.upsert({ where: { slug: cat.slug }, update: cat, create: cat }) }
  console.log([auto-seed] Created ${CATEGORIES.length} categories)
  let productCounter = 10001
  for (const prod of PRODUCTS) { const category = await db.category.findUnique({ where: { slug: prod.categorySlug } }); if (!category) continue; const { categorySlug, ...productData } = prod; const productNumber = PRD-; productCounter++; await db.product.upsert({ where: { slug: prod.slug }, update: { ...productData, categoryId: category.id, productNumber }, create: { ...productData, categoryId: category.id, productNumber } }) }
  console.log([auto-seed] Created ${PRODUCTS.length} products)
  for (const user of DEMO_USERS) { await db.user.upsert({ where: { email: user.email }, update: {}, create: user }) }
  console.log([auto-seed] Created ${DEMO_USERS.length} demo users)
  isSeeded = true
  console.log('[auto-seed] Done!')
}

export function ensureSeeded(): Promise<void> {
  if (isSeeded) return Promise.resolve()
  if (!seedPromise) { seedPromise = doSeed().catch((err) => { console.error('[auto-seed] Failed:', err); seedPromise = null; isSeeded = false; schemaEnsured = false }) }
  return seedPromise
}
