'use client';

import { useStore } from '@/lib/store';
import { useCurrency } from '@/lib/currency';
import { useTranslation } from '@/hooks/useTranslation';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';
import { CheckCircle, ShoppingBag, Package, Mail } from 'lucide-react';
import { useEffect, useState } from 'react';

interface PendingCheckoutItem {
  productId: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  source?: string;
}

interface PendingCheckout {
  items: PendingCheckoutItem[];
  total: number;
  subtotal: number;
  shipping: number;
  tax: number;
  discount: number;
  email: string;
  deliveryType: string;
  timestamp: number;
  checkoutId: string | null;
  method: string;
}

function loadShopifyCheckout(): { checkout: PendingCheckout | null; isReturn: boolean } {
  if (typeof window === 'undefined') return { checkout: null, isReturn: false };
  try {
    const stored = localStorage.getItem('3boxes_pending_checkout');
    if (stored) {
      const parsed: PendingCheckout = JSON.parse(stored);
      // Only consider it a valid Shopify return if within the last 2 hours
      const twoHoursMs = 2 * 60 * 60 * 1000;
      if (Date.now() - parsed.timestamp < twoHoursMs) {
        // Clear the pending checkout data since order is placed
        localStorage.removeItem('3boxes_pending_checkout');
        return { checkout: parsed, isReturn: true };
      }
      // Stale data, clean up
      localStorage.removeItem('3boxes_pending_checkout');
    }
  } catch {
    // ignore parse errors
  }
  return { checkout: null, isReturn: false };
}

