const SUPABASE_URL =
  'https://ymyfjnzphyfkwewdagsx.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_aO5iRMJdCdnPgIuRDVm46A_5q3ksHNQ';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  }
);