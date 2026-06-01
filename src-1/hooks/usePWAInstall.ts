'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Global singleton so all components share ONE deferredPrompt
let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
let globalIsInstalled = false;
let globalIsInstalling = false;
const listeners: Set<() => void> = new Set();

function notifyAll() {
  listeners.forEach((fn) => fn());
}

function checkIfInstalled(): boolean {
  if (typeof window === 'undefined') return false;

  // Method 1: Check if running in standalone mode (inside the PWA window)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  // Method 2: Check localStorage flag (set when user installs)
  if (localStorage.getItem('pwa-installed') === 'true') {
    return true;
  }

  // Method 3: iOS standalone check
  if ((navigator as any).standalone === true) {
    return true;
  }

  return false;
}

if (typeof window !== 'undefined') {
  // Check if already installed
  globalIsInstalled = checkIfInstalled();

  // Listen for beforeinstallprompt ONCE globally
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    // If already installed, ignore the event
    if (globalIsInstalled) return;
    globalDeferredPrompt = e as BeforeInstallPromptEvent;
    console.log('[PWA] beforeinstallprompt captured — install is available');
    notifyAll();
  });

  // Listen for appinstalled — user completed installation
  window.addEventListener('appinstalled', () => {
    globalIsInstalled = true;
    globalDeferredPrompt = null;
    localStorage.setItem('pwa-installed', 'true');
    console.log('[PWA] App installed successfully');
    notifyAll();
  });

  // Also check getInstalledRelatedApps API (Chrome 85+)
  if ('getInstalledRelatedApps' in navigator) {
    (navigator as any).getInstalledRelatedApps().then((apps: any[]) => {
      if (apps && apps.length > 0) {
        globalIsInstalled = true;
        globalDeferredPrompt = null;
        localStorage.setItem('pwa-installed', 'true');
        console.log('[PWA] Detected installed via getInstalledRelatedApps');
        notifyAll();
      }
    }).catch(() => {
      // API not available or not allowed, ignore
    });
  }
}

export function usePWAInstall() {
  const [, forceUpdate] = useState(0);
  const isRegistered = useRef(false);

  // Register this component as a listener
  useEffect(() => {
    if (isRegistered.current) return;
    isRegistered.current = true;

    const handler = () => forceUpdate((n) => n + 1);
    listeners.add(handler);

    return () => {
      listeners.delete(handler);
    };
  }, []);

  const triggerInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable' | 'already_installed'> => {
    // Already installed — open the app
    if (globalIsInstalled) {
      // Try to open the app in standalone mode
      window.location.href = window.location.origin + '/';
      return 'already_installed';
    }

    // We have the deferred prompt — trigger it directly
    if (globalDeferredPrompt) {
      globalIsInstalling = true;
      notifyAll();

      try {
        await globalDeferredPrompt.prompt();
        const { outcome } = await globalDeferredPrompt.userChoice;
        if (outcome === 'accepted') {
          globalIsInstalled = true;
          localStorage.setItem('pwa-installed', 'true');
        }
        globalDeferredPrompt = null;
        return outcome;
      } catch (err) {
        console.error('[PWA] Install prompt error:', err);
        return 'dismissed';
      } finally {
        globalIsInstalling = false;
        notifyAll();
      }
    }

    // No prompt available — Chrome may show install in URL bar
    console.warn('[PWA] beforeinstallprompt not available.');
    console.warn('  - App may already be installed (check URL bar for "Open in app" icon)');
    console.warn('  - Not on HTTPS or localhost');
    console.warn('  - Browser does not support PWA install (Safari, Firefox)');

    return 'unavailable';
  }, []);

  // Detect device type for instructions
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isMobile = typeof navigator !== 'undefined' && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  return {
    /** Can the PWA install prompt be triggered right now? */
    canInstall: !!globalDeferredPrompt && !globalIsInstalled,
    /** Is the app already installed? */
    isInstalled: globalIsInstalled,
    /** Is the install prompt currently showing? */
    isInstalling: globalIsInstalling,
    /** Trigger the PWA install prompt. Returns result status */
    triggerInstall,
    /** Is this an iOS device? */
    isIOS,
    /** Is this a mobile device? */
    isMobile,
  };
}
