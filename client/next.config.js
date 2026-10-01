module.exports = {
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
    ];
  },
};
