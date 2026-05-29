'use client';

import Image from 'next/image';
import { useTranslation } from '@/hooks/useTranslation';
import { Smartphone, Download } from 'lucide-react';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { useToast } from '@/hooks/use-toast';
import { useStore } from '@/lib/store';

// Map display names to category slugs
const FOOTER_CATEGORY_LINKS: { labelKey: string; slug: string }[] = [
  { labelKey: 'categories.watches', slug: 'watches' },
  { labelKey: 'categories.jewelry', slug: 'jewelry' },
  { labelKey: 'categories.leatherGoods', slug: 'leather-goods' },
  { labelKey: 'categories.fragrances', slug: 'fragrances' },
  { labelKey: 'categories.fashion', slug: 'fashion' },
  { labelKey: 'categories.homeLiving', slug: 'home-living' },
  { labelKey: 'categories.sarees', slug: 'sarees' },
  { labelKey: 'categories.romanticGifts', slug: 'romantic-gifts' },
];

export function Footer() {
  const { t } = useTranslation();
  const setView = useStore((s) => s.setView);
  const setCategory = useStore((s) => s.setCategory);
  const setSearch = useStore((s) => s.setSearch);
  const { canInstall, isInstalling, isInstalled, triggerInstall, isIOS, isMobile } = usePWAInstall();
  const { toast } = useToast();

  const handleGoHome = () => {
    setView('home');
    setSearch('');
    setCategory(null);
    // Force scroll to top immediately — don't rely on useEffect
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleInstallClick = async () => {
    const result = await triggerInstall();
    if (result === 'unavailable') {
      if (isIOS) {
        toast({
          title: 'Install on iPhone',
          description: 'Tap the Share button (⬆️) in Safari, then "Add to Home Screen" to install.',
          duration: 8000,
        });
      } else if (isMobile) {
        toast({
          title: 'Install on Android',
          description: 'Open in Chrome → tap ⋮ menu → "Install app" or "Add to Home Screen".',
          duration: 8000,
        });
      } else {
        toast({
          title: 'Install the App',
          description: 'Open this site in Chrome on your phone to install the app directly.',
          duration: 8000,
        });
      }
    }
  };

  return (
    <footer className="relative z-[70] mt-auto border-t border-amber-900/30 bg-stone-950">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div>
            <button
              onClick={handleGoHome}
              className="flex items-center gap-2 group mb-1 cursor-pointer bg-transparent border-none p-0 text-left pointer-events-auto"
              style={{ pointerEvents: 'auto' }}
              type="button"
            >
              <div className="logo-flashy footer-logo" style={{ pointerEvents: 'auto' }}>
                <Image
                  src="/images/logo.png"
                  alt="3 Boxes Luxury Logo"
                  width={126}
                  height={126}
                  className="h-[126px] w-auto"
                  style={{ pointerEvents: 'none' }}
                />
              </div>
              <span className="gold-shimmer text-lg font-bold tracking-widest group-hover:text-amber-400 transition-colors">
                3 BOXES LUXURY
              </span>
            </button>
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
              {FOOTER_CATEGORY_LINKS.map((link) => (
                <li key={link.slug}>
                  <button
                    onClick={() => {
                      setCategory(link.slug);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="text-sm text-amber-200/50 transition-colors hover:text-amber-400 cursor-pointer"
                    type="button"
                  >
                    {t(link.labelKey)}
                  </button>
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
                onClick={handleInstallClick}
                disabled={isInstalling || isInstalled}
                className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-600/10 px-3 py-2 text-sm text-amber-300 transition-colors hover:bg-amber-600/20 hover:text-amber-200 hover:border-amber-500/50 disabled:opacity-50"
              >
                {isInstalling ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-300 border-t-transparent" />
                ) : (
                  <Smartphone className="h-4 w-4" />
                )}
                {isInstalled ? 'Open App' : isInstalling ? 'Installing...' : 'Install Android App'}
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
            <button
              onClick={handleGoHome}
              className="text-xs text-amber-200/40 hover:text-amber-400 transition-colors cursor-pointer bg-transparent border-none p-0 pointer-events-auto"
              type="button"
            >
              &copy; {new Date().getFullYear()} 3 BOXES LUXURY. {t('footer.rights')}
            </button>
            <p className="text-xs text-amber-200/30">
              {t('footer.crafted')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
