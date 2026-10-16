# MONETIZATION.md — How Qalam can pay for itself

*Research pass: 2026-10-16. Prices cited were live on the linked pages at that date.*

## خلاصه اجرایی (فارسی)

قلم امروز یک اپلیکیشن کاملاً سمت‌کلاینت است: بدون سرور، بدون تلمتری، با هوش مصنوعی روی دستگاه یا کلید خود کاربر. این معماری بزرگ‌ترین مزیت رقابتی (حریم خصوصی، آفلاین، بدون حساب) و بزرگ‌ترین محدودیت درآمدی است. به‌دلیل تحریم‌ها، دریافت پول بین‌المللی (Stripe، Paddle، PayPal) برای توسعه‌دهنده مستقر در ایران ممکن نیست؛ درآمد داخلی از طریق زرین‌پال و درآمد بین‌المللی از راه رمزارز یا همکار خارج از کشور قابل حصول است. توصیه اصلی: **هسته رایگان بماند؛ درآمد از همگام‌سازی/همکاری تیمی (سرور اختیاری، مدل open-core)، لایسنس یک‌باره نسخه دسکتاپ (مدل Typora) و قرارداد سفارشی/سفید‌برچسب برای سازمان‌های ایرانی** تأمین شود. سرویس AI سمت سرور *نه* — نه به‌خاطر فنی، بلکه به‌دلیل نقض وعده حریم خصوصی و ریسک تحریمی پرداخت به OpenAI/Anthropic از ایران.

---

## 1. What Qalam is today (the constraints that decide everything)

