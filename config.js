// Public browser configuration for BachTranSBO.
// The publishable key and admin email are intentionally browser-visible.
// Never place a Supabase secret key, OpenAI API key, or password in this file.
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://nfpmngtxebnxueqivxox.supabase.co",
  supabasePublishableKey: "sb_publishable_BxapQvR8UmF6WvcNU7cpdw_YByawY5r",
  adminEmail: "bachtran95@gmail.com"
};

// Load the case-detail workflow extension as a parser-inserted script, not as
// a late DOMContentLoaded injection. This avoids Safari/GitHub Pages timing and
// cache issues where the extension file exists but never runs inside the app.
document.write('<script src="case_patch.js?v=20260919-native"><\/script>');
