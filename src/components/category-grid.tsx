'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  Gem, Watch, Briefcase, Flower2, Shirt, Home,
  Ribbon, ToyBrick, Heart, HeartHandshake,
  ChevronLeft, ChevronRight, Sparkles, Users, User,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useTranslation } from '@/hooks/useTranslation';

interface Category {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  image: string | null;
  productCount: number;
  newProductCount?: number;
}

/* ── Category Grid icons & colors ── */
const categoryIcons: Record<string, React.ReactNode> = {
  watches: <Watch className="h-6 w-6" />,
  jewelry: <Gem className="h-6 w-6" />,
  'leather-goods': <Briefcase className="h-6 w-6" />,
  fragrances: <Flower2 className="h-6 w-6" />,
  fashion: <Shirt className="h-6 w-6" />,
  'home-living': <Home className="h-6 w-6" />,
  sarees: <Ribbon className="h-6 w-6" />,
  toys: <ToyBrick className="h-6 w-6" />,
  'romantic-gifts': <Heart className="h-6 w-6" />,
  'couple-gifts': <HeartHandshake className="h-6 w-6" />,
  'mens-shirts': <Shirt className="h-6 w-6" />,
};

const categoryBgColors: Record<string, string> = {
  watches: 'rgba(120,53,15,0.65)',
  jewelry: 'rgba(136,19,55,0.65)',
  'leather-goods': 'rgba(113,63,18,0.65)',
  fragrances: 'rgba(88,28,135,0.65)',
  fashion: 'rgba(6,78,59,0.65)',
  'home-living': 'rgba(124,45,18,0.65)',
  sarees: 'rgba(131,24,67,0.65)',
  toys: 'rgba(22,78,99,0.65)',
  'romantic-gifts': 'rgba(153,27,27,0.65)',
  'couple-gifts': 'rgba(112,26,117,0.65)',
  'mens-shirts': 'rgba(49,46,129,0.65)',
};

/* ── Horizontal Scroll Bar items (Parent Categories) ── */
const SCROLL_ITEMS = [
  { key: 'couple', label: 'Couple', icon: <HeartHandshake className="h-5 w-5" />, bg: 'from-fuchsia-900/40 to-stone-900/60' },
  { key: 'men', label: 'Men', icon: <User className="h-5 w-5" />, bg: 'from-blue-900/40 to-stone-900/60' },
  { key: 'women', label: 'Women', icon: <Users className="h-5 w-5" />, bg: 'from-pink-900/40 to-stone-900/60' },
  { key: 'kids', label: 'Kids', icon: <Gem className="h-5 w-5" />, bg: 'from-cyan-900/40 to-stone-900/60' },
  { key: 'home', label: 'Home', icon: <Home className="h-5 w-5" />, bg: 'from-orange-900/40 to-stone-900/60' },
  { key: 'office', label: 'Office', icon: <Briefcase className="h-5 w-5" />, bg: 'from-stone-700/60 to-stone-900/60' },
  { key: 'new-arrivals', label: 'New Arrivals', icon: <Sparkles className="h-5 w-5" />, bg: 'from-amber-900/40 to-stone-900/60' },
];

/* ── Sub-Category Mapping: Parent → Sub-category slugs ── */
const SUB_CATEGORY_MAP: Record<string, string[]> = {
  couple: ['couple-gifts', 'romantic-gifts', 'fragrances', 'jewelry', 'watches'],
  men: ['mens-shirts', 'fragrances', 'leather-goods', 'watches', 'jewelry'],
  women: ['sarees', 'fragrances', 'jewelry', 'watches', 'fashion'],
  kids: ['toys', 'fashion', 'home-living'],
  home: ['home-living', 'fragrances', 'leather-goods', 'fashion'],
  office: ['leather-goods', 'watches', 'fashion', 'home-living'],
  // 'new-arrivals' is handled dynamically — fetched from API
};

