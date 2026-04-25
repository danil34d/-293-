import type { Metadata, Viewport } from 'next';
import './globals.css';
import { AppProviders } from '@/components/layout/AppProviders';
import { getWashEventsData, getRetailPriceConfig } from '@/lib/data';

export const metadata: Metadata = {
  title: 'Менеджер Автомойки',
  description: 'Эффективно управляйте операциями вашей автомойки.',
  applicationName: 'Автомойка',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Автомойка',
    statusBarStyle: 'default',
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: '/pwa-icon-192', sizes: '192x192', type: 'image/png' },
      { url: '/pwa-icon-512', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon', sizes: '180x180', type: 'image/png' },
    ],
    shortcut: ['/favicon.ico'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#102033',
};

async function getNewServicesCount() {
  try {
    const [washEvents, retailConfig] = await Promise.all([
      getWashEventsData(),
      getRetailPriceConfig(),
    ]);

    const existingServices = new Set([
      ...retailConfig.mainPriceList.map((service) => service.serviceName),
      ...retailConfig.additionalPriceList.map((service) => service.serviceName),
    ]);

    const dismissedServices = new Set(retailConfig.dismissedCustomServices || []);

    const customServices = new Set<string>();
    washEvents.forEach((event) => {
      const allServices = [event.services.main, ...event.services.additional];
      allServices.forEach((service) => {
        if (
          service?.isCustom &&
          !existingServices.has(service.serviceName) &&
          !dismissedServices.has(service.serviceName)
        ) {
          customServices.add(service.serviceName);
        }
      });
    });

    return customServices.size;
  } catch (error) {
    console.error('Failed to calculate new services count:', error);
    return 0;
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const newServicesCount = await getNewServicesCount();

  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="font-body antialiased">
        <AppProviders newServicesCount={newServicesCount}>{children}</AppProviders>
      </body>
    </html>
  );
}
