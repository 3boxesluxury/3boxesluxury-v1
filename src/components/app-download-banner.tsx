'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Smartphone, Download, X, Monitor, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePWAInstall } from '@/hooks/usePWAInstall';
import { toast } from 'sonner';

export function AppDownloadBanner() {
  const [isDismissed, setIsDismissed] = useState(false);
  const { canInstall, isInstalled, triggerInstall } = usePWAInstall();

  const handleInstallClick = async () => {
    const result = await triggerInstall();
    if (result === 'unavailable') {
      toast.info('Install App', {
        description: 'Open browser menu (⋮) → "Install app" or "Add to Home Screen"',
        duration: 5000,
      });
    } else if (result === 'already_installed') {
      toast.info('App Installed', {
        description: 'The app is already installed. Look for it in your apps or home screen.',
        duration: 3000,
      });
    }
  };

  return (
    <AnimatePresence>
      {!isDismissed && (
        <motion.div
          key="app-download-banner"
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeOut', delay: 2 }}
          className="fixed bottom-4 left-4 right-4 z-[60] mx-auto max-w-lg sm:left-auto sm:right-4 sm:mx-0"
        >
          <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-stone-900 via-stone-900 to-amber-900/20 p-4 shadow-2xl shadow-amber-900/20 backdrop-blur-lg">
            {/* Decorative glow — pointer-events-none so it doesn't block the close button */}
            <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-amber-500/5 blur-2xl" />

            {/* Close button — z-10 to stay above all content */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsDismissed(true);
              }}
              className="absolute right-2 top-2 z-10 rounded-full p-1.5 text-amber-200/40 transition-colors hover:bg-amber-900/30 hover:text-amber-200 active:bg-amber-900/50"
            >
              <X className="h-4 w-4" />
            </button>

            <div className="flex items-center gap-4">
              {/* App icon */}
              <div className="flex-shrink-0">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500/20 to-amber-700/10 border border-amber-500/20">
                  {isInstalled ? (
                    <ExternalLink className="h-7 w-7 text-amber-400" />
                  ) : (
                    <Smartphone className="h-7 w-7 text-amber-400" />
                  )}
                </div>
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-amber-100">
                  {isInstalled ? 'App Installed!' : 'Install the App'}
                </h3>
                <p className="mt-0.5 text-xs text-amber-200/50 line-clamp-2">
                  {isInstalled
                    ? '3 BOXES LUXURY is installed on your device. Open it for the best experience!'
                    : canInstall
                    ? 'Tap to install directly on your device — no app store needed!'
                    : 'Get the 3 BOXES LUXURY app for iOS & Android.'}
                </p>

                {/* Action buttons */}
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={handleInstallClick}
                    className="bg-amber-600 text-stone-950 hover:bg-amber-500 h-8 gap-1.5 text-xs font-semibold"
                  >
                    {isInstalled ? (
                      <>
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open App
                      </>
                    ) : (
                      <>
                        <Download className="h-3.5 w-3.5" />
                        {canInstall ? 'Install Now' : 'Get the App'}
                      </>
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open('/?XTransformPort=3002', '_blank')}
                    className="border-amber-500/30 bg-amber-900/10 text-amber-300 hover:bg-amber-900/20 hover:text-amber-200 h-8 gap-1.5 text-xs"
                  >
                    <Monitor className="h-3.5 w-3.5" />
                    Web App
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
