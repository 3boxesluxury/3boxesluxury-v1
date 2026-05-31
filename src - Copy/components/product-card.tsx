'use client';

import { useStore } from '@/lib/store';
import { useAffiliateClick } from '@/hooks/useAffiliateClick';
import { useCurrency } from '@/lib/currency';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { motion } from 'framer-motion';
import { Star, ShoppingCart, ShoppingBag, ExternalLink, Sparkles } from 'lucide-react';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  compareAtPrice: number | null;
  images: string[];
  category: string;
  categorySlug: string;
  stock: number;
  rating: number;
  reviewCount: number;
  featured: boolean;
  tags: string[];
  isExternal?: boolean;
  platform?: string;
  sourceUrl?: string;
  affiliateUrl?: string;
  platformLogo?: string;
  shopifyId?: string | null;
  shopifyVariantId?: string | null;
  source?: 'local' | 'shopify' | 'affiliate';
  createdAt?: string | null;
}

// Platform badge colors for the pill badge on card image (solid backgrounds)
const PLATFORM_BADGE_COLORS: Record<string, string> = {
  caratlane: 'bg-amber-600/90',
  tanishq: 'bg-rose-600/90',
  bluestone: 'bg-blue-600/90',
  voylla: 'bg-purple-600/90',
  myntra: 'bg-red-600/90',
  nykaa: 'bg-pink-600/90',
  amazon: 'bg-orange-600/90',
  flipkart: 'bg-yellow-600/90',
};

// Platform button brand colors (for Shop on Platform CTA)
const PLATFORM_BUTTON_COLORS: Record<string, string> = {
  caratlane: 'bg-amber-600 hover:bg-amber-500',
  tanishq: 'bg-rose-600 hover:bg-rose-500',
  bluestone: 'bg-blue-600 hover:bg-blue-500',
  voylla: 'bg-purple-600 hover:bg-purple-500',
  myntra: 'bg-red-600 hover:bg-red-500',
  nykaa: 'bg-pink-600 hover:bg-pink-500',
  amazon: 'bg-orange-600 hover:bg-orange-500',
  flipkart: 'bg-yellow-600 hover:bg-yellow-500',
};

// Platform "available on" text colors
const PLATFORM_TEXT_COLORS: Record<string, string> = {
  caratlane: 'text-amber-400',
  tanishq: 'text-rose-400',
  bluestone: 'text-blue-400',
  voylla: 'text-purple-400',
  myntra: 'text-red-400',
  nykaa: 'text-pink-400',
  amazon: 'text-orange-400',
  flipkart: 'text-yellow-400',
};

const PLATFORM_DISPLAY_NAMES: Record<string, string> = {
  myntra: 'Myntra',
  nykaa: 'Nykaa',
  amazon: 'Amazon',
  flipkart: 'Flipkart',
  caratlane: 'CaratLane',
  tanishq: 'Tanishq',
  bluestone: 'BlueStone',
  voylla: 'Voylla',
};

