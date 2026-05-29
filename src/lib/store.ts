import { create } from 'zustand'

export type View = 'home' | 'product' | 'cart' | 'checkout' | 'orders' | 'order-confirmation' | 'user-dashboard' | 'admin-dashboard' | 'agent-dashboard' | 'team-dashboard' | 'corporate-dashboard' | 'wiki'

export interface AuthUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'user' | 'agent' | 'team' | 'corporate'
}

export interface CartItem {
  productId: string
  name: string
  price: number
  image: string
  quantity: number
  shopifyVariantId?: string  // Shopify variant GID for checkout
  source?: 'local' | 'shopify' | 'affiliate'  // Product source
}

export interface CurrencyInfo {
  code: string
  name: string
  symbol: string
  rate: number
}

interface GeoInfo {
  country: string
  countryName: string
  currency: string
  language: string
  flagEmoji: string
}

interface AppState {
  view: View
  selectedProductId: string | null
  selectedProductPreview: Record<string, any> | null  // Quick preview data from product card for instant rendering
  previousCategory: string | null  // Remembers category before product detail
  searchQuery: string
  selectedCategory: string | null
  selectedParentCategory: string | null  // Parent category from scroll bar (men, women, couple, etc.)
  cartItems: CartItem[]
  lastOrderId: string | null
  authUser: AuthUser | null
  authToken: string | null
  authView: 'login' | 'register' | null
  authTwoFAStep: boolean
  authPendingUserId: string | null
  giftBuilderView: boolean
  homeTimestamp: number  // Always updated on setView('home') to force scroll-to-top re-render

  // Multi-currency & i18n
  locale: string
  currency: string
  currencySymbol: string
  currencyRates: Record<string, CurrencyInfo>
  geoInfo: GeoInfo | null
  geoDetected: boolean

  setView: (view: View) => void
  selectProduct: (productId: string, productPreview?: Record<string, any>) => void
  setSearch: (query: string) => void
  setCategory: (category: string | null) => void
  setParentCategory: (parent: string | null) => void
  addItem: (item: Omit<CartItem, 'quantity'>) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  clearCart: () => void
  setLastOrderId: (orderId: string) => void
  setAuth: (user: AuthUser, token: string) => void
  clearAuth: () => void
  setAuthView: (view: 'login' | 'register' | null) => void
  setAuthTwoFAStep: (step: boolean) => void
  setAuthPendingUserId: (id: string | null) => void
  toggleGiftBuilder: () => void
  setLocale: (locale: string) => void
  setCurrency: (code: string) => void
  setCurrencyRates: (rates: Record<string, CurrencyInfo>) => void
  setGeoInfo: (info: GeoInfo) => void
}

function loadAuthFromStorage(): { user: AuthUser | null; token: string | null } {
  if (typeof window === 'undefined') return { user: null, token: null }
  try {
    const stored = localStorage.getItem('3boxes_auth')
    if (stored) {
      const parsed = JSON.parse(stored)
      return { user: parsed.user ?? null, token: parsed.token ?? null }
    }
  } catch {
    // ignore parse errors
  }
  return { user: null, token: null }
}

function loadLocaleFromStorage(): string {
  if (typeof window === 'undefined') return 'en'
  try {
    return localStorage.getItem('3boxes_locale') || 'en'
  } catch {
    return 'en'
  }
}

function loadCurrencyFromStorage(): string {
  if (typeof window === 'undefined') return 'INR'
  try {
    return localStorage.getItem('3boxes_currency') || 'INR'
  } catch {
    return 'INR'
  }
}

const initialAuth = loadAuthFromStorage()

