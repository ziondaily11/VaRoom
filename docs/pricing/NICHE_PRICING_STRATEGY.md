# VaRoom Pricing Strategy: Short-Stay Rentals, Hotels and Event Venues

As of 2026-11-04

## Summary

**Recommendation: charge each niche its own monthly subscription now, then add a booking commission once guests can pay through VaRoom.** That commission is 10%, or 5% for subscribers. Today all three niches share one generic KES 800–1,800 plan set that ignores how each one earns money. Guests also pay hosts off-platform, so a commission cannot be collected yet.

| Niche | What the plan scales on | Plans (KES / month) | Later: commission on VaRoom-paid bookings | Why |
| --- | --- | --- | --- | --- |
| Airbnbs / short-stay | Active listings (2 / 6 / 15) | 1,500 / 3,500 / 7,500, plus KES 1,000 pay-as-you-list | 10%, or 5% for subscribers | Average Nairobi listing earns KES 76,000 a month; Airbnb takes 15.5% |
| Hotels | Rooms (≤20 / 21–60 / 61+), plus dining-only | 2,000 dining; 4,000 / 8,000 / 15,000 | 10%, or 5% for subscribers | Hotels pay OTAs 15–22% and run at 26–31% occupancy |
| Event venues | Bookable spaces (2 / 5 / 12) | 2,500 / 5,000 / 10,000, or commission-only | 10% commission-only; 5% for subscribers, taken from the deposit | Hire is KES 30,000–250,000 with a 25–50% deposit; Tagvenue and Hire Space charge 10–15% |

What to do next:

- **First: launch the niche plans.** They reuse the billing and Paystack plumbing built for Property and Shops & Offices.
- **Second: build venue deposit checkout.** Venues give the best commission margin (about KES 7,640 kept on a KES 80,000 booking).
- **Third: extend checkout to short-stays and hotels.**

## Where VaRoom stands today

Airbnb, hotel and event-venue hosts are still on the generic "legacy" plans from the first billing release. These plans have no listing caps and no niche-specific value. The Property and Shops & Offices niches already have their own priced plans. All billing runs in KES through Paystack, and guests do not pay through VaRoom.

| Who | Plan | Price (KES / month) | What it unlocks |
| --- | --- | --- | --- |
| Airbnb, hotel, venue hosts | Basic | 800 | Core host tools, limited storage |
| Airbnb, hotel, venue hosts | Growth | 1,300 | Video listings, shown to clients in the niche |
| Airbnb, hotel, venue hosts | Pro | 1,800 | Elie, Marketplace and Discover showcase |
| Property, Shops & Offices | Basic / Pro / Premium | 3,000 / 6,000 / 12,000 | 5 / 12 / 20 active listings |
| Property, Shops & Offices | Pay-as-you-list | 1,000 per listing, one-off | One listing live for 30 days |

What the code shows, and why it shapes the recommendation:

- **No guest payments.** Booking pages connect guests to hosts by WhatsApp, email and phone. Guests pay hosts off-platform. A booking commission cannot be collected today without building guest checkout and host payouts first.
- **One niche per host.** Each host picks exactly one niche (`airbnb`, `hotel`, `venue`, `office`, `shop`, `property`). Plans are already keyed by niche, so each of the three niches can get its own plan set without schema redesign.
- **Usable pricing units.** Listings already support `night`, `day`, `hour` and `week` prices, and hotels can take table reservations. These are the hooks a later booking fee would attach to.
- **Monthly only.** Yearly prices are not defined yet; the pricing page hides the yearly toggle until every plan has one.

Code references: `server/migrations/20260920_000016_host_billing.sql`, `server/migrations/20261010_000035_property_shops_monetization.sql`, `server/routes/billingRoutes.js`, `client/lib/billing/pricing.ts`.

## Market benchmarks

Global platforms that handle guest payment take 10–25% of each booking. Platforms that only list and pass on leads charge a flat fee instead. Kenyan sites charge flat listing or boost fees, and I found no Kenyan rival that publishes a booking commission.

