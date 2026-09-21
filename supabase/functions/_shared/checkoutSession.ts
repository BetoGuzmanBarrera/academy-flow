import type Stripe from 'https://esm.sh/stripe@17.3.1';

export function createAcademyCheckoutSession(
  stripe: Stripe,
  orderId: string,
  userId: string,
  amountInCents: number,
  siteUrl: string,
  reservationKey: string,
): Promise<Stripe.Checkout.Session> {
  return stripe.checkout.sessions.create({
    mode: 'payment',
    currency: 'mxn',
    line_items: [{
      quantity: 1,
      price_data: {
        currency: 'mxn',
        unit_amount: amountInCents,
        product_data: { name: `Orden #${orderId.slice(0, 8)}` },
      },
    }],
    metadata: {
      order_id: orderId,
      user_id: userId,
      checkout_reservation_key: reservationKey,
    },
    payment_intent_data: { metadata: { order_id: orderId } },
    success_url: `${siteUrl}/?payment=success&order=${orderId}`,
    cancel_url: `${siteUrl}/?payment=cancelled&order=${orderId}`,
  }, { idempotencyKey: reservationKey });
}
