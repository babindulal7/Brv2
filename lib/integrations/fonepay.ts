export function createFonepayQrPayload(invoiceNumber: string, amount: number) {
  return {
    prn: invoiceNumber,
    am: amount.toFixed(2),
    ru: `${process.env.APP_BASE_URL}/api/payments/fonepay/webhook`
  };
}
