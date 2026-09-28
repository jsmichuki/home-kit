# Complete New Homeowner System landing page build brief

## Purpose and decision

Build one evergreen product landing page for the **Complete New Homeowner System**. Its single job is to turn a recent homebuyer who feels unsure what to do next into a buyer of the complete set.

The primary action is **Get the complete set for $69**. A visitor may still browse individual guides farther down the page, but do not place a competing purchase action beside the hero CTA.

Use a classic conversion page with a long form story. The system needs a little education before the complete set feels like the obvious choice: visitors need to see that these are connected homeowner jobs, not eight unrelated downloads.

Assumptions for this first build:

- Audience: first time and recent homeowners, especially in the first year after closing.
- Traffic: search, social, and paid traffic where the visitor has a specific home task but may not know the whole system yet.
- Conversion: a completed purchase of the complete set.
- Proof: use only verified product contents, delivery details, and policy terms already available in the application. Do not invent reviews, results, urgency, savings claims, or a refund promise.

## What to borrow from the references

Use the referenced pages for their *construction*, not their visual identity or copy.

| Reference | Keep | Do not carry over |
| --- | --- | --- |
| [ToonBee](https://toonbee.ai/) | A clear outcome at the top, visual product demonstration, a simple three step explanation, problem first storytelling, concrete feature proof, FAQ, and a repeated final CTA. | Its high pressure urgency, dense visual noise, many repeated offers, and claims that need external proof. |
| Timberlux Urbanrise reference | Product forward storytelling: lead with the item, then make the visitor imagine ownership through material detail, product views, benefits, offer, and objections. | Any brand assets, wording, pricing, imagery, or purchase mechanics from the reference. |

The Timberlux page could not be fetched reliably during research, so treat it as a direction for product page pacing only and verify it in a browser before visual QA.

## Source theme: first month home setup checklist

The theme comes directly from [First Month Home Setup Checklist](../../../../Downloads/guides/first-month-home-setup/first-month-home-setup-checklist.pdf): an inviting, practical homeowner manual rather than a generic software storefront.

### Theme statement

**Warm, calm, and capable.** The page should feel like a well made printed guide waiting on a kitchen table: useful enough to trust, personal enough to keep, and organized enough to act on today.

### Extracted visual language

| Element | Direction |
| --- | --- |
| Surface | Warm off white paper with light natural grain. Use solid cream surfaces, not digital blue or glossy black panels. |
| Ink | Deep charcoal for all primary type and icon strokes. It should read like editorial ink, not pure black interface chrome. |
| Accent | Muted olive sage for rules, category labels, checklist marks, and calm structural detail. |
| Action color | Burnt terracotta for the main button, alerts, and limited high attention details. Use sparingly so purchase remains the visual anchor. |
| Photography | Natural window light, ordinary lived in spaces, hands, keys, labels, paper, tools, and organized household objects. Show real domestic scale and diverse homeowners. Avoid stocky luxury interiors, floating devices, and generic construction imagery. |
| Graphic language | Fine horizontal rules, line drawn sun and leaf motifs, square checkboxes, minimal house icons, and numbered lists. Use one consistent thin line icon set. |
| Editorial character | Generous margins, big display headlines, short instructional copy, and calm sections that feel like a printed spread. Avoid pills, glass cards, heavy shadows, background gradients, and visual clutter. |

### Core design tokens

Sample and validate the final palette against the source cover before implementation. These are starting values, not arbitrary rebranding.

| Token | Starting value | Role |
| --- | ---: | --- |
| `paper` | `#F4EBDD` | Page and card base |
| `paper raised` | `#FBF7EF` | Lifted product and FAQ surfaces |
| `ink` | `#292A29` | Headings, body text, icon strokes |
| `sage` | `#87937A` | Rules, overlines, category markers |
| `sage dark` | `#66705B` | Accessible sage text on paper |
| `terracotta` | `#C97546` | Primary action and safety highlight |
| `terracotta dark` | `#9C4E2D` | Pressed action state |
| `sand` | `#C8B495` | Secondary decorative neutral |

Use semantic variables such as `--surface`, `--on-surface`, `--accent`, and `--action`, not raw colors scattered through components. Confirm 4.5:1 contrast for ordinary text; use charcoal or sage dark for text rather than the lighter sage.

### Type

The PDF embeds **Fraunces** for large editorial headlines and **DM Sans** for body and practical labels. Carry that intentional editorial pair into the landing page if the fonts are licensed and self hosted. Use Fraunces only for headings and key prices, DM Sans for everything else. No italics, no all caps paragraphs, and no ultra heavy weights.

If those exact fonts cannot be shipped, choose one legible editorial serif for display and one neutral sans for UI, then preserve the same hierarchy. Do not substitute a generic dashboard type system.

## Required page narrative and copy

### 1. Floating navigation

Use a small, detached pill navigation over the paper background: wordmark on the left, anchor links for **What’s inside**, **How it works**, and **Questions**, then a terracotta **Get the set for $69** button. On small screens, use an accessible menu with the same links and CTA.

### 2. Hero: the owner’s manual moment

**Eyebrow**

`The Complete New Homeowner System`

**Headline**

`Your home did not come with an owner’s manual.`

`This is it.`

**Support copy**

`Eight practical guides and their editable companions for the work that begins after closing: setting up, maintaining, protecting, budgeting, and improving your home.`

**Primary CTA**

`Get the complete set for $69`

**Microcopy below CTA**

`Includes all 8 guides and editable companions. Delivered after payment confirmation.`

**Value cue**

`Buy separately for $143. Get the complete system for $69.`

Place this only when the live catalog remains at those prices. Calculate it from catalog data rather than hard coding it.

**Hero image composition**

Place an art directed cluster of three dimensional booklets on the right on desktop and below the CTA on mobile. The front booklet must use the actual cover of *The First 30 Days in Your New Home*. Fan the remaining booklets behind it. Add a small, grounded still life nearby: keys, a house plan, a pencil, and a clipped checklist. Preserve a clean visual path from headline to CTA to booklets.

### 3. Reframe the problem

Use an editorial two column section, with a simple house outline or the first guide open to its checklist on the visual side.

**Heading**

`Closing gives you the keys.`

`It does not give you a plan.`

**Body**

`The first weeks of homeownership are full of small decisions that matter: what to secure, what to photograph, what to maintain, and what to keep for later. The system puts those decisions in one clear order.`

Show five numbered homeowner jobs in the sage, ruled list style from the guide:

1. Set up your home after closing
2. Maintain the systems you rely on
3. Protect your household and records
4. Budget for routine costs and repairs
5. Improve your home with a plan

### 4. Tagline reveal

This must be a separate oversized pause in the story. Reveal its words in reading order as it enters the viewport, respecting reduced motion.

`A calmer first year starts with knowing`

`what matters now and what can wait.`

### 5. Benefits: show the outcome, not a feature inventory

Display four benefits in a two by two grid with a line icon and a concise detail. Cards are paper surfaces with a full subtle border and no heavy shadow.

| Benefit | Supporting copy | Visual |
| --- | --- | --- |
| **Start with the essentials** | Secure access, find shutdowns, record your baseline, and catch small problems early. | First 30 Days booklet, open to the priorities spread. |
| **Keep the year on track** | Turn recurring maintenance into a practical rhythm instead of a vague intention. | Maintenance system booklet and seasonal tracker. |
| **Make records useful** | Keep warranty, appliance, emergency, and service information ready when you need it. | Emergency binder and records organizer. |
| **Make expensive decisions with context** | Plan repairs, compare contractors, and scope renovations before you commit. | Budget, contractor, and renovation booklets. |

### 6. What is inside: complete set shelf

This is the central product demonstration. Show all eight guides as individual three dimensional booklet covers in a responsive shelf or staggered eight card grid. Do not replace these with generic cards. Each guide is a physical looking product and its cover is evidence that the set is real.

Use the guide title, one sentence description, included file types, and live price from `src/lib/catalog.ts`. Keep the displayed order aligned to the homeowner journey:

| Guide | Job | Contents label |
| --- | --- | --- |
| First 30 Days in Your New Home | Set up | PDF guide + editable checklist |
| First Year Home Maintenance System | Maintain | PDF guide + maintenance tracker |
| Home Safety and Emergency Binder | Protect | PDF binder + editable worksheet |
| Home Records and Warranty Organizer | Protect | PDF organizer + warranty tracker |
| Homeowner Budget and Repair Planner | Budget | PDF planner + budget workbook |
| Contractor Hiring and Home Repair Toolkit | Improve | PDF toolkit + project workbook |
| Home Renovation and Improvement Planner | Improve | PDF planner + renovation workbook |
| Seasonal Home Care Pack | Maintain | PDF guide + seasonal tracker |

Above the shelf, use this copy:

**Heading:** `Everything you need for the work that comes with a home.`

**Body:** `The complete set follows the actual order of homeownership, from the first day through your first year and the projects after that.`

Below it, make the complete set card visually decisive:

`The Complete New Homeowner System`

`8 guides. Editable companions. One practical system.`

`Get the complete set for $69`

### 7. How it works

Use three visually connected steps, echoing the clarity of ToonBee’s numbered explainer but expressed in this brand’s calm manual style.

1. **Choose the complete system** — Start with every guide or browse individual modules if one task is urgent.
2. **Pay securely** — Confirm your email and complete checkout.
3. **Use the guide in front of you** — Receive your secure access route after payment confirmation, then print, save, or work through the editable companion.

Pair each step with a framed product image: booklets, checkout confirmation, then an open checklist on a desk. Do not use logos or payment claims beyond the current checkout implementation.

### 8. Value comparison

Create a calm pricing comparison, not an aggressive discount table. Contrast a stacked list of individual guides with one complete system card.

| Individual guides | Complete system |
| --- | --- |
| Choose only the task in front of you | Get the complete homeowner reference library |
| $143 when all current guides are purchased separately | $69 for all 8 guides and editable companions |
| Best for one immediate need | Best for a new homeowner building a dependable system |

The exact total and savings must always be calculated from the live catalog. If a price changes, the comparison changes with it.

### 9. Proof and practical preview

Use product proof that can be shown honestly:

- An interactive flip through or a static three spread preview from *First 30 Days in Your New Home*: cover, first month priorities, and first 24 hours checklist.
- A small caption: `Designed as practical guides you can use at the kitchen table, not generic reading material.`
- A compact content callout: `Eight focused guides. Eight editable companions.`

Do not add testimonials until genuine permissioned customer feedback exists. When available, place named quotes next to the specific guide they validate rather than in a disconnected carousel.

### 10. FAQ and risk clarity

Use native accessible disclosure controls. Questions and draft answers:

**What is included in the complete set?**

All eight active homeowner guides shown on the page, each with its listed editable companion.

**Can I buy one guide instead?**

Yes. The guide catalog lets you choose the module that fits the task in front of you.

**When do I receive my files?**

Delivery begins after payment confirmation. The confirmation page and email provide the secure access route.

**Are these guides right for a home I have owned for years?**

Yes. The first month guide is especially useful after closing, while maintenance, records, emergency, repair, contractor, renovation, and seasonal guides support ongoing ownership.

**Can I print the guides?**

State the actual usage terms here after confirming them. Do not imply unlimited commercial rights.

**What if I need support?**

Link to the live support channel and current response expectation.

**What happens if I need a refund?**

Link to the live refund policy. Do not summarize policy terms unless the legal copy is approved.

### 11. Final CTA and footer

Repeat the hero CTA exactly: **Get the complete set for $69**. Pair it with the full eight booklet cluster, a short reminder of what is included, and links to delivery, refund, privacy, terms, and support.

## Three dimensional booklet cover system

### Required assets

Create an asset manifest before implementation. The PDF’s first page is the source of truth for each booklet front cover. Never redraw its title, invent a different cover, or put a fake cover inside a generic product mockup.

| Asset | Source | Use |
| --- | --- | --- |
| `first-30-days-cover` | Page 1 of `first-month-home-setup-checklist.pdf` | Hero front booklet and product shelf |
| Seven remaining guide covers | Page 1 of each published guide PDF | Product shelf and category sections |
| `first-30-days-priorities-spread` | Page 2 of the first month PDF | Benefit proof and preview |
| `first-24-hours-spread` | Page 3 of the first month PDF | Problem section and preview |
| Household still life photographs | Purpose shot or licensed, warm natural light photography | Hero and section transitions |

Export covers at high resolution and preserve their portrait ratio. Serve responsive AVIF or WebP derivatives with original width and height declared to prevent layout movement. Use the PDF page only where its terms permit web display; otherwise create approved cover exports from the source design file.

### Booklet treatment

- Make each cover a thin portrait booklet, not a thick hardback book.
- Use a subtle 6 to 10 degree Y rotation and a very small X rotation for the hero stack; keep the front cover readable.
- Add a narrow, softly shaded page block and a darker paper spine whose title is readable only when large enough.
- Use a soft contact shadow directly underneath. The booklet should feel set on paper, not floating in space.
- Keep cover art flat and sharp. Never warp the typography, crop the title, or overlay another gradient on it.
- On hover, lift the booklet only slightly and bring its title card into focus. On tap, open the guide preview or move keyboard focus to its linked details.
- Respect `prefers-reduced-motion`: show a stable stack with no parallax or tilt.

### Image direction

Use images to answer “what will this feel like to own?” Every image should contain a useful domestic cue: keys at a counter, a page marked with a pencil, a homeowner filing a warranty, an open electrical panel only where safety context is clear, or a seasonal maintenance task.

Do not use images of homes merely as wallpaper. Each photo must either explain a homeowner moment or give the books a believable physical setting. Provide descriptive alt text for every meaningful image; mark decorative leaf and sun motifs as decorative.

### Suggested hero art direction prompt

Use this only to commission a supporting still life or generate a background photo. Do not use it to regenerate the actual guide cover.

`Editorial still life for a practical new homeowner guide, warm cream paper surface, front facing blank space reserved for a real booklet cover, brass keys, simple house plan, pencil, clipped checklist, small ceramic planter with olive branches, natural window light, quiet lived in mood, muted olive and terracotta palette, tactile paper grain, photorealistic, no text, no logos, no laptop, no glossy commercial styling.`

## Build requirements

### Layout and responsive behavior

- Design mobile first. On narrow screens the headline, CTA, proof line, and front booklet must remain visible before secondary imagery.
- Use a single predictable content container. Do not allow horizontal overflow from the booklet shelf or stack.
- Preserve 44 by 44 pixel minimum touch targets and at least 8 pixels between neighboring controls.
- Keep body copy at 16 pixels or larger and cap paragraph measure around 65 to 75 characters on desktop.
- Use consistent spacing tokens: 0, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, and 96 pixels.
- Use only fully bounded card borders. Use flat background colors, never background gradients.

### Interaction and motion

- Use one primary CTA treatment throughout.
- Give interactive controls distinct hover, pressed, disabled, loading, error, and visible keyboard focus states.
- Reveal large sections with transform and opacity only, using `IntersectionObserver` or viewport based motion. Do not attach unthrottled scroll handlers.
- For the hero stack, use gentle physical movement only. It must support reduced motion and must never block text or the CTA.
- The tagline reveal activates each word in reading order from muted ink to full ink. It is a content moment, not decorative noise.

### Accessibility

- Use semantic `nav`, `main`, `section`, and ordered list markup where the narrative is ordered.
- Include a skip link, sequential heading levels, keyboard reachable product previews, and a visible focus indicator with sufficient contrast.
- Every meaningful booklet image needs alt text that names the guide and states that it is a 3D booklet cover. Example: `3D booklet cover for First 30 Days in Your New Home, showing two people carrying moving boxes through a front door.`
- Do not make color the only indicator of selected guide, price, status, or error.
- FAQ controls must announce their expanded state.

### Performance

- Load the hero booklet cover with a high priority only when it is the actual LCP image. Lazy load all other covers and preview spreads.
- Reserve image dimensions and stack aspect ratios to eliminate layout shift.
- Generate multiple responsive cover sizes. Keep the visual cluster as static markup rather than a heavy canvas or WebGL scene.
- Defer nonessential animation code and third party scripts.

### SEO and metadata

This is an evergreen product page and should be indexable.

**Title:** `Complete New Homeowner System | Practical Guides for Your First Year`

**Meta description:** `Get eight practical homeowner guides and editable companions for setting up, maintaining, protecting, budgeting, and improving your home.`

Add an `og:image` made from the actual cover stack, a canonical URL, Product structured data using the live price, and FAQ structured data only when the visible answers are identical to the markup. Keep FAQ answers in plain HTML as well.

## Implementation order and acceptance checklist

Build in this order so the page earns attention before details:

1. Theme tokens, typography, navigation, and hero with the real first month cover.
2. Problem reframe, tagline reveal, and outcome based benefits.
3. Full eight guide booklet shelf and complete set value card.
4. How it works, preview, FAQ, final CTA, and legal footer.
5. Keyboard, mobile, reduced motion, contrast, image weight, and price data QA.

The page is ready to ship only when:

- The front booklet uses the real first month cover and every catalog guide has its own recognizable cover.
- A visitor can understand the outcome, contents, price, and next action without scrolling through a generic product grid.
- Live catalog data drives prices, guide count, titles, descriptions, and included files.
- Every primary CTA points to the complete set checkout state.
- No unverified testimonials, deadlines, guarantees, or performance claims appear.
- The page is usable with keyboard, screen reader, touch, reduced motion, and a narrow mobile viewport.
- The visual system still feels like the source guide: warm paper, editorial typography, sage structure, terracotta action, domestic photography, and a calm practical voice.
