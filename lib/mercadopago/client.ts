import MercadoPagoConfig, { Payment, Preference } from "mercadopago";

let client: MercadoPagoConfig | null = null;
let preference: Preference | null = null;
let payment: Payment | null = null;

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

export function getMercadoPagoPayment() {
  if (!payment) payment = new Payment(getMercadoPagoClient());
  return payment;
}
