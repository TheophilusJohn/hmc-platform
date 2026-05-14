import { useQuery } from '@tanstack/react-query';
import api from '../utils/api';

// useFeatures consumes /api/settings/public, which is unauthenticated and returns
// presence booleans only (no secrets). Previously this hit /api/settings (admin
// only) and mis-unwrapped the {settings:{...}} shape, so flags were permanently
// false for everyone — silently hiding Razorpay/email/SMS UI.
export function useFeatures() {
  const { data } = useQuery({
    queryKey: ['settings-public'],
    queryFn: async () => {
      const res = await api.get('/settings/public');
      return res.data || {};
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const features = data?.features || {};

  return {
    hasRazorpay: !!features.hasRazorpay,
    hasEmail: !!features.hasEmail,
    hasSMS: !!features.hasSMS,
    hasWhatsApp: !!features.hasWhatsApp,
    hasWise: !!features.hasWise,
    hasPhone: !!features.hasPhone,
    collegeName: data?.collegeName,
    shortName: data?.shortName,
    razorpayKeyId: data?.razorpay_key_id || null,
  };
}