export function ProductCard({ product }: { product: Product }) {
  const { selectProduct, addItem } = useStore();
  const { trackClick } = useAffiliateClick();
  const { format } = useCurrency();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [isAdding, setIsAdding] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [triedProxy, setTriedProxy] = useState(false);

  // Prefetch product detail on hover so it loads instantly on click
  const handleMouseEnter = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ['product', product.id],
      queryFn: async () => {
        const res = await fetch(`/api/products/${encodeURIComponent(product.id)}`);
        if (!res.ok) return null;
        return res.json();
      },
      staleTime: 5 * 60 * 1000,
    });
  }, [queryClient, product.id]);

  // All product images (including Shopify CDN) are publicly accessible - no proxy needed
  // Falls back to image proxy for external URLs that might have CORS issues
  const getProxiedImageUrl = (url: string): string => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    if (url.startsWith('//')) {
      return 'https:' + url;
    }
    // For relative paths (local images), return as-is
    return url.startsWith('/') ? url : `/${url}`;
  };

  const mainImage = product.images.length > 0
    ? getProxiedImageUrl(product.images[0])
    : '/images/placeholder.jpg';

  // Fallback: try image proxy when direct URL fails
  const proxyImage = mainImage.startsWith('http') && !triedProxy
    ? `/api/image-proxy?url=${encodeURIComponent(mainImage)}`
    : null;
  const isExternal = product.isExternal && product.platform;
  const platformSlug = product.platform?.toLowerCase() || '';
  const platformName = PLATFORM_DISPLAY_NAMES[platformSlug] || product.platform || '';
  const shopUrl = product.affiliateUrl || product.sourceUrl || '#';

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAdding(true);
    addItem({
      productId: product.id,
      name: product.name,
      price: product.price,
      image: mainImage,
      shopifyVariantId: product.shopifyVariantId || undefined,
      source: product.source || 'local',
    });
    setTimeout(() => setIsAdding(false), 600);
  };

  const handleShopOnPlatform = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (product.sourceUrl) {
      trackClick(product.id, platformSlug, product.sourceUrl, product.affiliateUrl);
    } else {
      window.open(shopUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const discount = product.compareAtPrice
    ? Math.round(((product.compareAtPrice - product.price) / product.compareAtPrice) * 100)
    : 0;

  // Check if product is a new arrival (created within last 30 days)
  const isNewArrival = (() => {
    if (!product.createdAt) return false;
    const createdDate = new Date(product.createdAt);
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    return createdDate >= thirtyDaysAgo;
  })();

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.3 }}
      className="card-glow group cursor-pointer overflow-hidden rounded-lg border border-amber-900/20 bg-stone-900/60"
      onClick={() => selectProduct(product.id, product)}
      onMouseEnter={handleMouseEnter}
    >
      {/* Image */}
      <div className="relative aspect-square overflow-hidden bg-stone-800">
        {!imageError ? (
          <img
            src={triedProxy && proxyImage ? proxyImage : mainImage}
            alt={product.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
            onError={() => {
              // First try: use image proxy if available and not already tried
              if (proxyImage && !triedProxy) {
                setTriedProxy(true);
              } else {
                setImageError(true);
              }
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-stone-800 to-stone-900">
            <span className="text-3xl text-amber-600/40">💎</span>
          </div>
        )}

        {/* Badges */}
        <div className="absolute left-2 top-2 flex flex-col gap-1">
          {isNewArrival && (
            <span className="flex items-center gap-1 rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white shadow-sm">
              <Sparkles className="h-2.5 w-2.5" />
              New Arrival
            </span>
          )}
          {product.featured && (
            <span className="rounded bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase text-stone-950">
              {t('common.featured')}
            </span>
          )}
          {discount > 0 && (
            <span className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {t('products.discount', { percent: String(discount) })}
            </span>
          )}
        </div>

        {/* Platform Badge - pill in top-right with brand color */}
        {isExternal && platformSlug && (
          <span className={`absolute top-2 right-2 z-10 rounded-full ${PLATFORM_BADGE_COLORS[platformSlug] || 'bg-emerald-600/90'} px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm flex items-center gap-1`}>
            {platformName}
            <ExternalLink className="h-2.5 w-2.5" />
          </span>
        )}

        {/* Shopify Badge */}
        {product.source === 'shopify' && !isExternal && (
          <span className="absolute top-2 right-2 z-10 rounded-full bg-emerald-600/90 px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm flex items-center gap-1">
            Shopify
            <ShoppingBag className="h-2.5 w-2.5" />
          </span>
        )}

        {/* Stock badge */}
        {product.stock <= 3 && product.stock > 0 && !isExternal && (
          <span className="absolute right-2 bottom-2 rounded bg-red-900/80 px-2 py-0.5 text-[10px] font-medium text-red-200">
            {t('common.onlyLeft', { count: String(product.stock) })}
          </span>
        )}
        {product.stock === 0 && !isExternal && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-950/70">
            <span className="rounded bg-stone-900 px-4 py-2 text-sm font-bold text-amber-200/60">
              {t('common.soldOut')}
            </span>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <p className="text-[10px] uppercase tracking-wider text-amber-500/60">
            {product.category}
          </p>
          {isExternal && product.platformLogo && (
            <img
              src={product.platformLogo}
              alt={platformName}
              width={12}
              height={12}
              className="rounded-sm opacity-60"
            />
          )}
        </div>
        <h3 className="mt-1 text-sm font-semibold text-amber-100 line-clamp-1 group-hover:text-amber-400 transition-colors">
          {product.name}
        </h3>

        {/* Rating */}
        <div className="mt-1.5 flex items-center gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <Star
              key={i}
              className={`h-3 w-3 ${
                i < Math.floor(product.rating)
                  ? 'fill-amber-500 text-amber-500'
                  : 'text-amber-700/40'
              }`}
            />
          ))}
          <span className="ml-1 text-[10px] text-amber-200/40">
            ({product.reviewCount})
          </span>
        </div>

        {/* Price */}
        <div className="mt-2 flex items-baseline gap-2">
          <span className="text-lg font-bold text-amber-400">
            {format(product.price)}
          </span>
          {product.compareAtPrice && (
            <span className="text-xs text-amber-200/30 line-through">
              {format(product.compareAtPrice)}
            </span>
          )}
        </div>

        {/* CTA Section */}
        {isExternal ? (
          <div className="mt-3 space-y-1.5">
            <p className={`text-[11px] font-medium ${PLATFORM_TEXT_COLORS[platformSlug] || 'text-emerald-400'} flex items-center gap-1`}>
              <ExternalLink className="h-3 w-3" />
              {t('products.availableOn', { platform: platformName })}
            </p>
            <Button
              onClick={handleShopOnPlatform}
              className={`w-full transition-all duration-300 text-stone-950 font-semibold gap-2 ${PLATFORM_BUTTON_COLORS[platformSlug] || 'bg-emerald-600 hover:bg-emerald-500'}`}
              size="sm"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {t('products.shopOn', { platform: platformName })}
            </Button>
          </div>
        ) : product.source === 'shopify' ? (
          <Button
            onClick={handleAddToCart}
            disabled={product.stock === 0}
            className={`mt-3 w-full transition-all duration-300 ${
              isAdding
                ? 'bg-emerald-600 text-white scale-95'
                : 'bg-emerald-700 text-white hover:bg-emerald-600'
            }`}
            size="sm"
          >
            <ShoppingBag className="mr-1.5 h-3.5 w-3.5" />
            {isAdding ? 'Added!' : product.stock === 0 ? t('common.soldOut') : 'Add to Cart'}
          </Button>
        ) : (
          <Button
            onClick={handleAddToCart}
            disabled={product.stock === 0}
            className={`mt-3 w-full transition-all duration-300 ${
              isAdding
                ? 'bg-emerald-600 text-white scale-95'
                : 'bg-amber-600 text-stone-950 hover:bg-amber-500'
            }`}
            size="sm"
          >
            <ShoppingCart className="mr-1.5 h-3.5 w-3.5" />
            {isAdding ? t('common.added') : product.stock === 0 ? t('common.soldOut') : t('common.addToCart')}
          </Button>
        )}
      </div>
    </motion.div>
  );
}
