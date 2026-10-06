/**
 * Two months of a small mandi, dated back from today: three challans (one
 * sold out, two still selling), walk-in and credit sales, two deaths, one
 * damaged sale, linked and general expenses, and payments both ways.
 * The demo opens on it, and scripts/verify.ts checks every total against it.
 *
 * Its words (animals, expenses, notes) are written in whichever language is
 * chosen when the demo first fills, as a trader would have typed them.
 */
import { addDays } from '../lib/format'
import { t } from '../lib/i18n'
import { uuid } from '../lib/ids'
import type { Account, PaymentKind } from '../lib/types'
import type { Backend } from './api'

type Item = [lineId: string, head: number, amount: number, damaged?: boolean]

export async function fillSample(api: Backend, today: string): Promise<void> {
  const day = (n: number) => addDays(today, -n)

  await api.saveSettings({ business_name: 'Demo Mandi', opening_cash: 500_000, opening_bank: 3_500_000 })

  const party = async (kind: 'customer' | 'supplier', name: string, phone: string, opening = 0) => {
    const id = uuid()
    await api.saveParty(kind, { id, name, phone, notes: null, opening_balance: opening })
    return id
  }
  const gul = await party('supplier', 'Gul Muhammad (Bannu)', '0300 1234567')
  const imran = await party('supplier', 'Imran Malik (Okara)', '0301 2345678')
  const sher = await party('supplier', 'Sher Afzal (Kohat)', '0302 3456789')
  const bilal = await party('customer', 'Bilal Meat Shop', '0311 1112223')
  const tariq = await party('customer', 'Tariq (Hayatabad)', '0312 2223334')
  const javed = await party('customer', 'Javed Khan', '0313 3334445', 25_000)
  const rehman = await party('customer', 'Abdul Rehman Qasai', '0314 4445556')

  const sale = (date: string, customer: string | null, items: Item[], received: number, into: Account) =>
    api.saveSale({
      id: uuid(),
      sold_on: date,
      customer_id: customer,
      received_now: received,
      received_in: into,
      notes: null,
      lines: items.map(([challan_line_id, head, amount, damaged]) => ({
        id: uuid(),
        challan_line_id,
        head,
        amount,
        damaged: damaged ?? false,
      })),
    })
  const death = (date: string, lineId: string, head: number, cause: string) =>
    api.saveDeath({ id: uuid(), died_on: date, challan_line_id: lineId, head, cause })
  const expense = (date: string, category: string, amount: number, challan: string | null, notes: string | null = null) =>
    api.saveExpense({ id: uuid(), spent_on: date, category, amount, paid_from: 'cash', challan_id: challan, notes })
  const pay = (date: string, kind: PaymentKind, amount: number, account: Account | null, who: { customer?: string; supplier?: string } = {}) =>
    api.savePayment({
      id: uuid(),
      paid_on: date,
      kind,
      customer_id: who.customer ?? null,
      supplier_id: who.supplier ?? null,
      account,
      amount,
      notes: null,
    })

  // Challan 1: sold out. One goat died; two injured goats went cheap.
  const c1 = uuid()
  const c1goat = uuid()
  const c1sheep = uuid()
  await api.saveChallan({
    id: c1,
    bought_on: day(55),
    supplier_id: gul,
    paid_now: 1_200_000,
    paid_from: 'bank',
    notes: null,
    lines: [
      { id: c1goat, animal: t('Goat'), head: 20, cost: 1_000_000 },
      { id: c1sheep, animal: t('Sheep'), head: 10, cost: 600_000 },
    ],
  })
  await expense(day(55), t('Transport'), 35_000, c1, t('Truck from {place}', { place: 'Bannu' }))
  await sale(day(52), bilal, [[c1goat, 5, 290_000]], 200_000, 'cash')
  await sale(day(50), null, [[c1goat, 2, 120_000]], 120_000, 'cash')
  await expense(day(50), t('Fodder'), 18_000, c1)
  await sale(day(47), rehman, [[c1sheep, 4, 280_000]], 280_000, 'bank')
  await sale(day(45), tariq, [[c1goat, 6, 360_000]], 300_000, 'cash')
  await death(day(44), c1goat, 1, t('Fell sick in the pen'))
  await sale(day(41), javed, [[c1goat, 4, 236_000], [c1sheep, 5, 345_000]], 400_000, 'bank')
  await sale(day(38), rehman, [[c1goat, 2, 48_000, true], [c1sheep, 1, 66_000]], 114_000, 'cash')

  // Challan 2: one cow still in hand.
  const c2 = uuid()
  const c2cow = uuid()
  await api.saveChallan({
    id: c2,
    bought_on: day(30),
    supplier_id: imran,
    paid_now: 1_000_000,
    paid_from: 'bank',
    notes: null,
    lines: [{ id: c2cow, animal: t('Cow'), head: 4, cost: 1_200_000 }],
  })
  await expense(day(30), t('Transport'), 60_000, c2, t('Truck from {place}', { place: 'Okara' }))
  await sale(day(24), rehman, [[c2cow, 1, 365_000]], 300_000, 'bank')
  await expense(day(20), t('Fodder'), 24_000, c2)
  await expense(day(18), t('Vet & medicine'), 6_500, c2)
  await sale(day(16), bilal, [[c2cow, 2, 720_000]], 500_000, 'bank')

  // Challan 3: just started selling. Its transport is already counted, so it shows a loss so far.
  const c3 = uuid()
  const c3goat = uuid()
  const c3sheep = uuid()
  await api.saveChallan({
    id: c3,
    bought_on: day(8),
    supplier_id: sher,
    paid_now: 1_000_000,
    paid_from: 'bank',
    notes: null,
    lines: [
      { id: c3goat, animal: t('Goat'), head: 25, cost: 1_375_000 },
      { id: c3sheep, animal: t('Sheep'), head: 6, cost: 390_000 },
    ],
  })
  await expense(day(8), t('Transport'), 40_000, c3, t('Truck from {place}', { place: 'Kohat' }))
  await death(day(7), c3goat, 1, t('Died on the way from Kohat'))
  await sale(day(6), null, [[c3goat, 3, 189_000]], 189_000, 'cash')
  await sale(day(5), tariq, [[c3goat, 4, 248_000]], 150_000, 'cash')
  await expense(day(4), t('Fodder'), 15_000, c3)
  await sale(day(3), javed, [[c3sheep, 2, 150_000]], 150_000, 'bank')
  await sale(day(2), null, [[c3goat, 1, 64_000]], 64_000, 'cash')

  // Running costs that belong to no challan.
  await expense(day(40), t('Rent'), 30_000, null, t('Pen rent'))
  await expense(day(35), t('Wages'), 25_000, null, t('Two helpers'))
  await expense(day(20), t('Mandi fee'), 5_000, null)
  await expense(day(12), t('Electricity'), 4_500, null)
  await expense(day(10), t('Rent'), 30_000, null, t('Pen rent'))
  await expense(day(5), t('Wages'), 25_000, null, t('Two helpers'))

  await pay(day(40), 'from_customer', 90_000, 'cash', { customer: bilal })
  await pay(day(35), 'to_supplier', 200_000, 'bank', { supplier: gul })
  await pay(day(28), 'from_customer', 100_000, 'bank', { customer: javed })
  await pay(day(26), 'cash_to_bank', 400_000, null)
  await pay(day(14), 'to_supplier', 200_000, 'bank', { supplier: gul })
  await pay(day(10), 'from_customer', 60_000, 'cash', { customer: tariq })
  await pay(day(9), 'owner_out', 50_000, 'cash')
  await pay(day(4), 'to_supplier', 100_000, 'bank', { supplier: imran })
}
