module.exports = {
  turbopack: {
    root: __dirname,
  },
  async redirects() {
    return [
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
        source: '/login',
        destination: '/?auth=login',
        permanent: true,
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
