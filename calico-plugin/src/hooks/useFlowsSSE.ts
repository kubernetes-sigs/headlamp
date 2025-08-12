import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

export interface Flow {
  start_time: string;
  end_time: string;
  action: 'Allow' | 'Deny' | 'Pass' | 'Log';
  source_name: string;
  source_namespace: string;
  source_labels: string;
  dest_name: string;
  dest_namespace: string;
  dest_labels: string;
  protocol: string;
  dest_port: number;
  reporter: 'Src' | 'Dest';
  policies: any;
  packets_in: number;
  packets_out: number;
  bytes_in: number;
  bytes_out: number;
}

export interface FlowsResponse {
  items: Flow[];
  meta?: {
    totalPages?: number;
    timestamp?: string;
  };
}

// Fetch initial flows data
const fetchInitialFlows = async (endpoint: string): Promise<FlowsResponse> => {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
};

export const useFlowsSSE = (endpoint = 'http://localhost:3002/flows', enableSSE = true) => {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const queryKey = ['flows', endpoint];

  // Initial data fetch using React Query
  const query = useQuery({
    queryKey,
    queryFn: () => fetchInitialFlows(endpoint),
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
  });

  // SSE connection for real-time updates
  useEffect(() => {
    if (!enableSSE || !query.data) return;

    // Create SSE connection for real-time updates
    const sseEndpoint = `${endpoint}?watch=true`;
    console.log('Connecting to SSE:', sseEndpoint);

    eventSourceRef.current = new EventSource(sseEndpoint);

    eventSourceRef.current.onopen = () => {
      console.log('SSE connection opened');
    };

    eventSourceRef.current.onmessage = event => {
      try {
        const newFlow: Flow = JSON.parse(event.data);
        console.log('Received new flow:', newFlow);

        // Update the query data with the new flow
        queryClient.setQueryData(queryKey, (oldData: FlowsResponse | undefined) => {
          if (!oldData) return oldData;

          return {
            ...oldData,
            items: [newFlow, ...oldData.items].slice(0, 1000), // Keep only last 1000 flows
            meta: {
              ...oldData.meta,
              timestamp: new Date().toISOString(),
            },
          };
        });
      } catch (error) {
        console.error('Error parsing SSE message:', error);
      }
    };

    eventSourceRef.current.onerror = error => {
      console.error('SSE connection error:', error);
      // React Query will handle retries for the initial fetch
    };

    // Cleanup on unmount or dependency change
    return () => {
      if (eventSourceRef.current) {
        console.log('Closing SSE connection');
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [enableSSE, endpoint, query.data, queryClient, queryKey]);

  // Manual refresh function
  const refreshFlows = () => {
    return query.refetch();
  };

  // Toggle SSE connection
  const toggleSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  return {
    flows: query.data?.items || [],
    meta: query.data?.meta,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    isSSEConnected:
      !!eventSourceRef.current && eventSourceRef.current.readyState === EventSource.OPEN,
    refreshFlows,
    toggleSSE,
    ...query,
  };
};
