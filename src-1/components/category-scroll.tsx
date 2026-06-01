'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { motion } from 'framer-motion';
import {
  Gem, Watch, Briefcase, Flower2, Shirt,
  Ribbon, ToyBrick, Heart, HeartHandshake,
  ChevronLeft, ChevronRight, Sparkles, Users, User,
} from 'lucide-react';

// Hardcoded quick filter items — no API dependency
const QUICK_FILTERS = [
  { key: 'couple', label: 'Couple', icon: <HeartHandshake className="h-5 w-5" />, bg: 'from-fuchsia-900/40 to-stone-900/60' },
  { key: 'men', label: 'Men', icon: <User className="h-5 w-5" />, bg: 'from-blue-900/40 to-stone-900/60' },
  { key: 'women', label: 'Women', icon: <Users className="h-5 w-5" />, bg: 'from-pink-900/40 to-stone-900/60' },
  { key: 'kids', label: 'Kids', icon: <Gem className="h-5 w-5" />, bg: 'from-cyan-900/40 to-stone-900/60' },
  { key: 'home', label: 'Home', icon: <Heart className="h-5 w-5" />, bg: 'from-orange-900/40 to-stone-900/60' },
  { key: 'office', label: 'Office', icon: <Briefcase className="h-5 w-5" />, bg: 'from-stone-700/60 to-stone-900/60' },
  { key: 'new-arrivals', label: 'New Arrivals', icon: <Sparkles className="h-5 w-5" />, bg: 'from-amber-900/40 to-stone-900/60' },
  { key: 'watches', label: 'Watches', icon: <Watch className="h-5 w-5" />, bg: 'from-amber-900/40 to-stone-900/60' },
  { key: 'jewelry', label: 'Jewelry', icon: <Gem className="h-5 w-5" />, bg: 'from-rose-900/30 to-stone-900/60' },
  { key: 'fragrances', label: 'Fragrances', icon: <Flower2 className="h-5 w-5" />, bg: 'from-purple-900/30 to-stone-900/60' },
  { key: 'fashion', label: 'Fashion', icon: <Shirt className="h-5 w-5" />, bg: 'from-emerald-900/30 to-stone-900/60' },
  { key: 'leather', label: 'Leather', icon: <Briefcase className="h-5 w-5" />, bg: 'from-yellow-900/30 to-stone-900/60' },
  { key: 'sarees', label: 'Sarees', icon: <Ribbon className="h-5 w-5" />, bg: 'from-pink-900/30 to-stone-900/60' },
  { key: 'toys', label: 'Toys', icon: <ToyBrick className="h-5 w-5" />, bg: 'from-cyan-900/30 to-stone-900/60' },
  { key: 'romantic', label: 'Romantic Gifts', icon: <Heart className="h-5 w-5" />, bg: 'from-red-900/30 to-stone-900/60' },
];

// Map filter keys to category slugs
const FILTER_SLUGS: Record<string, string> = {
  'couple': 'couple-gifts',
  'men': 'mens-shirts',
  'women': 'sarees',
  'kids': 'toys',
  'home': 'home-living',
  'office': 'leather-goods',
  'new-arrivals': 'fashion',
  'watches': 'watches',
  'jewelry': 'jewelry',
  'fragrances': 'fragrances',
  'fashion': 'fashion',
  'leather': 'leather-goods',
  'sarees': 'sarees',
  'toys': 'toys',
  'romantic': 'romantic-gifts',
};

export function CategoryScroll() {
  const setCategory = useStore((s) => s.setCategory);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 5);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Initial check after a small delay for DOM to settle
    const timer = setTimeout(checkScroll, 200);
    el.addEventListener('scroll', checkScroll, { passive: true });
    window.addEventListener('resize', checkScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [checkScroll]);

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({
      left: direction === 'left' ? -300 : 300,
      behavior: 'smooth',
    });
  };

  return (
    <div className="w-full py-4" style={{ minHeight: '100px' }}>
      {/* Section Label */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400/80">
          Quick Filters
        </h3>
        <div className="flex gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-900/30 bg-stone-900/80 text-amber-400 transition-all hover:bg-stone-800 hover:border-amber-600/50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Scroll left"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-amber-900/30 bg-stone-900/80 text-amber-400 transition-all hover:bg-stone-800 hover:border-amber-600/50 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Scroll right"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Scrollable Row */}
      <div className="relative">
        {/* Left fade */}
        {canScrollLeft && (
          <div className="pointer-events-none absolute left-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-r from-stone-950 to-transparent" />
        )}
        {/* Right fade */}
        {canScrollRight && (
          <div className="pointer-events-none absolute right-0 top-0 bottom-0 z-10 w-12 bg-gradient-to-l from-stone-950 to-transparent" />
        )}

        <div
          ref={scrollRef}
          className="flex gap-3 overflow-x-auto py-2 px-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {QUICK_FILTERS.map((item, i) => (
            <motion.button
              key={item.key}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03, duration: 0.3 }}
              onClick={() => {
                const slug = FILTER_SLUGS[item.key];
                if (slug) setCategory(slug);
              }}
              className={`group flex-shrink-0 flex flex-col items-center justify-center rounded-xl border border-amber-900/20 bg-gradient-to-br ${item.bg} px-4 py-3 transition-all duration-200 hover:border-amber-500/50 hover:shadow-lg hover:shadow-amber-900/20 hover:scale-105 cursor-pointer`}
              style={{ minWidth: '100px' }}
            >
              <div className="mb-1.5 text-amber-400/70 group-hover:text-amber-300 transition-colors">
                {item.icon}
              </div>
              <span className="text-[11px] font-semibold text-amber-100/90 whitespace-nowrap">
                {item.label}
              </span>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  );
}
