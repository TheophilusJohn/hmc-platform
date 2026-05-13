import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';

export function useFeatures() {
  const { data: settings } = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    retry: false,
  });

  const get = (key) => settings?.[key] || {};

  const razorpay = get('razorpay');
  const communication = get('communication_phone');
  const wise = get('wise');

  return {
    hasRazorpay: !!(razorpay?.key_id && razorpay?.key_secret),
    hasEmail: !!(get('sendgrid')?.api_key),
    hasSMS: !!(communication?.msg91_key || communication?.twilio_account_sid),
    hasWhatsApp: !!(communication?.whatsapp_business_id),
    hasWise: !!(wise?.api_key),
    hasPhone: !!(communication?.phone_number),
    rawSettings: settings,
    get,
  };
}
