'use client';

import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';
import { Smartphone, Download } from 'lucide-react';

export function Footer() {
  const { t } = useTranslation();

  const handleInstallApp = () => {
    // Try to trigger PWA install prompt
    const event = new Event('trigger-pwa-install');
    window.dispatchEvent(event);

    // Fallback: scroll to the app download section
    const downloadSection = document.getElementById('app-download-section');
    if (downloadSection) {
      downloadSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <footer className="mt-auto border-t border-amber-900/30 bg-stone-950">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2">
              <div className="logo-flashy">
                <Image
                  src="/images/logo.png"
                  alt="3 Boxes Luxury Logo"
                  width={56}
                  height={56}
                  className="h-14 w-auto"
                />
              </div>
              <h3 className="gold-shimmer text-lg font-bold tracking-widest">
                3 BOXES LUXURY
              </h3>
            </div>
            <p className="mt-2 text-sm text-amber-200/50">
              {t('footer.description')}
            </p>
          </div>

          {/* Shop */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-amber-400/80">
              {t('footer.shop')}
            </h4>
            <ul className="mt-3 space-y-2">
              {[t('categories.watches'), t('categories.jewelry'), t('categories.leatherGoods'), t('categories.fragrances'), t('categories.fashion'), t('categories.homeLiving'), t('categories.sarees'), t('categories.fashion')].map((item, i) => (
                <li key={i}>
                  <span className="text-sm text-amber-200/50 transition-colors hover:text-amber-400 cursor-pointer">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-amber-400/80">
              {t('footer.company')}
            </h4>
            <ul className="mt-3 space-y-2">
              {[t('footer.aboutUs'), t('footer.careers'), t('footer.press'), t('footer.sustainability')].map((item, i) => (
                <li key={i}>
                  <span className="text-sm text-amber-200/50 transition-colors hover:text-amber-400 cursor-pointer">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-amber-400/80">
              {t('footer.support')}
            </h4>
            <ul className="mt-3 space-y-2">
              {[t('footer.contactUs'), t('footer.shippingReturns'), t('footer.faq'), t('footer.sizeGuide')].map((item, i) => (
                <li key={i}>
                  <span className="text-sm text-amber-200/50 transition-colors hover:text-amber-400 cursor-pointer">
                    {item}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Get the App */}
          <div>
            <h4 className="text-sm font-semibold uppercase tracking-wider text-amber-400/80">
              Get the App
            </h4>
            <p className="mt-3 text-sm text-amber-200/50">
              Install our Android app directly — no app store needed. Shop luxury gifts on the go.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                onClick={handleInstallApp}
                className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-600/20 hover:text-amber-200 hover:border-amber-500/50"
              >
                <Smartphone className="h-4 w-4" />
                Install Android App
              </button>
              <button
                onClick={() => window.open('/app/', '_blank')}
                className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-stone-900/50 px-3 py-2 text-sm text-amber-200/60 transition-colors hover:bg-stone-800/50 hover:text-amber-200 hover:border-amber-500/30"
              >
                <Download className="h-4 w-4" />
                Flutter Web App
              </button>
            </div>
            <div className="mt-3 flex items-center gap-1.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-stone-800/50">
                <span className="text-lg">📱</span>
              </div>
              <div className="text-[10px] text-amber-200/30">
                Progressive Web App<br />Works offline &amp; fullscreen
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 border-t border-amber-900/20 pt-6">
          <div className="flex flex-col items-center justify-between gap-2 sm:flex-row">
            <p className="text-xs text-amber-200/40">
              &copy; {new Date().getFullYear()} 3 BOXES LUXURY. {t('footer.rights')}
            </p>
            <p className="text-xs text-amber-200/30">
              {t('footer.crafted')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
