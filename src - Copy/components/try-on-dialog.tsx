'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera,
  Sparkles,
  Loader2,
  X,
  RotateCcw,
  Download,
  ImageIcon,
  AlertCircle,
} from 'lucide-react';
import Image from 'next/image';

interface TryOnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  productName: string;
  productImage: string;
}

type Step = 'upload' | 'preview' | 'generating' | 'result';

/**
 * Compress an image file to reduce payload size before sending to the API.
 * Resizes to max 1024px on the longest side and reduces quality.
 */
function compressImage(file: File, maxSize = 1024, quality = 0.8): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = document.createElement('img');
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;

        // Scale down if needed
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);

        // Convert to JPEG for smaller size
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export function TryOnDialog({
  open,
  onOpenChange,
  productId,
  productName,
  productImage,
}: TryOnDialogProps) {
  const [step, setStep] = useState<Step>('upload');
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null);
  const [selfieData, setSelfieData] = useState<string | null>(null);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep('upload');
    setSelfiePreview(null);
    setSelfieData(null);
    setResultImage(null);
    setError(null);
    setProgress('');
  }, []);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!file.type.startsWith('image/')) {
        setError('Please upload an image file (JPG, PNG, WebP)');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be less than 10MB');
        return;
      }

      setError(null);

      try {
        // Compress the image to reduce payload size
        const compressed = await compressImage(file, 1024, 0.8);
        setSelfiePreview(compressed);
        setSelfieData(compressed);
        setStep('preview');
      } catch {
        setError('Failed to process image. Please try another photo.');
      }
    },
    []
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files?.[0];
      if (!file || !file.type.startsWith('image/')) {
        setError('Please drop an image file');
        return;
      }
      setError(null);
      try {
        const compressed = await compressImage(file, 1024, 0.8);
        setSelfiePreview(compressed);
        setSelfieData(compressed);
        setStep('preview');
      } catch {
        setError('Failed to process image. Please try another photo.');
      }
    },
    []
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleGenerate = useCallback(async () => {
    if (!selfieData) return;

    setStep('generating');
    setError(null);
    setProgress('Uploading your photo...');

    try {
      const controller = new AbortController();
      // Set a generous timeout (2 minutes) since AI generation takes time
      const timeoutId = setTimeout(() => controller.abort(), 120000);

      const response = await fetch('/api/try-on', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId,
          selfieData,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Check if response is JSON before trying to parse
      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        // Response is not JSON (probably HTML error page)
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('Non-JSON response:', response.status, errorText.substring(0, 200));
        throw new Error(
          response.status === 413
            ? 'Image is too large. Please try a smaller photo.'
            : response.status === 503
            ? 'AI service is currently busy. Please try again in a moment.'
            : `Server error (${response.status}). Please try again.`
        );
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Error: ${response.status}`);
      }

      setResultImage(data.imageUrl);
      setStep('result');
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setError('Request timed out. The AI service may be busy — please try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
      setStep('preview');
    }
  }, [selfieData, productId]);

  const handleReset = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) reset();
        onOpenChange(isOpen);
      }}
    >
      <DialogContent className="max-w-lg border-amber-900/30 bg-stone-950 p-0 overflow-hidden sm:max-w-xl">
        {/* Header with gradient */}
        <div className="relative bg-gradient-to-r from-amber-900/40 via-rose-900/30 to-amber-900/40 px-6 pt-6 pb-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl font-bold text-amber-100">
              <Sparkles className="h-5 w-5 text-amber-400" />
              AI Virtual Try-On
            </DialogTitle>
            <DialogDescription className="text-amber-200/50">
              Upload your selfie and see how{' '}
              <span className="text-amber-300">{productName}</span> looks on
              you
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-6">
          <AnimatePresence mode="wait">
            {/* Step 1: Upload */}
            {step === 'upload' && (
              <motion.div
                key="upload"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                {/* Product Preview */}
                <div className="flex items-center gap-3 rounded-lg border border-amber-900/20 bg-stone-900/60 p-3">
                  <div className="relative h-14 w-14 flex-shrink-0 overflow-hidden rounded-md">
                    <Image
                      src={productImage}
                      alt={productName}
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-100">
                      {productName}
                    </p>
                    <p className="text-xs text-amber-200/40">
                      Selected for try-on
                    </p>
                  </div>
                </div>

                {/* Upload Area */}
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onClick={() => fileInputRef.current?.click()}
                  className="group flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-amber-900/30 bg-stone-900/30 px-6 py-10 transition-all hover:border-amber-600/40 hover:bg-stone-900/50"
                >
                  <div className="mb-4 rounded-full bg-amber-900/20 p-4 transition-colors group-hover:bg-amber-900/30">
                    <Camera className="h-8 w-8 text-amber-400/60 transition-colors group-hover:text-amber-400" />
                  </div>
                  <p className="text-sm font-medium text-amber-200/70">
                    Upload your selfie
                  </p>
                  <p className="mt-1 text-xs text-amber-200/30">
                    Drag & drop or click to browse
                  </p>
                  <p className="mt-2 text-[10px] text-amber-200/20">
                    JPG, PNG, or WebP · Max 10MB
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-900/30 bg-red-950/30 p-3">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                <p className="text-center text-[10px] text-amber-200/20">
                  Your photo is processed securely and not stored permanently
                </p>
              </motion.div>
            )}

            {/* Step 2: Preview selfie before generating */}
            {step === 'preview' && selfiePreview && (
              <motion.div
                key="preview"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="flex items-start gap-4">
                  {/* Selfie Preview */}
                  <div className="relative flex-1">
                    <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-amber-900/20 bg-stone-900/60">
                      <Image
                        src={selfiePreview}
                        alt="Your selfie"
                        fill
                        className="object-cover"
                        sizes="300px"
                      />
                    </div>
                    <button
                      onClick={() => {
                        setSelfiePreview(null);
                        setSelfieData(null);
                        setStep('upload');
                      }}
                      className="absolute right-2 top-2 rounded-full bg-stone-900/80 p-1.5 text-amber-200/60 transition-colors hover:bg-red-900/60 hover:text-red-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* Arrow + Product */}
                  <div className="flex flex-col items-center justify-center gap-2 pt-8">
                    <Sparkles className="h-6 w-6 text-amber-400/40" />
                    <span className="text-[10px] text-amber-200/30">+</span>
                    <div className="relative h-16 w-16 overflow-hidden rounded-lg border border-amber-900/20">
                      <Image
                        src={productImage}
                        alt={productName}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                    <span className="text-[10px] text-amber-200/30">=</span>
                    <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-amber-900/20 bg-stone-900/60">
                      <ImageIcon className="h-6 w-6 text-amber-400/40" />
                    </div>
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 rounded-lg border border-red-900/30 bg-red-950/30 p-3">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 text-red-400" />
                    <p className="text-sm text-red-300">{error}</p>
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSelfiePreview(null);
                      setSelfieData(null);
                      setStep('upload');
                    }}
                    className="flex-1 border-amber-900/30 text-amber-200/60 hover:border-amber-600/40 hover:text-amber-400"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Retake
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    className="flex-1 bg-amber-600 text-stone-950 hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-600/25"
                  >
                    <Sparkles className="mr-2 h-4 w-4" />
                    Generate Try-On
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Generating */}
            {step === 'generating' && (
              <motion.div
                key="generating"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="flex flex-col items-center justify-center py-12"
              >
                <div className="relative">
                  <div className="absolute inset-0 animate-ping rounded-full bg-amber-400/20" />
                  <div className="relative rounded-full bg-amber-900/20 p-6">
                    <Sparkles className="h-10 w-10 animate-pulse text-amber-400" />
                  </div>
                </div>
                <h3 className="mt-6 text-lg font-semibold text-amber-100">
                  Creating Your Look
                </h3>
                <p className="mt-2 text-center text-sm text-amber-200/40">
                  Our AI is analyzing your photo and generating a virtual try-on.
                  <br />
                  This may take 30–60 seconds...
                </p>
                <div className="mt-6 flex items-center gap-1">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400/60" />
                  <span className="text-xs text-amber-200/30">
                    Processing with AI...
                  </span>
                </div>
              </motion.div>
            )}

            {/* Step 4: Result */}
            {step === 'result' && resultImage && (
              <motion.div
                key="result"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-amber-600/30 bg-stone-900/60">
                  <Image
                    src={resultImage}
                    alt={`Virtual try-on: ${productName}`}
                    fill
                    className="object-cover"
                    sizes="500px"
                  />
                  <div className="absolute left-3 top-3 rounded-full bg-emerald-600/90 px-3 py-1 text-xs font-medium text-white shadow-lg">
                    AI Generated
                  </div>
                </div>

                <p className="text-center text-xs text-amber-200/30">
                  This is an AI-generated visualization. Actual appearance may
                  vary.
                </p>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="flex-1 border-amber-900/30 text-amber-200/60 hover:border-amber-600/40 hover:text-amber-400"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Try Again
                  </Button>
                  <a
                    href={resultImage}
                    download
                    className="flex flex-1 items-center justify-center rounded-md bg-amber-600 px-4 py-2 text-sm font-medium text-stone-950 transition-all hover:bg-amber-500 hover:shadow-lg hover:shadow-amber-600/25"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Save Image
                  </a>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
