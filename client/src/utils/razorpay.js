export function loadRazorpayScript() {
  return new Promise(resolve => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.head.appendChild(script);
  });
}

export async function openRazorpayCheckout({ orderId, amount, currency = 'INR', studentName, email, phone, keyId, onSuccess, onFailure }) {
  const loaded = await loadRazorpayScript();
  if (!loaded) return onFailure?.('Failed to load payment gateway.');

  const options = {
    key: keyId || import.meta.env.VITE_RAZORPAY_KEY_ID,
    amount,
    currency,
    name: 'Harvest Mission College',
    description: 'Fee Payment',
    order_id: orderId,
    prefill: { name: studentName, email, contact: phone },
    theme: { color: '#0F2B4A' },
    handler: (response) => onSuccess?.(response),
    modal: { ondismiss: () => onFailure?.('Payment cancelled') },
  };

  const rzp = new window.Razorpay(options);
  rzp.on('payment.failed', (response) => onFailure?.(response.error.description));
  rzp.open();
}

export const loadRazorpay = () => {
  return new Promise((resolve) => {
    if (window.Razorpay) { resolve(true); return; }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
};
