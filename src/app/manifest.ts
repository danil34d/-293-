import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Автомойка',
    short_name: 'Мойка',
    description: 'Рабочее приложение автомойки для сотрудников, админа и мониторинга.',
    start_url: '/login',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#f4f7fb',
    theme_color: '#102033',
    lang: 'ru-RU',
    categories: ['business', 'productivity', 'utilities'],
    icons: [
      {
        src: '/pwa-icon-192',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/pwa-icon-192',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/pwa-icon-512',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/pwa-icon-512',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/apple-touch-icon',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
    shortcuts: [
      {
        name: 'Вход сотрудников',
        short_name: 'Вход',
        description: 'Открыть страницу входа',
        url: '/login',
        icons: [{ src: '/pwa-icon-192', sizes: '192x192', type: 'image/png' }],
      },
      {
        name: 'Мониторинг',
        short_name: 'Монитор',
        description: 'Открыть настенный мониторинг автомойки',
        url: '/wallboard',
        icons: [{ src: '/pwa-icon-192', sizes: '192x192', type: 'image/png' }],
      },
    ],
  };
}
