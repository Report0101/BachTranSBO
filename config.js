// Public browser configuration for BachTranSBO.
// The publishable key and admin email are intentionally browser-visible.
// Never place a Supabase secret key, OpenAI API key, or password in this file.
window.BACH_SBO_CONFIG = {
  supabaseUrl: "https://nfpmngtxebnxueqivxox.supabase.co",
  supabasePublishableKey: "sb_publishable_BxapQvR8UmF6WvcNU7cpdw_YByawY5r",
  adminEmail: "bachtran95@gmail.com"
};

// Temporary frontend workflow patch loaded after the main app bundle.
// It keeps case-detail demographics editable, preserves form text before
// secondary saves, and adds arrival-to-SBO metadata.
window.addEventListener("DOMContentLoaded", () => {
  if (document.querySelector('script[src="case_patch.js"]')) return;
  const script = document.createElement("script");
  script.src = "case_patch.js";
  script.defer = true;
  document.body.appendChild(script);
});
