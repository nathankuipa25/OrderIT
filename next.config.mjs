import withPWA from 'next-pwa'

const isProd = process.env.NODE_ENV === 'production'

const config = {
  experimental: {
    appDir: true,
  },
  // Keep other existing next.js options here as needed
}

export default withPWA({
  ...config,
  pwa: {
    dest: 'public',
    register: false, // we register manually in the app
    disable: !isProd,
    publicExcludes: ['!icons/**', '!images/**'],
  },
})