export const useStore = create<AppState>((set, get) => ({
  view: 'home',
  selectedProductId: null,
  selectedProductPreview: null,
  previousCategory: null,
  searchQuery: '',
  selectedCategory: null,
  selectedParentCategory: null,
  cartItems: [],
  lastOrderId: null,
  authUser: initialAuth.user,
  authToken: initialAuth.token,
  authView: null,
  authTwoFAStep: false,
  authPendingUserId: null,
  giftBuilderView: false,
  homeTimestamp: Date.now(),

  // Multi-currency & i18n
  locale: typeof window !== 'undefined' ? loadLocaleFromStorage() : 'en',
  currency: typeof window !== 'undefined' ? loadCurrencyFromStorage() : 'INR',
  currencySymbol: '₹',
  currencyRates: {},
  geoInfo: null,
  geoDetected: false,

  setView: (view) => {
    // When navigating to home, always clear category and search for a clean home screen
    // Also update homeTimestamp so scroll-to-top always triggers (even if already on home)
    if (view === 'home') {
      set({ view, selectedCategory: null, selectedParentCategory: null, searchQuery: '', homeTimestamp: Date.now() });
    } else {
      set({ view });
    }
  },
  selectProduct: (productId, productPreview) => {
    const currentCategory = get().selectedCategory
    set({
      selectedProductId: productId,
      selectedProductPreview: productPreview || null,
      view: 'product',
      previousCategory: currentCategory,
    })
  },
  setSearch: (query) => set({ searchQuery: query, selectedParentCategory: null }),
  setCategory: (category) => set({ selectedCategory: category, view: 'home' }),
  setParentCategory: (parent) => set({ selectedParentCategory: parent, selectedCategory: null }),
  addItem: (item) =>
    set((state) => {
      const existing = state.cartItems.find((ci) => ci.productId === item.productId)
      if (existing) {
        return {
          cartItems: state.cartItems.map((ci) =>
            ci.productId === item.productId
              ? { ...ci, quantity: ci.quantity + 1 }
              : ci
          ),
        }
      }
      return { cartItems: [...state.cartItems, { ...item, quantity: 1 }] }
    }),
  removeItem: (productId) =>
    set((state) => ({
      cartItems: state.cartItems.filter((ci) => ci.productId !== productId),
    })),
  updateQuantity: (productId, quantity) =>
    set((state) => ({
      cartItems:
        quantity <= 0
          ? state.cartItems.filter((ci) => ci.productId !== productId)
          : state.cartItems.map((ci) =>
              ci.productId === productId ? { ...ci, quantity } : ci
            ),
    })),
  clearCart: () => set({ cartItems: [] }),
  setLastOrderId: (orderId) => set({ lastOrderId: orderId }),
  setAuth: (user, token) => {
    try {
      localStorage.setItem('3boxes_auth', JSON.stringify({ user, token }))
    } catch {
      // ignore storage errors
    }
    set({ authUser: user, authToken: token, authView: null, authTwoFAStep: false, authPendingUserId: null })
  },
  clearAuth: () => {
    try {
      localStorage.removeItem('3boxes_auth')
    } catch {
      // ignore storage errors
    }
    set({ authUser: null, authToken: null, authView: null, authTwoFAStep: false, authPendingUserId: null })
  },
  setAuthView: (view) => set({ authView: view }),
  setAuthTwoFAStep: (step) => set({ authTwoFAStep: step }),
  setAuthPendingUserId: (id) => set({ authPendingUserId: id }),
  toggleGiftBuilder: () => set((state) => ({ giftBuilderView: !state.giftBuilderView })),
  setLocale: (locale) => {
    try {
      localStorage.setItem('3boxes_locale', locale)
    } catch {
      // ignore storage errors
    }
    set({ locale })
  },
  setCurrency: (code) => {
    const rates = get().currencyRates
    const info = rates[code]
    try {
      localStorage.setItem('3boxes_currency', code)
    } catch {
      // ignore storage errors
    }
    set({ currency: code, currencySymbol: info?.symbol || '₹' })
  },
  setCurrencyRates: (rates) => {
    const currentCode = get().currency
    const info = rates[currentCode]
    set({
      currencyRates: rates,
      currencySymbol: info?.symbol || '₹',
    })
  },
  setGeoInfo: (info) => {
    const currentCurrency = get().currency
    // Only auto-set currency and language if user hasn't manually changed them
    const storedCurrency = typeof window !== 'undefined' ? localStorage.getItem('3boxes_currency') : null
    const storedLocale = typeof window !== 'undefined' ? localStorage.getItem('3boxes_locale') : null

    const updates: Partial<AppState> = { geoInfo: info, geoDetected: true }

    // Auto-detect currency from geo if user hasn't set one manually
    if (!storedCurrency && info.currency) {
      try { localStorage.setItem('3boxes_currency', info.currency) } catch {}
      updates.currency = info.currency
    }

    // Auto-detect language from geo if user hasn't set one manually
    // Default language is English for all locations, but suggest the local language
    if (!storedLocale) {
      // Keep English as default, but store detected language for suggestion
      try { localStorage.setItem('3boxes_locale', 'en') } catch {}
      updates.locale = 'en'
    }

    set(updates as AppState)
  },
}))
