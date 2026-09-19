// Public browser configuration for BachTranSBO.
// Supabase publishable/anon keys are intended for browser use; RLS protects the data.
// Never place a service_role key in this file.
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabasePublishableKey: "YOUR_PUBLISHABLE_KEY",
  authRedirectTo: window.location.origin + window.location.pathname
};
