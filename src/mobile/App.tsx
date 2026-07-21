// ONX Mobile — root shell. Shares the AppRouter tRPC contract with the web app.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      {/* expo-router Stack mounts here — see app/ directory per README */}
    </QueryClientProvider>
  );
}
