'use client';

import { useStore, type View } from '@/lib/store';
import { QueryProvider } from '@/lib/query-provider';
import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { HeroSection } from '@/components/hero-section';
import { CategoryGrid } from '@/components/category-grid';
import { ProductGrid } from '@/components/product-grid';
import { ProductDetail } from '@/components/product-detail';
import { CartView } from '@/components/cart-view';
import { CheckoutView } from '@/components/checkout-view';
import { OrderConfirmation } from '@/components/order-confirmation';
import { OrderHistory } from '@/components/order-history';
import { AuthDialog } from '@/components/auth-dialog';
import { AdminDashboard } from '@/components/admin-dashboard';
import { UserDashboard } from '@/components/user-dashboard';
import { AgentDashboard } from '@/components/agent-dashboard';
import { TeamDashboard } from '@/components/team-dashboard';
import { CorporateDashboard } from '@/components/corporate-dashboard';
import { GiftAssistant } from '@/components/gift-assistant';
import { GiftBuilder } from '@/components/gift-builder';
import { AppDownloadSection } from '@/components/app-download-section';
import { AppDownloadBanner } from '@/components/app-download-banner';
import { AnimatePresence, motion } from 'framer-motion';
import React, { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';

function AppContent() {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const selectedCategory = useStore((s) => s.selectedCategory);
  const searchQuery = useStore((s) => s.searchQuery);
  const homeTimestamp = useStore((s) => s.homeTimestamp);
  const searchParams = useSearchParams();

  // Handle Shopify checkout return — auto-navigate to order confirmation
  useEffect(() => {
    if (searchParams.get('checkout') === 'success') {
      setView('order-confirmation');
      // Clean up the URL without a full page reload
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        window.history.replaceState({}, '', url.pathname);
      }
    }
  }, [searchParams, setView]);

  // Scroll to top when view changes, category changes, or home is re-clicked (homeTimestamp)
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view, selectedCategory, homeTimestamp]);

  const renderView = () => {
    switch (view) {
      case 'home': {
        const showProducts = selectedCategory || searchQuery;
        return (
          <>
            <HeroSection />
            <CategoryGrid />
            {showProducts && <ProductGrid />}
            <AppDownloadSection />
          </>
        );
      }
      case 'product':
        return <ProductDetail />;
      case 'cart':
        return <CartView />;
      case 'checkout':
        return <CheckoutView />;
      case 'order-confirmation':
        return <OrderConfirmation />;
      case 'orders':
        return <OrderHistory />;
      case 'admin-dashboard':
        return <AdminDashboard />;
      case 'user-dashboard':
        return <UserDashboard />;
      case 'agent-dashboard':
        return <AgentDashboard />;
      case 'team-dashboard':
        return <TeamDashboard />;
      case 'corporate-dashboard':
        return <CorporateDashboard />;
      default: {
        const showProducts = selectedCategory || searchQuery;
        return (
          <>
            <HeroSection />
            <CategoryGrid />
            {showProducts && <ProductGrid />}
            <AppDownloadSection />
          </>
        );
      }
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-stone-950">
      <Header />
      <main className="flex-1">
        <div className="container mx-auto px-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={`${view}-${selectedCategory || 'none'}-${searchQuery || 'no-search'}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {renderView()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
      <Footer />
      <AuthDialog />
      <GiftBuilder />
      <GiftAssistant />
      <AppDownloadBanner />
    </div>
  );
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('App ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-stone-950 p-8 text-center">
          <h2 className="mb-4 text-2xl font-bold text-amber-100">Something went wrong!</h2>
          <p className="mb-4 max-w-md text-sm text-amber-200/60">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <pre className="mb-6 max-w-lg overflow-auto rounded-lg bg-stone-900 p-4 text-left text-xs text-red-300">
            {this.state.error?.stack || ''}
          </pre>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-md bg-amber-600 px-6 py-2 text-sm font-medium text-stone-950 hover:bg-amber-500"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function Home() {
  return (
    <ErrorBoundary>
      <QueryProvider>
        <React.Suspense fallback={<div className="min-h-screen bg-stone-950" />}>
          <AppContent />
        </React.Suspense>
      </QueryProvider>
    </ErrorBoundary>
  );
}
