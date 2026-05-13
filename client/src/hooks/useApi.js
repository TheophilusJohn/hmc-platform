import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';

export function useApi(key, url, options = {}) {
  return useQuery({
    queryKey: Array.isArray(key) ? key : [key],
    queryFn: async () => {
      const res = await api.get(url, { params: options.params });
      return res.data;
    },
    enabled: options.enabled !== false,
    ...options,
  });
}

export function useMutate(url, options = {}) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ method = 'POST', data, id } = {}) => {
      const finalUrl = id ? `${url}/${id}` : url;
      const res = await api[method.toLowerCase()](finalUrl, data);
      return res.data;
    },
    onSuccess: (data) => {
      if (options.invalidates) {
        const keys = Array.isArray(options.invalidates) ? options.invalidates : [options.invalidates];
        keys.forEach(k => queryClient.invalidateQueries({ queryKey: Array.isArray(k) ? k : [k] }));
      }
      if (options.successMessage) toast.success(options.successMessage);
      options.onSuccess?.(data);
    },
    onError: (err) => {
      const msg = err.displayMessage || err.message || 'Something went wrong';
      toast.error(msg);
      options.onError?.(err);
    },
  });
}

export function useDownload() {
  return async (url, filename) => {
    const res = await api.get(url, { responseType: 'blob' });
    const href = URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(href);
  };
}
