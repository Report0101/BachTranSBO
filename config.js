// Public browser configuration for BachTranSBO.
// The publishable key is intentionally browser-visible; RLS/Auth protect data.
// Never place a Supabase secret key or OpenAI API key in this file.
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://nfpmngtxebnxueqivxox.supabase.co",
  supabasePublishableKey: "sb_publishable_BxapQvR8UmF6WvcNU7cpdw_YByawY5r",
  authRedirectTo: window.location.origin + window.location.pathname
};
