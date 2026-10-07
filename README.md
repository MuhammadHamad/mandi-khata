# Mandi Khata

Records for an animal market business: challans (bulk purchases of animals), sales, deaths, payments and
expenses, with the ledgers and reports worked out from them.

**Staff enter five things**

| Form | What it records |
| --- | --- |
| Challan | One bulk purchase: supplier, date, each kind of animal with its count and cost, and what was paid now. The rest goes on the supplier's ledger. |
| Sale | Animals sold from one or more challans, the customer (or a walk-in, who pays in full), the price, a *damaged* tick for animals sold cheap, and what was received now. The rest goes on the customer's ledger. |
| Death | Animals from a challan that died. |
| Payment | A later payment from a customer or to a supplier, cash put in or taken out of the bank, or the owner's own money in or out. |
| Expense | Anything paid for, optionally linked to one challan (its transport, fodder…). |

**The app works out the rest:** each challan's stock and profit, customer and supplier ledgers, the cash
book and bank book, and a monthly report.

## Roman Urdu

The app opens in Roman Urdu, in the words the mandi uses (bikri, gahak, beopari, khata, udhaar, nakad,
kharcha, munafa, nuqsan, lene hain / dene hain). The **Urdu | English** switch at the top of every screen
and on the sign-in page changes it, and each phone remembers its choice. In Urdu, amounts are grouped the
way traders count them (Rs 12,50,000).

Every phrase on screen goes through `t()` (`src/lib/i18n.ts`), keyed by its English, and
`src/lib/ur.ts` holds the Roman Urdu. To add or change a screen, write its English inside `t('…')` and
add the Roman Urdu to `ur.ts`. `npm run check:i18n` lists any phrase that has no Roman Urdu.

## How the numbers work

- Animals are counted, not tracked one by one. Each animal costs its challan's average for that kind:
  20 goats for Rs 10 lakh cost Rs 50,000 each.
- **Challan profit** = what it sold for − the cost of the animals sold or dead − expenses linked to it. It is
  final once every animal is sold or dead; until then it is the profit so far.
- **Monthly profit** = that month's sales − the cost of the animals sold that month − the cost of the animals
  that died that month − all that month's expenses. A big purchase counts only as its animals are sold.
- **Cash and bank** start from the opening balances in Settings, plus every rupee in, minus every rupee out.

## Try it (no database needed)

```bash
npm install
npm run dev:demo
```

Open http://localhost:5175. The demo starts with two months of sample records and keeps everything in the
browser. Settings can load the sample again or start empty.

## Set it up for real use

1. Create a project at [supabase.com](https://supabase.com) (the free plan is enough to start).
2. In the project, open **SQL Editor**, paste all of `supabase/setup.sql`, and press **Run**. It is safe to run
   again later.
3. Open **Authentication → Users → Add user** and create the business's login (email and password). Staff of
   one business share its login. Each login is a separate business with its own records.
4. In **Authentication → Sign In / Providers**, turn off new sign-ups, so only the logins you create can get in.
5. Copy `.env.example` to `.env` and fill in the **Project URL** and the **anon** (publishable) key from
   **Project Settings → API**.
6. Run `npm run dev`, open http://localhost:5173 and sign in. In **Settings**, enter the business name and the
   cash and bank balances you are starting with.

To put it online, deploy to Vercel with the same two values as environment variables. `npm run build` refuses
to build without them, and `vercel.json` already handles the page routes.

## Checks

```bash
npm run verify
```

This fills the demo and a real copy of the database (PGlite, from `supabase/setup.sql`) with the sample
records. It checks that every total matches figures worked out by hand, that the demo and database agree to
the rupee, that both refuse the same mistakes (selling or losing more animals than a challan has, a walk-in
paying only part, deleting a challan that has sales), and that one login can never see or change another's
records. It also checks that Roman Urdu gives the same figures and explains mistakes in Urdu, and that
every phrase on screen has its Roman Urdu.

## Where things are

| Path | What it holds |
| --- | --- |
| `src/lib/books.ts` | Every calculation: stock, profit, ledgers, cash book, monthly report |
| `src/lib/rules.ts` | What may be saved or deleted, with the messages staff see |
| `src/lib/i18n.ts`, `src/lib/ur.ts` | The language switch and the Roman Urdu for every phrase |
| `src/data/live.ts` | The Supabase backend |
| `src/data/demo.ts`, `src/data/sample.ts` | The in-browser demo and its sample records |
| `supabase/setup.sql` | Tables, row-level security, the stock check, and the save functions |
| `scripts/verify.ts` | The checks above |
