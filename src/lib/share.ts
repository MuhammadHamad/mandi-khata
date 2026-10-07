import { accountName, animalsText, rs, shortDate } from './format'
import { t } from './i18n'
import type { Account, PartyKind } from './types'

/**
 * A phone number the way WhatsApp wants it: country code first, digits only.
 * Numbers are taken as Pakistani: 0300 1234567, 300 1234567, +92 300 1234567
 * and 0092 300 1234567 all give 923001234567. Null when it isn't a number.
 */
export function whatsappNumber(phone: string | null | undefined): string | null {
  if (!phone) return null
  let digits = phone.replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  else if (digits.startsWith('0')) digits = `92${digits.slice(1)}`
  else if (digits.length === 10 && digits.startsWith('3')) digits = `92${digits}`
  return digits.length >= 10 && digits.length <= 15 ? digits : null
}

/** Opens WhatsApp with the message typed in: in that person's chat when the number is known, else to pick a chat. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const number = whatsappNumber(phone)
  return `https://wa.me/${number ?? ''}?text=${encodeURIComponent(text)}`
}

/**
 * The khata balance as a message to the customer or supplier, saying plainly which way
 * the money is owed. The amount is between asterisks, which WhatsApp shows in bold.
 */
export function balanceMessage({
  kind,
  name,
  balance,
  business,
  today,
}: {
  kind: PartyKind
  name: string
  balance: number
  business: string
  today: string
}): string {
  const date = shortDate(today)
  return [
    t('Hello {name},', { name }),
    business.trim()
      ? t('Your account with {business}, as of {date}:', { business: business.trim(), date })
      : t('Your account as of {date}:', { date }),
    balanceStatement(kind, balance),
    t('Thank you.'),
  ].join('\n')
}

/**
 * One challan as a message to its supplier: what was bought, its total, what was paid at
 * purchase and what went on credit, then where their whole khata stands today.
 */
export function challanMessage({
  name,
  business,
  number,
  boughtOn,
  animals,
  total,
  paidNow,
  paidFrom,
  balance,
  today,
}: {
  name: string
  business: string
  number: number
  boughtOn: string
  animals: { animal: string; head: number }[]
  total: number
  paidNow: number
  paidFrom: Account
  balance: number
  today: string
}): string {
  const challan = t('Challan #{n}', { n: number })
  const bought = t('bought {date}', { date: shortDate(boughtOn) })
  return [
    t('Hello {name},', { name }),
    business.trim() ? `${business.trim()}: ${challan}, ${bought}` : `${challan}, ${bought}`,
    animalsText(animals),
    `${t('Challan total')}: *${rs(total)}*`,
    `${t('Paid at purchase ({account})', { account: accountName(paidFrom) })}: ${rs(paidNow)}`,
    `${t('On credit')}: ${rs(Math.max(0, total - paidNow))}`,
    `${t('Your whole account as of {date}:', { date: shortDate(today) })} ${balanceStatement('supplier', balance)}`,
    t('Thank you.'),
  ].join('\n')
}

/** One plain sentence saying which way the money is owed, with the amount in bold. */
function balanceStatement(kind: PartyKind, balance: number): string {
  const amount = `*${rs(Math.abs(balance))}*`
  if (Math.abs(balance) < 0.5) return t('Your account is settled. Nothing is due.')
  if (kind === 'customer') {
    return balance > 0
      ? t('You owe us {amount}.', { amount })
      : t('We hold {amount} of yours in advance.', { amount })
  }
  return balance > 0 ? t('We owe you {amount}.', { amount }) : t('You hold {amount} of ours in advance.', { amount })
}
