const SUPABASE_URL =
  'https://tienlwviiwwmwjgyudgu.supabase.co';

const SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_A_YCcOXLQGO9MrYQ6icQ2Q_4jKAtygj';

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