export function OrderConfirmation() {
  const { lastOrderId, setView, clearCart } = useStore();
  const { format } = useCurrency();
  const { t } = useTranslation();

  const [shopifyReturnData] = useState<{ checkout: PendingCheckout | null; isReturn: boolean }>(() => loadShopifyCheckout());
  const shopifyCheckout = shopifyReturnData.checkout;
  const isShopifyReturn = shopifyReturnData.isReturn;

  // Clear cart when showing Shopify return confirmation (non-render-critical side effect)
  useEffect(() => {
    if (isShopifyReturn) {
      clearCart();
    }
  }, [isShopifyReturn, clearCart]);

  const estimatedDelivery = new Date();
  estimatedDelivery.setDate(estimatedDelivery.getDate() + 5);
  const deliveryStr = estimatedDelivery.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  // Shopify checkout return view
  if (isShopifyReturn && shopifyCheckout) {
    const orderDate = new Date(shopifyCheckout.timestamp).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5 }}
        className="flex flex-col items-center justify-center py-8 sm:py-16 text-center"
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
        >
          <CheckCircle className="h-20 w-20 text-emerald-400" />
        </motion.div>

        <h2 className="mt-6 text-2xl font-bold text-amber-100 sm:text-3xl">
          Order Placed Successfully!
        </h2>
        <p className="mt-2 text-amber-200/60">
          Thank you for your purchase
        </p>

        {/* Shopify processing notice */}
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-600/30 bg-amber-900/10 px-4 py-2.5 max-w-md">
          <Mail className="h-4 w-4 flex-shrink-0 text-amber-500" />
          <p className="text-xs text-amber-200/60 text-left">
            Your order is being processed by Shopify. You&apos;ll receive a confirmation email shortly.
          </p>
        </div>

        {/* Order details card */}
        <div className="mt-8 rounded-lg border border-amber-900/20 bg-stone-900/60 p-6 text-left w-full max-w-lg">
          <h3 className="text-lg font-semibold text-amber-100 mb-4">Order Details</h3>

          {/* Items list */}
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {shopifyCheckout.items.map((item) => (
              <div key={item.productId} className="flex items-center gap-3">
                <div className="h-12 w-12 flex-shrink-0 overflow-hidden rounded-md border border-amber-900/20">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="h-full w-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-amber-100 truncate">{item.name}</p>
                  <p className="text-xs text-amber-200/40">Qty: {item.quantity}</p>
                </div>
                <span className="text-sm text-amber-200/60 flex-shrink-0">
                  {format(item.price * item.quantity)}
                </span>
              </div>
            ))}
          </div>

          <Separator className="my-4 bg-amber-900/30" />

          {/* Totals */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Subtotal</span>
              <span className="text-amber-100">{format(shopifyCheckout.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Shipping</span>
              <span className="text-amber-100">
                {shopifyCheckout.shipping === 0 ? (
                  <span className="text-emerald-400">Free</span>
                ) : (
                  format(shopifyCheckout.shipping)
                )}
              </span>
            </div>
            {shopifyCheckout.discount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-200/50">Discount</span>
                <span className="text-emerald-400">-{format(shopifyCheckout.discount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Tax</span>
              <span className="text-amber-100">{format(shopifyCheckout.tax)}</span>
            </div>
            <Separator className="bg-amber-900/30" />
            <div className="flex justify-between">
              <span className="font-semibold text-amber-100">Total</span>
              <span className="text-lg font-bold text-amber-400">{format(shopifyCheckout.total)}</span>
            </div>
          </div>

          <Separator className="my-4 bg-amber-900/30" />

          {/* Meta info */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Email</span>
              <span className="text-amber-100">{shopifyCheckout.email}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Order Date</span>
              <span className="text-amber-100">{orderDate}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Est. Delivery</span>
              <span className="text-amber-100">{deliveryStr}</span>
            </div>
            {shopifyCheckout.checkoutId && (
              <div className="flex justify-between text-sm">
                <span className="text-amber-200/50">Checkout ID</span>
                <span className="font-mono text-xs text-amber-400 truncate max-w-[200px]">
                  {shopifyCheckout.checkoutId.replace('gid://shopify/Checkout/', '')}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-amber-200/50">Status</span>
              <span className="text-emerald-400">Processing</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button
            onClick={() => setView('home')}
            className="bg-amber-600 text-stone-950 hover:bg-amber-500"
          >
            <ShoppingBag className="mr-2 h-4 w-4" />
            Continue Shopping
          </Button>
          <Button
            variant="outline"
            onClick={() => setView('orders')}
            className="border-amber-900/30 text-amber-200/70 hover:border-amber-600/40 hover:text-amber-400"
          >
            <Package className="mr-2 h-4 w-4" />
            {t('orderConfirmation.viewOrders')}
          </Button>
        </div>
      </motion.div>
    );
  }

  // Default (local checkout) order confirmation
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-16 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: 'spring', stiffness: 200 }}
      >
        <CheckCircle className="h-20 w-20 text-emerald-400" />
      </motion.div>

      <h2 className="mt-6 text-2xl font-bold text-amber-100 sm:text-3xl">
        {t('orderConfirmation.title')}
      </h2>
      <p className="mt-2 text-amber-200/60">
        {t('orderConfirmation.thankYou')}
      </p>

      <div className="mt-8 rounded-lg border border-amber-900/20 bg-stone-900/60 p-6 text-left w-full max-w-md">
        <div className="space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-amber-200/50">{t('orderConfirmation.orderNumber')}</span>
            <span className="font-mono text-sm text-amber-400">
              {lastOrderId || 'N/A'}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-amber-200/50">{t('orderConfirmation.estimatedDelivery')}</span>
            <span className="text-amber-100">{deliveryStr}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-amber-200/50">{t('orderConfirmation.status')}</span>
            <span className="text-emerald-400">{t('orderConfirmation.confirmed')}</span>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <Button
          onClick={() => setView('home')}
          className="bg-amber-600 text-stone-950 hover:bg-amber-500"
        >
          <ShoppingBag className="mr-2 h-4 w-4" />
          {t('orderConfirmation.continueShopping')}
        </Button>
        <Button
          variant="outline"
          onClick={() => setView('orders')}
          className="border-amber-900/30 text-amber-200/70 hover:border-amber-600/40 hover:text-amber-400"
        >
          <Package className="mr-2 h-4 w-4" />
          {t('orderConfirmation.viewOrders')}
        </Button>
      </div>
    </motion.div>
  );
}
