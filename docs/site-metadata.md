# Site metadata and icons

`src/content/site-metadata.ts` owns the production identity and homepage title/description.
`Page.astro` emits the same page-specific title, description, canonical URL and image for
Open Graph and Twitter cards, together with the site name, locale and image type/dimensions.
Project and case-study social cards retain their existing overrides. Canonical and structured
page URLs omit query strings; every URL names `https://patrickfanella.co`.

The JSON-LD graph describes Patrick using the maintained résumé's name, headline and public
GitHub/LinkedIn profiles. The homepage is a `ProfilePage` with that person as `mainEntity`;
other pages are `WebPage` records linked to the same `WebSite`. No employment, dates,
ratings, portrait or audience metrics are inferred. See Google's
[profile-page guidance](https://developers.google.com/search/docs/appearance/structured-data/profile-page).
The JSON is static, readable without JavaScript, and escapes `<` before insertion into its inert script.

`node scripts/generate-site-icons.mjs` renders format derivatives from the approved compact
PF mark at `public/assets/brand/patrick/favicon.svg`. It leaves the approved brand originals
unchanged and records source/output hashes in `src/content/site-icons.json`:

- The root SVG and PNGs at 16, 32, 48 and 96 pixels support tab and search icons.
- `favicon.ico` contains 16-, 32- and 48-pixel PNG frames for ICO readers and automatic root requests.
- `apple-touch-icon.png` is an exact copy of the approved 180-pixel Apple asset.
- Opaque 192- and 512-pixel PNGs support home-screen icons on the light ground.

Explicit icon links include content-hash query versions so browsers can fetch changed bytes.
The 96-pixel PNG is available to search crawlers that do not support SVG; see Google's
[favicon formats and sizing guidance](https://developers.google.com/search/docs/appearance/favicon-in-search).
The `/site.webmanifest` endpoint declares the same site identity and the two home-screen icons,
with `display: browser`. It does not declare offline support or a service worker.

Light/dark theme-color metadata uses the existing ground colors. With JavaScript, the shared boot
handler also follows manual and saved theme choices. Without JavaScript, the media-qualified
colors follow the system preference.

Verification: `npm run build`; `npx playwright test e2e/metadata.spec.ts e2e/brand.spec.ts`.
The metadata suite checks every sitemap page without scripts, its social-image bytes/dimensions,
structured profile links, favicon hashes, the manifest and browser theme behavior. Search engines
and social platforms choose when to recrawl and refresh their cached presentations.
