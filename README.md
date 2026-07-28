# Maths with Ankush — Website

Live site: https://maths-with-ankush.netlify.app/ (currently on Netlify; moving to Cloudflare Pages)

Marketing/landing page for Ankush Garg's Grade 9–12 Maths tutoring batches. Built in [Claude Design](https://claude.ai) and exported as a static bundle.

## Structure

```
index.html     — page markup + content data (testimonials, FAQs, features, etc. live inline in the <script data-dc-script> block near the bottom)
support.js     — Claude Design's runtime (generated — do not hand-edit; loads React from unpkg.com at runtime)
assets/
  ankush.jpg   — teacher photo, used in the hero and about sections
```

## Editing content

Text content (headings, testimonials, FAQ questions, features, resources list) lives as plain JS objects inside the `renderVals()` method near the bottom of `index.html` — search for `testimonials:`, `faqs:`, `features:`. Editing those values directly is safe.

Layout/styling uses inline styles and the `<style>` block in `<helmet>` at the top of `index.html`.

The custom tags (`<x-dc>`, `<sc-for>`, `<sc-if>`, `{{ }}` bindings) are Claude Design's templating syntax, parsed by `support.js` at runtime — avoid restructuring these unless you're re-exporting from Claude Design, to prevent breaking the runtime's parser.

## Local preview

No build step needed — it's a static bundle. From this folder:

```
python3 -m http.server 8080
```

Then open `http://localhost:8080` in a browser.

## Deployment

Deployed via Cloudflare Pages, connected to this GitHub repo. Every push to `main` triggers an automatic redeploy — no build command needed (static output, publish directory = `/`).
