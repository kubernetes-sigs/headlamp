import React from 'react';

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
  };
}

export const useFlows = () => {
  const [flows, setFlows] = React.useState<FlowsResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const fetchFlows = async (
    options: {
      endpoint?: string;
      filters?: Record<string, any>;
      watch?: boolean;
    } = {}
  ) => {
    const { endpoint = 'http://localhost:3002/flows', filters = {}, watch = false } = options;

    setLoading(true);
    setError(null);

    try {
      // Build query parameters
      const params = new URLSearchParams();

      if (watch) {
        params.append('watch', 'true');
      }

      if (Object.keys(filters).length > 0) {
        params.append('filters', JSON.stringify(filters));
      }

      const queryString = params.toString();
      const url = queryString ? `${endpoint}?${queryString}` : endpoint;

      console.log('Fetching flows from:', url);

      const response = await fetch('http://localhost:3002/flows', {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      setFlows(data);
      return data;
    } catch (err: any) {
      console.error('Error fetching flows:', err);
      const errorMessage = err.message || 'Failed to fetch flows';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    flows,
    loading,
    error,
    fetchFlows,
  };
};
