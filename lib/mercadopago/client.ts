import MercadoPagoConfig, { Payment, PaymentRefund, Preference } from "mercadopago";

let client: MercadoPagoConfig | null = null;
let preference: Preference | null = null;
let payment: Payment | null = null;
let paymentRefund: PaymentRefund | null = null;

export function getMercadoPagoClient() {
  if (!client) {
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN is required");
    client = new MercadoPagoConfig({ accessToken });
  }
  return client;
}

export function getMercadoPagoPreference() {
  if (!preference) preference = new Preference(getMercadoPagoClient());
  return preference;
}

export function getMercadoPagoPreferenceForAccessToken(accessToken: string) {
  return new Preference(new MercadoPagoConfig({ accessToken }));
}

export function getMercadoPagoPayment() {
  if (!payment) payment = new Payment(getMercadoPagoClient());
  return payment;
}

export function getMercadoPagoPaymentForAccessToken(accessToken: string) {
  return new Payment(new MercadoPagoConfig({ accessToken }));
}

export function getMercadoPagoPaymentRefund() {
  if (!paymentRefund) paymentRefund = new PaymentRefund(getMercadoPagoClient());
  return paymentRefund;
}

export function getMercadoPagoPaymentRefundForAccessToken(accessToken: string) {
  return new PaymentRefund(new MercadoPagoConfig({ accessToken }));
}
