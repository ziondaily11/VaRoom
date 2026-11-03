module.exports = {
  poweredByHeader: false,
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
      // Elie is a conversation in Chats; /chat was the legacy alias.
      {
        source: '/elie',
        destination: '/chats?c=elie',
        permanent: false,
      },
      {
        source: '/chat',
        destination: '/chats',
        permanent: false,
      },
      {
        source: '/marketplace.html',
        destination: '/marketplace',
        permanent: true,
      },
      {
        source: '/legacy-pages/marketplace.html',
        destination: '/marketplace',
        permanent: true,
      },
      {
        source: '/chat-settings.html',
        destination: '/chat-settings',
        permanent: true,
      },
      {
        source: '/legacy-pages/chat-settings.html',
        destination: '/chat-settings',
        permanent: true,
      },
      {
        source: '/varoomadmin',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/varoomadmin.html',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/legacy-pages/varoomadmin.html',
        destination: '/admin',
        permanent: true,
      },
      {
        source: '/auth-callback.html',
        destination: '/auth-callback',
        permanent: true,
      },
      {
        source: '/legacy-pages/auth-callback.html',
        destination: '/auth-callback',
        permanent: true,
      },
      {
        source: '/pricing.html',
        destination: '/pricing',
        permanent: true,
      },
      {
        source: '/legacy-pages/pricing.html',
        destination: '/pricing',
        permanent: true,
      },
      {
        source: '/bookings.html',
        destination: '/bookings',
        permanent: true,
      },
      {
        source: '/legacy-pages/bookings.html',
        destination: '/bookings',
        permanent: true,
      },
      {
        source: '/booking-approved.html',
        destination: '/booking-approved',
        permanent: true,
      },
      {
        source: '/legacy-pages/booking-approved.html',
        destination: '/booking-approved',
        permanent: true,
      },
      {
        source: '/map.html',
        destination: '/map',
        permanent: true,
      },
      {
        source: '/legacy-pages/map.html',
        destination: '/map',
        permanent: true,
      },
      {
        source: '/support.html',
        destination: '/support',
        permanent: true,
      },
      {
        source: '/legacy-pages/support.html',
        destination: '/support',
        permanent: true,
      },
      {
        source: '/chats.html',
        destination: '/chats',
        permanent: false,
      },
      {
        source: '/legacy-pages/chats.html',
        destination: '/chats',
        permanent: false,
      },
      {
        source: '/elie.html',
        destination: '/chats?c=elie',
        permanent: false,
      },
      {
        source: '/legacy-pages/elie.html',
        destination: '/chats?c=elie',
        permanent: false,
      },
      {
        source: '/privacy.html',
        destination: '/privacy',
        permanent: true,
      },
      {
        source: '/legacy-pages/privacy.html',
        destination: '/privacy',
        permanent: true,
      },
      {
        source: '/terms.html',
        destination: '/terms',
        permanent: true,
      },
      {
        source: '/legacy-pages/terms.html',
        destination: '/terms',
        permanent: true,
      },
      {
        source: '/notifications.html',
        destination: '/notifications',
        permanent: true,
      },
      {
        source: '/legacy-pages/notifications.html',
        destination: '/notifications',
        permanent: true,
      },
      {
        source: '/property-news.html',
        destination: '/property-news',
        permanent: true,
      },
      {
        source: '/legacy-pages/property-news.html',
        destination: '/property-news',
        permanent: true,
      },
      {
        source: '/login',
        destination: '/?auth=login',
        permanent: true,
      },
      {
        source: '/login.html',
        destination: '/?auth=login',
        permanent: false,
      },
      {
        source: '/legacy-pages/login.html',
        destination: '/?auth=login',
        permanent: false,
      },
      {
        source: '/forgot-password',
        destination: '/?auth=recovery',
        permanent: false,
      },
      {
        source: '/forgot-password.html',
        destination: '/?auth=recovery',
        permanent: false,
      },
      {
        source: '/legacy-pages/forgot-password.html',
        destination: '/?auth=recovery',
        permanent: false,
      },
      {
        source: '/signup-host',
        destination: '/?auth=signup&role=host',
        permanent: true,
      },
      {
        source: '/signup-client',
        destination: '/?auth=signup&role=client',
        permanent: true,
      },
      {
        source: '/signup-host.html',
        destination: '/?auth=signup&role=host',
        permanent: true,
      },
      {
        source: '/signup-client.html',
        destination: '/?auth=signup&role=client',
        permanent: true,
      },
      {
        source: '/register',
        destination: '/?auth=signup&role=client',
        permanent: true,
      },
    ];
  },
};
