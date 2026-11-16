import { iconHref, siteMetadata } from '../content/site-metadata'

export function GET() {
  return new Response(JSON.stringify({
    id: '/', name: siteMetadata.name, short_name: siteMetadata.name,
    description: siteMetadata.description, lang: 'en-US', start_url: '/', scope: '/', display: 'browser',
    background_color: siteMetadata.lightColor, theme_color: siteMetadata.lightColor,
    icons: [192, 512].map(size => ({ src: iconHref(`/favicon-${size}x${size}.png`),
      sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })),
  }), { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } })
}
