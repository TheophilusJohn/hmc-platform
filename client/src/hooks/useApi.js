import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../utils/api';
import toast from 'react-hot-toast';

/**
 * Backward-compatible useApi.
 *
 * New signature: useApi(key, url, options)
 *   useApi('subjects-list', '/subjects', { params: { semesterId: 'x' } })
 *
 * Legacy signature: useApi(url, depsArrayOrOptions)
 *   useApi('/subjects?mine=true')
 *   useApi(selectedSubject ? `/path/${selectedSubject}` : null, [selectedSubject])
 *   useApi('/programmes', { staleTime: 60000 })
 *
 * Also: passing null as the URL disables the query.
 */
export function useApi(keyOrUrl, urlOrOptions, options = {}) {
  let url, opts;

  // Legacy: first arg starts with '/' or is null → treat as URL
  if (keyOrUrl === null || (typeof keyOrUrl === 'string' && keyOrUrl.startsWith('/'))) {
    url = keyOrUrl;
    // Second arg could be a deps array or options object
    if (Array.isArray(urlOrOptions)) {
      opts = { _deps: urlOrOptions };
    } else {
      opts = urlOrOptions || {};
    }
  } else {
    // New: (key, url, options)
    opts = options || {};
    opts._cacheKey = keyOrUrl;
    url = urlOrOptions;
  }

  const enabled = url !== null && url !== undefined && opts.enabled !== false;

  // Build a stable cache key
  let key;
  if (opts._cacheKey) {
    key = Array.isArray(opts._cacheKey) ? opts._cacheKey : [opts._cacheKey];
  } else {
    key = [url, ...(opts._deps || []), opts.params ? JSON.stringify(opts.params) : ''];
  }

  return useQuery({
    queryKey: key,
    queryFn: async () => {
      const res = await api.get(url, { params: opts.params });
      return res.data;
    },
    enabled,
    staleTime: opts.staleTime,
    retry: opts.retry,
    refetchOnWindowFocus: opts.refetchOnWindowFocus,
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
