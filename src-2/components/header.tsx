'use client';

import { useStore } from '@/lib/store';
import { useTranslation } from '@/hooks/useTranslation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { Search, ShoppingCart, Package, Menu, X, LogIn, LogOut, User, Shield, Gift, Sparkles, Smartphone, Download } from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { LocaleSwitcher, LocaleSwitcherMobile } from '@/components/locale-switcher';

export function Header() {
  const { searchQuery, setSearch, setView, cartItems, setCategory, authUser, setAuthView, clearAuth, toggleGiftBuilder } = useStore();
  const { t } = useTranslation();
  const [localSearch, setLocalSearch] = useState(searchQuery);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const totalItems = cartItems.reduce((sum, item) => sum + item.quantity, 0);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setSearch(localSearch);
      setCategory(null);
      setView('home');
    },
    [localSearch, setSearch, setCategory, setView]
  );

  useEffect(() => {
    setLocalSearch(searchQuery);
  }, [searchQuery]);

  const handleDashboard = () => {
    if (!authUser) return;
    switch (authUser.role) {
      case 'admin': setView('admin-dashboard'); break;
      case 'user': setView('user-dashboard'); break;
      case 'agent': setView('agent-dashboard'); break;
      case 'team': setView('team-dashboard'); break;
      case 'corporate': setView('corporate-dashboard'); break;
    }
  };

  const roleBadge: Record<string, string> = {
    admin: 'bg-red-600/20 text-red-400 border-red-600/30',
    user: 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30',
    agent: 'bg-blue-600/20 text-blue-400 border-blue-600/30',
    team: 'bg-purple-600/20 text-purple-400 border-purple-600/30',
    corporate: 'bg-amber-600/20 text-amber-400 border-amber-600/30',
  };

  return (
    <header className="sticky top-0 z-50 w-full border-b border-amber-900/30 bg-stone-950/95 backdrop-blur-md">
      <div className="container mx-auto px-4">
        <div className="flex h-20 items-center justify-between gap-4">
          {/* Logo */}
          <button
            onClick={() => {
              setView('home');
              setSearch('');
              setLocalSearch('');
              setCategory(null);
            }}
            className="flex-shrink-0 flex items-center gap-3 group"
          >
            <div className="logo-flashy">
              <Image
                src="/images/logo.png"
                alt="3 Boxes Luxury Logo"
                width={72}
                height={72}
                className="h-18 w-auto sm:h-20"
                priority
              />
            </div>
            <h1 className="gold-shimmer text-2xl font-bold tracking-widest sm:text-3xl hidden sm:block">
              3 BOXES LUXURY
            </h1>
          </button>

          {/* Search Bar - Desktop */}
          <form onSubmit={handleSearch} className="hidden flex-1 max-w-xl md:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600/60" />
              <Input
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder={t('common.searchPlaceholder')}
                className="w-full border-amber-900/40 bg-stone-900/50 pl-10 text-amber-50 placeholder:text-amber-200/30 focus:border-amber-600/60 focus:ring-amber-600/30"
              />
              {localSearch && (
                <button
                  type="button"
                  onClick={() => {
                    setLocalSearch('');
                    setSearch('');
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-amber-200/40 hover:text-amber-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {/* Get App Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open('/?XTransformPort=3002', '_blank')}
              className="hidden lg:flex items-center gap-1.5 border-amber-500/40 bg-amber-600/10 text-amber-300 hover:bg-amber-600/20 hover:text-amber-200 hover:border-amber-500/60"
            >
              <Smartphone className="h-4 w-4" />
              <span className="text-xs font-medium">Get App</span>
            </Button>

            {/* Locale Switcher (Desktop) */}
            <LocaleSwitcher />

            {/* Orders */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView('orders')}
              className="text-amber-200/70 hover:bg-amber-900/20 hover:text-amber-400"
              aria-label={t('common.orders')}
            >
              <Package className="h-5 w-5" />
            </Button>

            {/* Gift Builder */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleGiftBuilder}
              className="hidden sm:flex items-center gap-1.5 text-amber-300/80 hover:bg-amber-900/20 hover:text-amber-300 border border-amber-600/30 hover:border-amber-500/50"
            >
              <Gift className="h-4 w-4" />
              <span className="text-xs font-medium">{t('nav.giftBuilder')}</span>
              <Sparkles className="h-3 w-3 text-amber-400/60" />
            </Button>

            {/* Login / Profile */}
            {authUser ? (
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleDashboard}
                  className="hidden sm:flex items-center gap-2 text-amber-200/70 hover:bg-amber-900/20 hover:text-amber-400"
                >
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber-600/20 text-xs font-bold text-amber-400">
                    {authUser.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="max-w-24 truncate text-sm">{authUser.name}</span>
                  <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium border ${roleBadge[authUser.role] || ''}`}>
                    {authUser.role}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleDashboard}
                  className="sm:hidden text-amber-200/70 hover:bg-amber-900/20 hover:text-amber-400"
                  aria-label={t('common.myDashboard')}
                >
                  <Shield className="h-5 w-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => { clearAuth(); setView('home') }}
                  className="text-amber-200/40 hover:bg-red-900/20 hover:text-red-400"
                  aria-label={t('common.signOut')}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="default"
                onClick={() => setAuthView('login')}
                className="border-amber-600/50 bg-amber-900/20 text-amber-300 hover:bg-amber-600/30 hover:text-amber-100 hover:border-amber-500/60 gap-2 px-4 py-2 font-medium shadow-sm shadow-amber-900/20"
                aria-label={t('common.signIn')}
              >
                <LogIn className="h-5 w-5" />
                <span className="text-sm">{t('common.signIn')}</span>
              </Button>
            )}

            {/* Cart */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setView('cart')}
              className="relative text-amber-200/70 hover:bg-amber-900/20 hover:text-amber-400"
              aria-label={t('common.viewCart')}
            >
              <ShoppingCart className="h-5 w-5" />
              <AnimatePresence>
                {totalItems > 0 && (
                  <motion.span
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0 }}
                    className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-amber-600 text-[10px] font-bold text-stone-950"
                  >
                    {totalItems}
                  </motion.span>
                )}
              </AnimatePresence>
            </Button>

            {/* Mobile Menu */}
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-amber-200/70 hover:bg-amber-900/20 hover:text-amber-400 md:hidden"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="border-amber-900/30 bg-stone-950">
                <SheetTitle className="flex items-center gap-2">
                  <div className="logo-flashy">
                    <Image
                      src="/images/logo.png"
                      alt="3 Boxes Luxury Logo"
                      width={52}
                      height={52}
                      className="h-13 w-auto"
                    />
                  </div>
                  <span className="gold-shimmer text-lg font-bold tracking-widest">
                    3 BOXES LUXURY
                  </span>
                </SheetTitle>
                <div className="mt-8 flex flex-col gap-4">
                  <form onSubmit={handleSearch} className="md:hidden">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-amber-600/60" />
                      <Input
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                        placeholder={t('common.searchPlaceholder')}
                        className="w-full border-amber-900/40 bg-stone-900/50 pl-10 text-amber-50 placeholder:text-amber-200/30"
                      />
                    </div>
                  </form>
                  <button
                    onClick={() => {
                      setView('home');
                      setSearch('');
                      setLocalSearch('');
                      setCategory(null);
                      setMobileMenuOpen(false);
                    }}
                    className="rounded-md px-4 py-2 text-left text-amber-200/80 transition-colors hover:bg-amber-900/20 hover:text-amber-400"
                  >
                    {t('nav.home')}
                  </button>
                  {authUser ? (
                    <>
                      <button
                        onClick={() => {
                          handleDashboard();
                          setMobileMenuOpen(false);
                        }}
                        className="rounded-md px-4 py-2 text-left text-amber-200/80 transition-colors hover:bg-amber-900/20 hover:text-amber-400"
                      >
                        <span className="flex items-center gap-2">
                          <User className="h-4 w-4" />
                          {t('common.myDashboard')} ({authUser.role})
                        </span>
                      </button>
                      <button
                        onClick={() => {
                          clearAuth();
                          setView('home');
                          setMobileMenuOpen(false);
                        }}
                        className="rounded-md px-4 py-2 text-left text-red-400/80 transition-colors hover:bg-red-900/20 hover:text-red-400"
                      >
                        <span className="flex items-center gap-2">
                          <LogOut className="h-4 w-4" />
                          {t('common.signOut')}
                        </span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setAuthView('login');
                        setMobileMenuOpen(false);
                      }}
                      className="rounded-md px-4 py-3 text-left text-amber-100 font-medium transition-colors bg-amber-600/20 border border-amber-600/40 hover:bg-amber-600/30"
                    >
                      <span className="flex items-center gap-2">
                        <LogIn className="h-5 w-5" />
                        {t('common.signIn')}
                      </span>
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setView('cart');
                      setMobileMenuOpen(false);
                    }}
                    className="rounded-md px-4 py-2 text-left text-amber-200/80 transition-colors hover:bg-amber-900/20 hover:text-amber-400"
                  >
                    {t('common.cart')} ({totalItems})
                  </button>
                  <button
                    onClick={() => {
                      setView('orders');
                      setMobileMenuOpen(false);
                    }}
                    className="rounded-md px-4 py-2 text-left text-amber-200/80 transition-colors hover:bg-amber-900/20 hover:text-amber-400"
                  >
                    {t('common.orders')}
                  </button>
                  <button
                    onClick={() => {
                      toggleGiftBuilder();
                      setMobileMenuOpen(false);
                    }}
                    className="rounded-md px-4 py-2 text-left text-amber-300/90 transition-colors hover:bg-amber-900/20 hover:text-amber-300 flex items-center gap-2"
                  >
                    <Gift className="h-4 w-4" />
                    {t('nav.giftBuilder')}
                    <Sparkles className="h-3 w-3 text-amber-400/60" />
                  </button>
                  <button
                    onClick={() => {
                      window.open('/?XTransformPort=3002', '_blank');
                      setMobileMenuOpen(false);
                    }}
                    className="rounded-md px-4 py-3 text-left text-amber-100 font-medium transition-colors bg-amber-600/10 border border-amber-500/30 hover:bg-amber-600/20 flex items-center gap-2"
                  >
                    <Smartphone className="h-5 w-5" />
                    Get the App
                    <Download className="h-3 w-3 text-amber-400/60" />
                  </button>

                  {/* Mobile Locale Switcher */}
                  <LocaleSwitcherMobile />
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </div>
    </header>
  );
}
