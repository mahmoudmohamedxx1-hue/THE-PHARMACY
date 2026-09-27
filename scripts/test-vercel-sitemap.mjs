// Simulate Vercel runtime: set env vars, request sitemap via the module directly
process.env.VERCEL_PROJECT_PRODUCTION_URL = 'the-pharmacy-two.vercel.app';
delete process.env.NEXT_PUBLIC_SITE_URL;
const { SITE_URL } = await import('/home/z/my-project/src/lib/site-url.ts');
console.log('Resolved on Vercel-like env:', SITE_URL);
