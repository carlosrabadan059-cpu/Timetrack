/**
 * Supabase Client Wrapper
 * TODO: Configure with actual Supabase credentials
 * Currently using mock data
 */

// Supabase credentials - to be configured later
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Placeholder for Supabase client
// Will be initialized when credentials are configured
let supabaseClient = null;

/**
 * Get the Supabase client instance
 * Returns null if not configured
 */
export const getSupabaseClient = () => {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.warn('Supabase not configured. Using mock data.');
        return null;
    }

    if (!supabaseClient) {
        // Dynamic import to avoid errors when not configured
        import('@supabase/supabase-js').then(({ createClient }) => {
            supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        });
    }

    return supabaseClient;
};

/**
 * Check if Supabase is configured
 */
export const isSupabaseConfigured = () => {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
};

export default {
    getSupabaseClient,
    isSupabaseConfigured
};
