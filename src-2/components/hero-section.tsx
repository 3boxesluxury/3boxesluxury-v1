'use client';

import { useStore } from '@/lib/store';
import { Button } from '@/components/ui/button';
import { motion } from 'framer-motion';
import Image from 'next/image';
import { useMemo } from 'react';
import { Gift, Sparkles } from 'lucide-react';
import { useTranslation } from '@/hooks/useTranslation';

export function HeroSection() {
  const { setView, setCategory, toggleGiftBuilder } = useStore();
  const { t } = useTranslation();

  // Generate stable golden particles configuration
  const particles = useMemo(() => [
    { left: '8%', bottom: '5%', size: 4, duration: 8, delay: 0, color: 'rgba(212,164,55,0.7)' },
    { left: '15%', bottom: '10%', size: 3, duration: 10, delay: 1.5, color: 'rgba(245,230,163,0.5)' },
    { left: '25%', bottom: '2%', size: 5, duration: 7, delay: 0.8, color: 'rgba(212,164,55,0.6)' },
    { left: '35%', bottom: '8%', size: 3, duration: 9, delay: 2, color: 'rgba(245,230,163,0.4)' },
    { left: '45%', bottom: '3%', size: 4, duration: 11, delay: 0.5, color: 'rgba(212,164,55,0.7)' },
    { left: '55%', bottom: '12%', size: 6, duration: 8, delay: 3, color: 'rgba(245,230,163,0.6)' },
    { left: '62%', bottom: '5%', size: 3, duration: 10, delay: 1, color: 'rgba(212,164,55,0.5)' },
    { left: '72%', bottom: '8%', size: 5, duration: 7, delay: 2.5, color: 'rgba(245,230,163,0.7)' },
    { left: '80%', bottom: '3%', size: 4, duration: 9, delay: 0.3, color: 'rgba(212,164,55,0.6)' },
    { left: '90%', bottom: '10%', size: 3, duration: 11, delay: 1.8, color: 'rgba(245,230,163,0.5)' },
    { left: '18%', bottom: '15%', size: 2, duration: 12, delay: 4, color: 'rgba(212,164,55,0.4)' },
    { left: '50%', bottom: '1%', size: 4, duration: 8, delay: 3.5, color: 'rgba(245,230,163,0.6)' },
    { left: '68%', bottom: '6%', size: 3, duration: 10, delay: 2.2, color: 'rgba(212,164,55,0.5)' },
    { left: '42%', bottom: '18%', size: 2, duration: 9, delay: 5, color: 'rgba(245,230,163,0.3)' },
    { left: '88%', bottom: '7%', size: 5, duration: 7, delay: 0.7, color: 'rgba(212,164,55,0.6)' },
  ], []);

  // Generate bokeh lights for the background
  const bokehLights = useMemo(() => [
    { left: '20%', top: '30%', size: 60, duration: 6, delay: 0, color: 'rgba(212,164,55,0.08)' },
    { left: '70%', top: '20%', size: 80, duration: 8, delay: 2, color: 'rgba(245,230,163,0.06)' },
    { left: '50%', top: '60%', size: 50, duration: 7, delay: 1, color: 'rgba(212,164,55,0.07)' },
    { left: '85%', top: '50%', size: 70, duration: 9, delay: 3, color: 'rgba(245,230,163,0.05)' },
    { left: '10%', top: '70%', size: 45, duration: 8, delay: 4, color: 'rgba(212,164,55,0.06)' },
    { left: '40%', top: '15%', size: 55, duration: 6, delay: 1.5, color: 'rgba(245,230,163,0.07)' },
    { left: '60%', top: '80%', size: 65, duration: 10, delay: 2.5, color: 'rgba(212,164,55,0.05)' },
    { left: '30%', top: '45%', size: 40, duration: 7, delay: 0.5, color: 'rgba(245,230,163,0.08)' },
  ], []);

  return (
    <section className="relative overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0">
        <Image
          src="/images/hero.png"
          alt="Luxury background"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-stone-950/90 via-stone-950/70 to-stone-950/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-stone-950 via-transparent to-transparent" />
      </div>

      {/* Golden Bokeh Lights on background */}
      <div className="absolute inset-0 pointer-events-none">
        {bokehLights.map((b, i) => (
          <div
            key={`bokeh-${i}`}
            className="bokeh-light"
            style={{
              left: b.left,
              top: b.top,
              width: `${b.size}px`,
              height: `${b.size}px`,
              background: `radial-gradient(circle, ${b.color}, transparent 70%)`,
              animationDuration: `${b.duration}s`,
              animationDelay: `${b.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Golden Light Rays */}
      <div className="golden-rays">
        {[15, 25, 38, 52, 65, 78, 88].map((left, i) => (
          <div
            key={`ray-${i}`}
            className="golden-ray"
            style={{
              left: `${left}%`,
              height: `${60 + i * 8}%`,
              top: '20%',
              animationDelay: `${i * 0.6}s`,
              animationDuration: `${3 + i * 0.5}s`,
              width: i % 2 === 0 ? '2px' : '1px',
              background: `linear-gradient(to top, transparent, rgba(212, 164, 55, ${0.08 + i * 0.02}), transparent)`,
            }}
          />
        ))}
      </div>

      {/* Floating Golden Particles */}
      <div className="absolute inset-0 pointer-events-none">
        {particles.map((p, i) => (
          <div
            key={`particle-${i}`}
            className="golden-particle"
            style={{
              left: p.left,
              bottom: p.bottom,
              width: `${p.size}px`,
              height: `${p.size}px`,
              backgroundColor: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
            }}
          />
        ))}
      </div>

      {/* Content */}
      <div className="relative container mx-auto px-4 py-20 sm:py-28 lg:py-36">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="max-w-2xl"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1, duration: 0.8, type: 'spring', stiffness: 100 }}
            className="mb-8"
          >
            <div className="logo-flashy inline-block">
              <Image
                src="/images/logo.png"
                alt="3 Boxes Luxury Logo"
                width={140}
                height={140}
                className="h-28 w-auto sm:h-32 lg:h-36"
                priority
              />
            </div>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-sm font-medium uppercase tracking-[0.3em] text-amber-400/80"
          >
            {t('hero.curatedLuxury')}
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl lg:text-6xl"
          >
            <span className="luxury-text">3 BOXES</span>{' '}
            <span className="text-amber-50">LUXURY</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="mt-4 text-lg text-amber-100/70 sm:text-xl"
          >
            {t('hero.subtitle')}
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.8 }}
            className="mt-3 max-w-lg text-sm text-amber-200/50 sm:text-base"
          >
            Experience the finest selection of watches, jewelry, sarees, men&apos;s shirts &amp; t-shirts, leather goods, and more from the world&apos;s most prestigious makers.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9, duration: 0.8 }}
            className="mt-8 flex flex-wrap gap-4"
          >
            <Button
              onClick={() => {
                setCategory(null);
                setView('home');
              }}
              size="lg"
              className="bg-amber-600 text-stone-950 hover:bg-amber-500 transition-all duration-300 hover:shadow-lg hover:shadow-amber-600/25"
            >
              {t('hero.shopNow')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => {
                setCategory(null);
                setView('home');
              }}
              className="border-amber-700/50 text-amber-200 hover:bg-amber-900/20 hover:text-amber-100"
            >
              {t('hero.exploreCollection')}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={toggleGiftBuilder}
              className="border-amber-500/50 bg-amber-600/10 text-amber-300 hover:bg-amber-600/20 hover:text-amber-100 hover:border-amber-500/60 gap-2"
            >
              <Gift className="h-4 w-4" />
              {t('hero.giftBuilder')}
              <Sparkles className="h-3 w-3 text-amber-400/70" />
            </Button>
          </motion.div>
        </motion.div>
      </div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-[var(--background)] to-transparent" />
    </section>
  );
}