| Platform | Niche | How it charges | Rate |
| --- | --- | --- | --- |
| [Airbnb](https://www.hostfully.com/blog/airbnb-host-fees/) | Short-stay | Host-only fee, mandatory for non-EU hosts (Kenya included) from 15 Sep 2026 | 15.5% of booking subtotal |
| [Booking.com](https://www.guesty.com/blog/how-much-does-booking-com-charge-hosts) | Hotels, short-stay | Commission + payments fee | 10–25% (avg ~15%) + 1.1–3.1% |
| [Booking.com / Expedia, Africa](https://kolonell.com/en/blog/boutique-hotel-africa-direct-vs-bookingcom-2026) | Boutique hotels | Effective commission | ~22% average |
| [Tagvenue](https://www.tagvenue.com/page/list-your-venue) | Event venues | Commission on confirmed bookings, no listing fee | 10–15% |
| [Hire Space](https://help.hirespace.com/when-does-commission-apply) | Event venues | Commission on leads it sources + optional [annual plans](https://hirespace.com/for-venues) | 10%; plans £1,950–4,800/yr |
| [Giggster](https://help.giggster.com/en/articles/2832062-how-much-commission-does-giggster-take) | Event / shoot venues | Commission from host payout | 19% |
| [Peerspace](https://www.peerspace.com/legal/terms/fees-overview) | Event venues | Host fee + guest fee, free to list | % not published |
| [WeddingWire / The Knot](https://planning.wedding/weddingwire-listing-cost) | Wedding venues | Lead subscription (estimates) | ~$50–1,200+/month |
| [SiteMinder](https://www.roommaster.com/blog/siteminder-pricing) | Hotels (software) | Monthly by room band | ~$34–200/month (≈ KES 4,400–25,800) |
| [Google Hotel Ads](https://www.mews.com/en/blog/google-hotel-ads-bidding) | Hotels | Cost-per-click only; pay-per-stay ended 20 Feb 2025 | Auction |
| BuyRentKenya | Property | One-off listing and boost fees (search snippet; page blocked) | KES 1,500–20,000 |

The Kenyan market these numbers sit in:

- **Short-stay (Nairobi, Sep 2025–Aug 2026):** 6,535 active listings, 43% occupancy, KES 5,714 a night, about KES 910,000 a year per listing ([Airbtics](https://airbtics.com/annual-airbnb-revenue-in-nairobi-kenya/)). Kenya-wide supply grew 40.75% in 2025 ([Airbtics](https://airbtics.com/short-term-rental-market-report-2025-kenya)).
- **Hotels:** room occupancy ran 25.6–31.1% in Sep–Dec 2024 ([KNBS via The Star](https://www.the-star.co.ke/news/2025-05-09-report-monthly-hotel-room-occupancy-rates-declines)). No current Kenyan hotel room rate could be verified.
- **Venues (Nairobi):** daily hire runs KES 30,000–250,000, with a 25–50% booking deposit ([Jumuika](https://jumuika.co.ke/commercial-property-for-rent/nairobi/conference-facility)). Museum spaces hire at KES 35,000–80,000 ([National Museums](https://museums.or.ke/venue-hire-nairobi-museums/)).

USD figures are converted at about KES 129 per dollar, the rate implied by Airbtics' own KES and USD figures.

## Niche 1: Airbnbs and short-stay rentals

**Recommendation: three subscription plans priced by listing count, plus the existing pay-as-you-list option.** Add a 10% booking commission (5% for subscribers) once guests can pay through VaRoom.

A Nairobi listing earns about KES 76,000 a month (KES 910,000 a year). Airbnb now takes 15.5% of that, about KES 11,800. VaRoom can win hosts by costing a small fraction of Airbnb's fee and selling direct, commission-free guest contact.

| Plan | KES / month | Active listings | Includes | Cost as % of one listing's revenue |
| --- | --- | --- | --- | --- |
| Starter | 1,500 | Up to 2 | Core tools, analytics, WhatsApp/phone contact | 2.0% |
| Pro | 3,500 | Up to 6 | + video listings, niche showcase, promotion eligibility | 4.6% (0.8% per listing at 6) |
| Business | 7,500 | Up to 15 | + Elie, Marketplace and Discover showcase | 9.9% (0.7% per listing at 15) |
| Pay-as-you-list | 1,000 one-off | 1 listing for 30 days | Core tools | 1.3% |

Why this shape:

- **Listing count is the value driver.** Many Kenyan short-stay operators run several units, and supply grew 40.75% in 2025. Caps make bigger operators pay more, as the Property niche already does.
- **Starter pays back on one night.** One extra booked night (KES 5,714) covers Starter almost four times.
- **Pay-as-you-list catches casual hosts.** A single-unit host who lists seasonally will not commit to a monthly plan. The KES 1,000 one-off already exists in code for Property and Shops & Offices, so it needs only to be enabled for `airbnb`.
- **Commission waits for checkout.** Guests pay hosts directly today, so VaRoom cannot see or collect a booking fee. At 10% (5% for subscribers), a later commission still undercuts Airbnb's 15.5%.
- **Registration is a selling point.** The Tourism Regulatory Authority requires short-stay hosts to register, and platforms are expected to restrict unregistered listings ([The Star](https://www.the-star.co.ke/news/2024-01-15-explainer-how-to-register-and-operate-a-licenced-airbnb)). A "TRA-registered" badge on Pro and Business plans adds trust at no cost to VaRoom.

## Niche 2: Hotels

**Recommendation: price hotel plans by room count, not listing count, and add a cheaper dining-only plan.** Add a 10% booking commission (5% for subscribers) once guest checkout exists. That is well under the 15–22% hotels pay Booking.com and Expedia.

A hotel is usually one listing with many rooms, so listing caps do not separate a 12-room guest house from a 150-room hotel. Hotel software is already sold by room band (SiteMinder, about KES 4,400–25,800 a month), so hotels will recognise the model.

| Plan | KES / month | Rooms | Includes |
| --- | --- | --- | --- |
| Dining | 2,000 | None (restaurant only) | Table reservations, menu, analytics |
| Boutique | 4,000 | Up to 20 | Stays + table reservations, video, analytics |
| Hotel | 8,000 | 21–60 | + niche showcase, promotion eligibility |
| Hotel Plus | 15,000 | 61+ | + Elie, Marketplace and Discover showcase |

Why this shape:

- **Occupancy is the hotel's pain.** Kenyan hotel occupancy ran 25.6–31.1% in late 2024. Hotels buy anything that fills empty rooms more cheaply than OTAs.
- **One booking pays the month.** Assuming a KES 8,000 room-night (no verified Kenyan rate exists; this is an assumption), Boutique pays for itself after one room-night. Hotel pays back after one booking of two nights.
- **The direct-booking pitch.** OTAs take 15–22% per booking; VaRoom takes a flat monthly fee and the guest contacts the hotel directly. At the 22% African average, one three-night booking (KES 24,000) costs a hotel KES 5,280 in OTA commission, more than a month of Boutique.
- **Dining-only hotels exist in the product.** Listings can offer table reservations without stays, and those hotels get less value. A lower Dining plan keeps them paying instead of leaving.

What the code needs: a `room_count` (or room band) on hotel listings, declared by the host and checked by an admin, and plan limits keyed on rooms rather than `max_active_listings`.

## Niche 3: Event venues

**Recommendation: a subscription priced by number of bookable spaces, then a 10% booking commission collected from the deposit.** Venues are the first niche where VaRoom should take payments on-platform, because deposits are already normal and the tickets are large.

Nairobi venues hire at KES 30,000–250,000 a day and take a 25–50% deposit. Venues book a few high-value events a month rather than many cheap nights. A flat fee of KES 800–1,800 captures almost none of that value, while a 10% commission matches Tagvenue and Hire Space and undercuts Giggster's 19%.

| Plan | KES / month | Bookable spaces | Includes | Commission on VaRoom-paid deposits |
| --- | --- | --- | --- | --- |
| Venue | 2,500 | Up to 2 | Core tools, availability calendar, analytics | 5% |
| Venue Pro | 5,000 | Up to 5 | + video, niche showcase, promotion eligibility | 5% |
| Venue Premium | 10,000 | Up to 12 | + Elie, Marketplace and Discover showcase | 5% |
| Commission only | 0 | Up to 2 | Core tools | 10% |

Why this shape:

- **Deposits make collection practical.** The guest pays the 25–50% deposit through VaRoom by M-Pesa or card. VaRoom keeps its commission from the deposit and passes the rest to the venue through a Paystack split. The balance is still paid to the venue directly.
- **Commission is charged on the full hire value.** A 10% fee on an 80,000 booking is 8,000, which fits inside even a 25% deposit of 20,000.
- **Commission-only lowers the barrier.** A venue with no plan pays nothing until it gets a booking, matching Tagvenue's "no listing fees, ever" pitch. Subscribers pay half the commission, so busy venues are better off subscribing.
- **Wedding and conference venues buy leads.** Wedding directories abroad charge US$50–1,200+ a month for listings. Venue Premium at KES 10,000 (about US$78) is at the low end of that range.

What the code needs: venue listings with multiple spaces, a deposit checkout on the booking page, Paystack subaccounts for venues, and a commission ledger. None of this exists today.

## Payments, fees and unit economics

**Paystack can run every part of this model, but VaRoom pays its fees out of its own cut by default.** M-Pesa costs 1.5% and local cards 2.9%. On a card-paid hotel booking at the 5% subscriber rate, fees take more than half of VaRoom's cut.

### What a short-stay host pays each month

For one Nairobi listing earning the average KES 76,000 a month (commission rows assume every booking is paid through that platform):

| Option | KES / month |
| --- | --- |
| Airbnb (15.5% host fee) | 11,780 |
| Booking.com (~15% average) | 11,400 |
| VaRoom commission only (10%) | 7,600 |
| VaRoom Starter + 5% commission | 5,300 |
| VaRoom Starter, direct contact (today's model) | 1,500 |

Even with a commission, VaRoom costs a host about half of what Airbnb charges.

### Paystack Kenya costs ([pricing](https://paystack.com/ke/pricing))

| Item | Cost |
| --- | --- |
| M-Pesa collection | 1.5% |
| Local card | 2.9% |
| International card | 3.8% |
| Payout to M-Pesa | KES 20–60 |
| Payout to bank | KES 80–350 |
| Settlement | T+2 working days |

- **Splits:** a host becomes a Paystack subaccount; VaRoom sets its share as a percentage or flat `transaction_charge`, and Paystack settles the rest to the host ([docs](https://paystack.com/docs/payments/split-payments/)).
- **Who pays the Paystack fee:** VaRoom by default. Setting `bearer: "subaccount"` moves it to the host.
- **Subscriptions are card-only.** Paystack's recurring plans charge saved cards; the docs do not mention M-Pesa ([docs](https://paystack.com/docs/payments/subscriptions/)). Many Kenyan hosts pay by M-Pesa, so offer prepaid M-Pesa months and an annual prepay of 10 months' price for 12.

### Worked examples (phase 2, guest pays through VaRoom)

| Niche | Booking | Paid via VaRoom | Commission (10%) | Paystack fee | VaRoom keeps | Host receives now |
| --- | --- | --- | --- | --- | --- | --- |
| Short-stay | 3 nights × KES 5,714 = 17,142 | 17,142 by M-Pesa | 1,714 | 257 | 1,457 | 15,428 |
| Hotel | 3 nights × KES 8,000 (assumed) = 24,000 | 24,000 by card | 2,400 | 696 | 1,704 | 21,600 |
| Event venue | KES 80,000 hire | 24,000 deposit (30%) by M-Pesa | 8,000 | 360 | 7,640 | 16,000 (56,000 later, direct) |

At the 5% subscriber rate, a card-paid hotel booking leaves VaRoom 504 of 1,200 after fees. Venues give the best margin, because the fee is charged on the full hire but card and M-Pesa costs apply only to the deposit.

## Risks, open questions and rollout

**Launch the new subscription plans first, because they need no new payment infrastructure.** Add commissions only after guest checkout is built, starting with venues.

### Rollout

1. **Niche plans.** Add `airbnb`, `hotel` and `venue` plan rows to `billing_plans`. Route those niches to their own plans instead of `legacy` in `billingRoutes.js`, and enable pay-as-you-list for `airbnb`. Add a room-count field for hotels and a space count for venues.
    - Gate: existing legacy subscribers keep their current price for 3 months, then move to the nearest new plan.
2. **Venue deposit checkout.** Build Paystack subaccounts for hosts, a deposit step on the booking page, a commission ledger, and cancellation and refund rules.
    - Gate: written cancellation and refund terms, and a test of refunds on split payments.
3. **Short-stay and hotel checkout.** Reuse the venue checkout for full-payment bookings at 10%, or 5% for subscribers.
    - Gate: venue checkout has run without payout errors for at least one full month.
4. **Annual and M-Pesa prepaid plans.** Annual billing is 10 months' price for 12, plus prepaid M-Pesa months for hosts without cards.

### Risks

| Risk | Why it matters | Mitigation |
| --- | --- | --- |
| Bookings move off-platform | Booking pages show WhatsApp, phone and email, so guests can pay hosts directly and skip the commission | Charge commission only on VaRoom-paid bookings; give guests a reason to pay inside VaRoom (refund protection, verified hosts) |
| Legacy hosts leave over the price rise | Plans move from KES 800–1,800 to KES 1,500–15,000 | 3-month grandfathering; Starter and Dining plans stay close to today's prices |
| Recurring billing fails for M-Pesa users | Paystack subscriptions charge saved cards only | Prepaid M-Pesa months and annual prepay |
| Refunds on split payments | How Paystack reverses a split, and whether it returns its fee, is unverified | Test in Paystack test mode before phase 2 launches |
| Regulation once VaRoom takes payment | Platforms are expected to block unregistered short-stay hosts, and a 2% tourism levy on platform bookings was targeted for June 2026 ([Business Daily](https://www.businessdailyafrica.com/bd/economy/kenya-expands-2pc-tourism-levy-to-airbnb-booking-com-rentals-5339302)) | Collect TRA registration numbers at listing; confirm the levy's status with a tax adviser |

### Open questions

- [ ] Are plan prices VAT-inclusive? VaRoom must add 16% VAT to its fees once VAT-registered.
- [ ] What is a typical Kenyan hotel room-night price on VaRoom today? The hotel examples assume KES 8,000.
- [ ] How many hosts in each niche are on legacy plans today? This sets the grandfathering cost.
- [ ] Has the 2% tourism levy on platform bookings started?

## Sources

All pages below were opened between 2026-11-03 and 2026-11-04. Figures marked as search snippets or estimates in the text were not confirmed on a source page.

- [Hostfully: Airbnb host fees (28 Sep 2026)](https://www.hostfully.com/blog/airbnb-host-fees/)
- [Guesty: Booking.com host charges (29 Jun 2025)](https://www.guesty.com/blog/how-much-does-booking-com-charge-hosts)
- [Kolonell: boutique hotels in Africa, direct vs Booking.com (18 May 2026)](https://kolonell.com/en/blog/boutique-hotel-africa-direct-vs-bookingcom-2026)
- [Tagvenue: list your venue](https://www.tagvenue.com/page/list-your-venue)
- [Hire Space: for venues](https://hirespace.com/for-venues) and [when commission applies](https://help.hirespace.com/when-does-commission-apply)
- [Giggster: commission (13 May 2026)](https://help.giggster.com/en/articles/2832062-how-much-commission-does-giggster-take)
- [Peerspace: fees overview (17 Sep 2024)](https://www.peerspace.com/legal/terms/fees-overview)
- [planning.wedding: WeddingWire listing cost](https://planning.wedding/weddingwire-listing-cost) (a competitor's estimates)
- [RoomMaster: SiteMinder pricing (31 Jul 2026)](https://www.roommaster.com/blog/siteminder-pricing) (a competitor's figures)
- [Mews: Google Hotel Ads bidding (5 Mar 2025)](https://www.mews.com/en/blog/google-hotel-ads-bidding)
- [Airbtics: Nairobi annual Airbnb revenue (16 Oct 2026)](https://airbtics.com/annual-airbnb-revenue-in-nairobi-kenya/)
- [Airbtics: Kenya short-term rental report 2025 (22 Jan 2026)](https://airbtics.com/short-term-rental-market-report-2025-kenya)
- [The Star: hotel occupancy, KNBS Economic Survey 2025 (9 May 2025)](https://www.the-star.co.ke/news/2025-05-09-report-monthly-hotel-room-occupancy-rates-declines)
- [The Star: registering a licensed Airbnb (15 Jan 2024)](https://www.the-star.co.ke/news/2024-01-15-explainer-how-to-register-and-operate-a-licenced-airbnb)
- [Business Daily: 2% tourism levy on rental platforms (26 Jan 2026)](https://www.businessdailyafrica.com/bd/economy/kenya-expands-2pc-tourism-levy-to-airbnb-booking-com-rentals-5339302)
- [Jumuika: Nairobi conference facilities](https://jumuika.co.ke/commercial-property-for-rent/nairobi/conference-facility)
- [National Museums of Kenya: venue hire](https://museums.or.ke/venue-hire-nairobi-museums/)
- [Paystack Kenya pricing](https://paystack.com/ke/pricing)
- [Paystack docs: split payments](https://paystack.com/docs/payments/split-payments/) and [subscriptions](https://paystack.com/docs/payments/subscriptions/)
- VaRoom codebase: `server/migrations/20260920_000016_host_billing.sql`, `server/migrations/20261010_000035_property_shops_monetization.sql`, `server/routes/billingRoutes.js`, `client/lib/billing/pricing.ts`
