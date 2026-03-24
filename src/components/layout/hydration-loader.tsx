'use client';

import { useEffect } from 'react';

export function HydrationLoader() {
  useEffect(() => {
    const el = document.getElementById('__app-loader');
    if (el) {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 300);
    }

    // Safety fallback — remove loader after 3s even if something delays
    const fallback = setTimeout(() => {
      const loader = document.getElementById('__app-loader');
      if (loader) loader.remove();
    }, 3000);
    return () => clearTimeout(fallback);
  }, []);
  return null;
}