/* ── The main component ── */
export function CategoryGrid() {
  const { setCategory, selectedParentCategory, setParentCategory } = useStore();
  const { t } = useTranslation();
  const mainScrollRef = useRef<HTMLDivElement>(null);
  const [mainCanScrollLeft, setMainCanScrollLeft] = useState(false);
  const [mainCanScrollRight, setMainCanScrollRight] = useState(true);
  const subScrollRef = useRef<HTMLDivElement>(null);
  const [subCanScrollLeft, setSubCanScrollLeft] = useState(false);
  const [subCanScrollRight, setSubCanScrollRight] = useState(true);

  // Fetch all categories (normal)
  const { data: allData, isLoading } = useQuery<{ categories: Category[] }>({
    queryKey: ['categories'],
    queryFn: () => fetch('/api/categories').then((r) => r.json()),
  });

  // Fetch new-arrival categories (only categories with recent products)
  const { data: newData } = useQuery<{ categories: Category[] }>({
    queryKey: ['categories', 'new-arrivals'],
    queryFn: () => fetch('/api/categories?newArrivals=true').then((r) => r.json()),
    enabled: selectedParentCategory === 'new-arrivals',
  });

  const allCategories = allData?.categories ?? [];
  const newArrivalCategories = newData?.categories ?? [];

  // Determine which categories to show in the sub-category section
  const getFilteredCategories = (): Category[] => {
    if (!selectedParentCategory) return [];
    if (selectedParentCategory === 'new-arrivals') return newArrivalCategories;
    const allowedSlugs = SUB_CATEGORY_MAP[selectedParentCategory] || [];
    return allCategories.filter((cat) => allowedSlugs.includes(cat.slug));
  };

  const filteredCategories = getFilteredCategories();

  /* ── Main scroll state checker ── */
  const checkMainScroll = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    setMainCanScrollLeft(el.scrollLeft > 5);
    setMainCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    const timer = setTimeout(checkMainScroll, 300);
    el.addEventListener('scroll', checkMainScroll, { passive: true });
    window.addEventListener('resize', checkMainScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', checkMainScroll);
      window.removeEventListener('resize', checkMainScroll);
    };
  }, [checkMainScroll]);

  const doMainScroll = (dir: 'left' | 'right') => {
    const el = mainScrollRef.current;
    if (!el) return;
    const itemWidth = el.clientWidth / 5;
    el.scrollBy({ left: dir === 'left' ? -itemWidth : itemWidth, behavior: 'smooth' });
  };

  /* ── Sub scroll state checker ── */
  const checkSubScroll = useCallback(() => {
    const el = subScrollRef.current;
    if (!el) return;
    setSubCanScrollLeft(el.scrollLeft > 5);
    setSubCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
  }, []);

  useEffect(() => {
    const el = subScrollRef.current;
    if (!el) return;
    const timer = setTimeout(checkSubScroll, 300);
    el.addEventListener('scroll', checkSubScroll, { passive: true });
    window.addEventListener('resize', checkSubScroll);
    return () => {
      clearTimeout(timer);
      el.removeEventListener('scroll', checkSubScroll);
      window.removeEventListener('resize', checkSubScroll);
    };
  }, [checkSubScroll, filteredCategories]);

  const doSubScroll = (dir: 'left' | 'right') => {
    const el = subScrollRef.current;
    if (!el) return;
    // Scroll by 1 item width (4 items visible, so each item = 25% of width)
    const itemWidth = el.clientWidth / 4;
    el.scrollBy({ left: dir === 'left' ? -itemWidth : itemWidth, behavior: 'smooth' });
  };

  // Handle scroll bar click — select/deselect parent category
  const handleParentClick = (key: string) => {
    if (selectedParentCategory === key) {
      setParentCategory(null);
    } else {
      setParentCategory(key);
    }
  };

  const arrowStyle = (canScroll: boolean): React.CSSProperties => ({
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    border: canScroll ? '2px solid rgba(217,119,6,0.8)' : '2px solid rgba(180,83,9,0.4)',
    backgroundColor: canScroll ? 'rgba(180,83,9,0.35)' : 'rgba(28,25,23,0.6)',
    color: canScroll ? '#fbbf24' : 'rgba(180,140,60,0.5)',
    cursor: canScroll ? 'pointer' : 'default',
    transition: 'all 0.2s',
    boxShadow: canScroll ? '0 2px 12px rgba(217,119,6,0.3)' : '0 1px 4px rgba(0,0,0,0.2)',
  });

  /* Loading skeleton */
  if (isLoading) {
    return (
      <section className="py-12">
        <h2 className="mb-8 text-center text-2xl font-bold text-amber-100 sm:text-3xl">
          {t('categories.title')}
        </h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg bg-stone-900/50" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="py-12">
      {/* Hide scrollbars for both scroll bars */}
      <style>{`.main-category-scroll::-webkit-scrollbar, .sub-category-scroll::-webkit-scrollbar { display: none; }`}</style>

      {/* ═══════ SHOP BY CATEGORY HEADING ═══════ */}
      <h2 className="mb-8 text-center text-2xl font-bold text-amber-100 sm:text-3xl">
        {t('categories.title')}
      </h2>

      {/* ═══════ MAIN HORIZONTAL SCROLL BAR (5 items visible) ═══════ */}
      <div style={{
        marginBottom: '32px',
        background: 'linear-gradient(180deg, rgba(28,25,23,0.4) 0%, rgba(28,25,23,0.2) 100%)',
        borderRadius: '16px',
        padding: '12px 4px',
        border: '1px solid rgba(180,83,9,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>

          {/* Left Arrow */}
          <button
            onClick={() => { if (mainCanScrollLeft) doMainScroll('left'); }}
            style={arrowStyle(mainCanScrollLeft)}
          >
            <ChevronLeft style={{ width: '18px', height: '18px' }} />
          </button>

          {/* Scrollable items */}
          <div
            ref={mainScrollRef}
            className="main-category-scroll"
            style={{
              display: 'flex',
              gap: '10px',
              overflowX: 'auto',
              overflowY: 'hidden',
              padding: '4px 0',
              flex: 1,
              scrollBehavior: 'smooth',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {SCROLL_ITEMS.map((item) => {
              const bgMap: Record<string, string> = {
                'fuchsia': 'rgba(112,26,117,0.65)',
                'blue': 'rgba(30,58,138,0.65)',
                'pink': 'rgba(131,24,67,0.65)',
                'cyan': 'rgba(22,78,99,0.65)',
                'orange': 'rgba(124,45,18,0.65)',
                'stone': 'rgba(68,64,60,0.75)',
                'amber': 'rgba(120,53,15,0.65)',
              };
              const bgColor = bgMap[item.bg.split('-')[1]] || 'rgba(120,53,15,0.4)';
              const isActive = selectedParentCategory === item.key;

              return (
                <button
                  key={item.key}
                  onClick={() => handleParentClick(item.key)}
                  style={{
                    flexShrink: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 'calc(20% - 8px)',
                    height: '140px',
                    padding: '16px 8px',
                    borderRadius: '12px',
                    border: isActive
                      ? '2px solid rgba(251,191,36,0.9)'
                      : '1.5px solid rgba(180,83,9,0.4)',
                    background: isActive
                      ? `linear-gradient(135deg, ${bgColor.replace('0.65', '0.85')}, rgba(28,25,23,0.7))`
                      : `linear-gradient(135deg, ${bgColor}, rgba(28,25,23,0.5))`,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive
                      ? '0 4px 20px rgba(251,191,36,0.3), inset 0 1px 0 rgba(251,191,36,0.2)'
                      : '0 2px 8px rgba(0,0,0,0.2)',
                    transform: isActive ? 'scale(1.05)' : 'scale(1)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(217,119,6,0.7)';
                      e.currentTarget.style.transform = 'scale(1.05)';
                      e.currentTarget.style.boxShadow = '0 4px 16px rgba(217,119,6,0.2)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.borderColor = 'rgba(180,83,9,0.4)';
                      e.currentTarget.style.transform = 'scale(1)';
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                    }
                  }}
                >
                  <div style={{
                    marginBottom: '8px',
                    color: isActive ? 'rgba(251,191,36,1)' : 'rgba(251,191,36,0.85)',
                    transition: 'color 0.2s',
                  }}>
                    {item.icon}
                  </div>
                  <span style={{
                    fontSize: '12px',
                    fontWeight: isActive ? 700 : 600,
                    color: isActive ? 'rgba(251,191,36,1)' : 'rgba(254,243,199,0.95)',
                    whiteSpace: 'nowrap',
                    textAlign: 'center',
                    transition: 'color 0.2s',
                  }}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Right Arrow */}
          <button
            onClick={() => { if (mainCanScrollRight) doMainScroll('right'); }}
            style={arrowStyle(mainCanScrollRight)}
          >
            <ChevronRight style={{ width: '18px', height: '18px' }} />
          </button>

        </div>
      </div>

      {/* ═══════ SHOP BY SUB CATEGORY SCROLL BAR (exactly 4 items visible, no half items) ═══════ */}
      {selectedParentCategory && filteredCategories.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          style={{
            marginBottom: '32px',
            background: 'linear-gradient(180deg, rgba(28,25,23,0.4) 0%, rgba(28,25,23,0.2) 100%)',
            borderRadius: '16px',
            padding: '12px 4px',
            border: '1px solid rgba(180,83,9,0.15)',
          }}
        >
          <h2 className="mb-8 text-center text-2xl font-bold text-amber-100 sm:text-3xl">
            {t('categories.subTitle')}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px' }}>

            {/* Left Arrow */}
            <button
              onClick={() => { if (subCanScrollLeft) doSubScroll('left'); }}
              style={arrowStyle(subCanScrollLeft)}
            >
              <ChevronLeft style={{ width: '18px', height: '18px' }} />
            </button>

            {/* Scrollable sub-category items — exactly 4 items visible, rest completely hidden */}
            <div
              style={{
                width: '80%',
                maxWidth: '840px',
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <div
                ref={subScrollRef}
                className="sub-category-scroll"
                style={{
                  display: 'flex',
                  gap: '12px',
                  overflowX: 'auto',
                  overflowY: 'hidden',
                  padding: '4px 0',
                  scrollBehavior: 'smooth',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {filteredCategories.map((cat, i) => {
                  const bgColor = categoryBgColors[cat.slug] || 'rgba(120,53,15,0.65)';

                  return (
                    <motion.button
                      key={cat.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      onClick={() => setCategory(cat.slug)}
                      style={{
                        flexShrink: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        // Each item = exactly 25% of the container width minus gap
                        width: 'calc(25% - 9px)',
                        height: '140px',
                        padding: '16px 8px',
                        borderRadius: '12px',
                        border: '1.5px solid rgba(180,83,9,0.4)',
                        background: `linear-gradient(135deg, ${bgColor}, rgba(28,25,23,0.5))`,
                        cursor: 'pointer',
                        transition: 'all 0.3s',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(217,119,6,0.7)';
                        e.currentTarget.style.transform = 'scale(1.05)';
                        e.currentTarget.style.boxShadow = '0 4px 16px rgba(217,119,6,0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(180,83,9,0.4)';
                        e.currentTarget.style.transform = 'scale(1)';
                        e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
                      }}
                    >
                      <div style={{ marginBottom: '8px', color: 'rgba(251,191,36,0.85)', transition: 'color 0.2s' }}>
                        {categoryIcons[cat.slug] || <Gem className="h-6 w-6" />}
                      </div>
                      <span style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        color: 'rgba(254,243,199,0.95)',
                        whiteSpace: 'nowrap',
                        textAlign: 'center',
                      }}>
                        {cat.name}
                      </span>
                      <span style={{
                        fontSize: '10px',
                        color: 'rgba(254,243,199,0.6)',
                        marginTop: '4px',
                      }}>
                        {selectedParentCategory === 'new-arrivals' && cat.newProductCount
                          ? `${cat.newProductCount} new`
                          : `${cat.productCount} ${t('categories.items')}`}
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            {/* Right Arrow */}
            <button
              onClick={() => { if (subCanScrollRight) doSubScroll('right'); }}
              style={arrowStyle(subCanScrollRight)}
            >
              <ChevronRight style={{ width: '18px', height: '18px' }} />
            </button>

          </div>
        </motion.div>
      )}
    </section>
  );
}