- **100% client-side.** Static files on GitHub Pages; no backend, no accounts, no telemetry ([README](https://github.com/amirkabiri/qalam#why-qalam)). Documents live in IndexedDB; sharing is via self-contained `#d=` URL-fragment links that never touch a server.
- **AI is user-supplied**: on-device Gemini Nano, or the user's own OpenAI/Anthropic-compatible endpoint with their token. Qalam never pays for inference; it never sees a token.
- **MIT-licensed, public repo.** Anyone can fork and self-host a copy right now.
- **Positioned "collaborative"**, but real-time collaboration doesn't exist yet — share links are static snapshots, and multi-tab sync is per-device.
- **Solo maintainer, Iran-based.** This determines the payment surface (§2), not just the marketing.

Any monetization model must answer: *what does the customer pay for when the app itself is free, offline, private, and forkable?* The answer can only be **hosted services, convenience, licenses, or relationships** — never core features behind a client-side paywall.

## 2. The payment reality (both directions)

**Outbound (Qalam as a buyer) — sanctions constrain infrastructure:**
- Stripe, PayPal and Paddle do not operate for Iran-based merchants; Paddle explicitly lists Iran as unsupported ([Paddle supported countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle)). Lemon Squeezy's payout-country list similarly excludes sanctioned jurisdictions ([docs](https://docs.lemonsqueezy.com/help/getting-started/supported-countries)).
- Paying US AI providers (OpenAI/Anthropic) directly from Iran is sanction-exposed; Iranian engineers widely document being cut out of the global digital economy ("DELETE FROM users WHERE location = 'IRAN'" — [Gigazine writeup](https://gigazine.net/gsc_news/en/20250924-iran-user-sanctions/), [IranWire](https://iranwire.com/en/features/141824-islamic-republics-policies-leave-citizens-illegitimate-in-global-digital-economy/)).
- Iranian users themselves routinely need workarounds (gift cards, VPNs, third-party app stores) even to *buy* foreign software ([ACM IMC 2026 study on Iranian iOS app stores](https://dl.acm.org/doi/10.1145/3777912.3839789); [France24 on payment blockers](https://www.france24.com/en/live-news/20210217-we-just-want-to-play-iran-gamers-battle-reality-of-us-sanctions)).

**Inbound (Qalam as a seller):**
- **Domestic (rial):** Zarinpal is the standard Iranian gateway and has developer SDKs ([zarinpal.com](https://github.com/zarinpal), [zarinpal-js](https://github.com/jnjal/zarinpal-js)). This is the frictionless channel for an Iranian audience — no sanctions exposure on either side.
- **International:** realistically crypto (USDT/BTC) or a trusted non-Iranian intermediary/co-founder holding a merchant account. Merchant-of-record platforms won't onboard an Iran-based seller.

**Consequence:** any revenue model must work with **two payment rails** (Zarinpal for Iran, crypto/intermediary for abroad) and must **not** depend on Qalam paying recurring USD bills (LLM inference, US-hosted cloud) that are themselves hard to pay.

## 3. How comparable products monetize

| Product | Core price | What's paid | Model | Source |
| --- | --- | --- | --- | --- |
| **Notion** | Free; Plus ~$10/seat/mo; Business ~$20/seat/mo | Server, collaboration, admin; AI now bundled into paid tiers (standalone $8–10 AI add-on retired May 2025) | Freemium SaaS | [notion.com/pricing](https://www.notion.com/pricing), [AI pricing analysis](https://dev.to/stimlau/notion-ai-pricing-explained-is-the-add-on-worth-it-in-2026-7hh) |
| **Obsidian** | App free, no account; Sync $4/user/mo; Publish $8/site/mo; Catalyst $25 one-time; Commercial license $50/user/yr (encouraged, not required) | Sync & publish *services*, early access, goodwill | Free app + paid services + patronage | [obsidian.md/pricing](https://obsidian.md/pricing) |
| **Typora** | **$14.99 one-time**, 3 devices, no subscription | The editor itself | One-time license | [store.typora.io](https://store.typora.io/), [purchase FAQ](https://support.typora.io/purchase/) |
| **iA Writer** | $29.99–49.99 one-time per platform | The app | One-time license | [ia.net/writer/pricing](https://ia.net/writer/pricing) |
| **HackMD** | Free (up to 3 teammates); paid personal/team tiers | Hosted collaboration at scale | Freemium hosted | [hackmd.io/pricing](https://hackmd.io/pricing) |
| **HedgeDoc** (CodiMD) | Free, AGPL, self-host | Nothing — community project | Open source, no monetization | [hedgedoc.org](https://hedgedoc.org/) |
| **Standard Notes** | Free; paid "Productivity" plan (under Proton) | Extended editors, sync features | Freemium + subscription | [standardnotes.com/plans](https://standardnotes.com/plans), [2025 update](https://www.reddit.com/r/ProtonMail/comments/1pl04uq/standard_notes_2025_update_whats_new_and_whats/) |
| **Joplin** | Apps free (unlimited sync via own WebDAV/S3); Joplin Cloud paid; commercial self-host server sold | Managed hosting / self-host server license | Open-core services | [joplinapp.org/plans](https://joplinapp.org/cn/plans), [free-sync analysis](https://freealternatives.to/joplin/free-plan) |
| **Craft** | Free; Plus $8/mo; Teams $10/user/mo; Business $25/user/mo | Storage, publishing, teams | Freemium SaaS | [craft.do/pricing](https://www.craft.do/pricing) |
| **Bear** | Free; Pro $2.99/mo (sync, themes, export) | Sync + polish | Low-cost subscription | [bear.app FAQ](https://bear.app/faq/features-and-price-of-bear-pro/), [costbench](https://costbench.com/software/note-taking/bear) |
| **Reflect** | $10/mo billed annually ($120/yr); BYO API key supported | AI features + networked sync | Premium AI subscription | [reflect.app](https://reflect.app/), [review](https://checkthat.ai/brands/reflect) |
| **Sponsorware** (pattern) | Free releases on a schedule; sponsors get new code early | Early access | Patronage | [Caleb Porzio's sponsorware](https://calebporzio.com/sponsorware), [Caddy](https://caddyserver.com/sponsor) |

**Patterns that matter for Qalam:**
1. The most successful local-first apps (Obsidian, Joplin) monetize **optional server services**, not the app.
2. One-time licenses work at low price points (Typora $15, iA $30–50) even though client-side enforcement is weak — buyers pay as much for legitimacy and updates as for the unlock.
3. Free-for-commercial-use + patronage (Obsidian 2025) shows goodwill monetization can sustain a small team, slowly.
4. AI subscriptions (Reflect, Notion AI) price at $8–10/mo but carry real inference costs and — for Qalam — sanction-exposed supplier payments. Not a fit.

## 4. Market

- **Persian/RTL audience:** ~110–130M Persian speakers across Iran, Afghanistan, Tajikistan plus a large diaspora ([MotaWord](https://motaword.com/languages/farsi-persian-website-localization), [market overview](https://aviewfromthecave.com/what-country-speaks-farsi-language)). Persian is ~0.7% of website content languages ([W3Techs](https://w3techs.com/technologies/overview/content_language/all)) — meaning RTL-first tooling is **underserved relative to audience**. Qalam's per-paragraph RTL auto-detection, Vazirmatn, mirrored UI, and Persian AI caveats are genuinely rare in this space; no surveyed competitor leads with RTL.
- **Iran specifically:** ~85M population, young and tech-savvy, but international payment-blocked. Domestic software that respects this (local payment, no foreign account needed) has a structural advantage — Iranian users currently need gift cards and VPNs to pay for Notion/Obsidian Sync at all.
- **Global RTL markets** (Arabic ~25x Persian's speaker count across MENA) are a natural second act once Persian-first UX is proven, with the same underserved-tooling dynamic.

## 5. Ranked monetization strategies

### #1 — Open-core: paid sync/real-time-collab server (self-host license + optional hosted)
**The Typora-of-collaboration, with a Joplin-Server revenue line.** Build real-time collaboration (e.g. Yjs CRDT) as the one big missing feature, ship the server as open-core: free small/self-host instance, paid license for commercial self-hosting (Joplin Server model) and a managed hosted tier later.
- **Effort:** High (the sync/CRDT layer is months of work) — but it is also the product's biggest missing feature, so the work pays twice.
- **Revenue potential:** Highest of any option. Teams pay for collaboration; HackMD charges per-seat for exactly this; Joplin sells the same thing twice (hosted + self-host license).
- **Architecture fit:** Excellent — the app stays client-first; the server is *optional* and can be self-hosted, preserving every promise in the README. Hosting for an Iranian payer is feasible via crypto-billed or domestic VPS.
- **Risks:** CRDT + multi-tab + share-link integration is genuinely hard; support burden; billing the hosted tier internationally.

### #2 — One-time Pro license on a desktop build (Typora/iA model)
Package Qalam (Tauri) as a desktop app; free web app stays fully functional, the paid build adds convenience (auto-update, extra themes/exports, " supporter" status) behind a one-time ~$15–19 license.
- **Effort:** Medium (packaging + license-key flow + dual payment rails).
- **Revenue potential:** Modest but real and immediate; Typora sustains a business at $14.99. Enforcement will be weak (MIT web build remains forkable) — treat it as patronage with a product attached, priced like Typora, not as DRM.
- **Architecture fit:** Excellent — zero change to the web app's promises.
- **Risks:** Piracy (accepted, like Typora's); perceived contradiction with "MIT, free" — mitigate by keeping the web version the flagship and framing the license as supporting development; Zarinpal handles Iran, crypto/intermediary handles abroad.

### #3 — Domestic B2B: white-label / self-hosted deployments for Iranian organizations
Persian-first internal documentation for Iranian companies, universities, and newsrooms — sold as a setup + support contract (Zarinpal/invoice, rial). They get a private, offline-capable, RTL-correct docs tool with their branding; nobody else can sell them Notion cleanly.
- **Effort:** Low-medium (branding config, deployment guide, one or two pilot projects done by hand).
- **Revenue potential:** Each contract can be worth 10–100× a consumer license; the Persian SMB/institution market is reachable *today* with existing code.
- **Architecture fit:** Perfect — the client-only app needs no backend to deploy internally.
- **Risks:** Sales cycle is human-time-expensive for a solo dev; scope creep into custom features.

### #4 — Patronage: GitHub Sponsors + domestic/crypto donations
"Support Qalam" page with three rails: GitHub Sponsors (for the diaspora/global users), Zarinpal (Iran), crypto.
- **Effort:** Very low (days).
- **Revenue potential:** Low initially; Obsidian's "100% user-supported" model shows it can grow into real money with enough users.
- **Architecture fit:** Perfect — no product changes, no promises broken.
- **Risks:** GitHub Sponsors *payouts* require a supported-country bank account — an Iran-based maintainer may be unable to receive them; route through the domestic rails and crypto instead, or via a trusted intermediary.

### #5 — Sponsorware releases
New feature X lands for sponsors first, public release N weeks later (Porzio model). Would apply to the desktop Pro build, not the MIT web core (relicensing the web core to delay releases would burn community trust for little money).
- **Effort:** Low once #2 exists.
- **Revenue potential:** Low-medium; works best with an existing audience.
- **Risks:** Same payout constraints as #4; can create resentment if applied to the open core.

### #6 — Hosted "Qalam Cloud" freemium (Craft/HackMD model) — *later*
Only after #1's sync server exists: hosted free tier (limited docs/collab seats) + paid tiers.
- **Effort:** Very high on top of #1 (ops, backups, billing, support).
- **Revenue potential:** High ceiling, but recurring USD hosting costs paid from Iran are awkward, and competing with Notion on their turf from Iran is fighting uphill twice.
- **Verdict:** the natural *endgame* if #1 succeeds; wrong first move.

### #7 — Server-side paid AI tier — **do not build (now)**
Reflect/Notion charge $8–10/mo for AI, but Qalam's whole differentiator is *your keys, your device, your tokens*. A proxy would add inference cost Qalam must prepay in USD (sanctions-exposed), destroy the privacy story, and put Qalam in a margin war with everyone. BYO-key + on-device is the moat; keep it.

## 6. What NOT to do

1. **Don't put a required backend into the core product.** "No backend, no telemetry, no accounts" is the brand; every competitor survey point above shows local-first apps monetize *optional* services.
2. **Don't proxy or resell AI.** Sanctions-exposed supplier payments from Iran, negative gross margin risk, and it kills the single clearest differentiator.
3. **Don't hard-paywall or DRM the MIT web app.** The source is public; enforcement is impossible; the reputational cost in the exact OSS community Qalam needs is permanent. Sell services, licenses, and relationships around it.
4. **Don't require accounts for anything.** It contradicts the privacy promise and adds a data-protection surface an Iranian-hosted service shouldn't carry.
5. **Don't take Notion-style VC money to chase the global enterprise market.** It forces USD recurring costs, global-billing obligations, and growth metrics Qalam's founder situation can't safely support.
6. **Don't launch a hosted tier before the sync server is proven self-hosted.** Ops burden on a solo dev, billed in a currency that's hard to pay, before demand exists.
7. **Don't hide the Iran payment situation from users.** International buyers accepting crypto will understand; surprise at checkout kills trust faster than any sanction.
8. **Don't monetize the share links** (e.g. expiring server-side links). The self-contained, browser-never-sees-it property is a feature, not upsell fodder.

## 7. Recommended 6-month roadmap

**Months 1–2 — Foundations (no product risk)**
- Add a **"Support Qalam"** page + footer link: Zarinpal (rial), crypto addresses, and — if a payout path exists — GitHub Sponsors. Ship even if amounts are trivial; it measures willingness to pay for free.
- Publish a **pricing intentions page** ("Qalam core is and stays free; paid things will be services") to set expectations before any paid thing exists.
- Start the **CRDT/real-time-collab spike** (Yjs vs. others) behind a flag; decide the sync-server architecture (the prerequisite for strategies #1 and #6).

**Months 2–4 — The big build + first revenue**
- Implement **real-time collaboration against an optional self-host server** (open-core repo). Keep the web app fully usable without it.
- Package the **Tauri desktop build**; stand up license-key generation and the Zarinpal checkout; open **early Pro pre-orders** at founder pricing (~$15) to validate willingness to pay before polishing.
- Run the first **white-label conversation** with 1–2 Iranian organizations (pitch: private, offline-capable, Persian-first internal docs).

**Months 4–6 — Launch and iterate**
- **Launch Qalam Pro desktop** ($15–19 one-time) on both payment rails.
- Ship **collab v1** with a public self-host quickstart; open a **paid commercial self-host license** for organizations (Joplin-style pricing, invoice/rial/crypto).
- Close the first **white-label pilot**; use it as the case study for domestic B2B.
- Re-evaluate **Qalam Cloud hosted** only if self-host adoption demonstrates demand; otherwise keep investing in Pro + B2B.

**Success metrics for the 6 months:** ≥1 white-label contract signed; Pro conversion ≥1% of active users; self-host server with ≥10 external deployments; donations covering at least hosting costs. If Pro underperforms but B2B pulls, follow the money — Iranian organizations are the highest-willingness-to-pay segment reachable without solving international billing.

---

## Sources

- Notion pricing & AI bundling: [notion.com/pricing](https://www.notion.com/pricing) · [dev.to analysis](https://dev.to/stimlau/notion-ai-pricing-explained-is-the-add-on-worth-it-in-2026-7hh)
- Obsidian pricing (verified 2026-10): [obsidian.md/pricing](https://obsidian.md/pricing) · [2026 analysis](https://www.usecarly.com/blog/obsidian-pricing/)
- Typora one-time license: [store.typora.io](https://store.typora.io/) · [purchase FAQ](https://support.typora.io/purchase/)
- iA Writer: [ia.net/writer/pricing](https://ia.net/writer/pricing)
- HackMD: [hackmd.io/pricing](https://hackmd.io/pricing) · HedgeDoc: [hedgedoc.org](https://hedgedoc.org/)
- Standard Notes: [standardnotes.com/plans](https://standardnotes.com/plans) · Joplin: [joplinapp.org/plans](https://joplinapp.org/cn/plans) · [free-sync note](https://freealternatives.to/joplin/free-plan)
- Craft: [craft.do/pricing](https://www.craft.do/pricing) · Bear: [bear.app FAQ](https://bear.app/faq/features-and-price-of-bear-pro/) · Reflect: [reflect.app](https://reflect.app/)
- Sponsorware pattern: [Caleb Porzio](https://calebporzio.com/sponsorware) · [Caddy](https://caddyserver.com/sponsor)
- Iran payments/sanctions: [Paddle unsupported countries](https://www.paddle.com/help/start/intro-to-paddle/which-countries-are-supported-by-paddle) · [Lemon Squeezy countries](https://docs.lemonsqueezy.com/help/getting-started/supported-countries) · [IranWire on exclusion from digital economy](https://iranwire.com/en/features/141824-islamic-republics-policies-leave-citizens-illegitimate-in-global-digital-economy/) · [Gigazine / Iranian engineer account](https://gigazine.net/gsc_news/en/20250924-iran-user-sanctions/) · [ACM IMC 2026 Iranian app-store study](https://dl.acm.org/doi/10.1145/3777912.3839789) · [France24](https://www.france24.com/en/live-news/20210217-we-just-want-to-play-iran-gamers-battle-reality-of-us-sanctions)
- Zarinpal: [zarinpal.com](https://www.zarinpal.com) · [zarinpal-js SDK](https://github.com/jnjal/zarinpal-js)
- Market size: [Persian speakers ~110M+](https://motaword.com/languages/farsi-persian-website-localization) · [W3Techs Persian web share](https://w3techs.com/technologies/overview/content_language/all)
