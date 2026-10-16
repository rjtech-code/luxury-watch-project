import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setSessionHint } from './lib/api';
import { HelmetProvider } from 'react-helmet-async';
import './index.css';
import App from './App';
import { ErrorBoundary } from './pages/System';

/**
 * A 401 means the session is gone (expired, signed out elsewhere, or the cookie was never stored). Forget the
 * user so protected pages (account, /admin, /manager) send the visitor to the sign-in page straight away.
 */
const onAuthError = (err) => {
  if (err?.status !== 401) return;
  setSessionHint(false);
  queryClient.setQueryData(['me'], null);
};

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (n, err) => err?.status !== 401 && n < 1, refetchOnWindowFocus: false } },
  queryCache: new QueryCache({ onError: onAuthError }),
  mutationCache: new MutationCache({ onError: onAuthError }),
});

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          {/* Inside the providers, so the error screen itself can use them. */}
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </BrowserRouter>
      </QueryClientProvider>
    </HelmetProvider>
  </StrictMode>,
);
