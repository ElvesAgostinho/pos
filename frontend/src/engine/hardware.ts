// Emulates hardware fingerprinting (MAC Address, CPU ID, Motherboard SN)
// In a real Electron/Tauri app, this would call native IPC methods.
// For the browser, we generate a robust persistent UUID in localStorage.

export const getHardwareFingerprint = (): string => {
  const FINGERPRINT_KEY = 'ERP_HARDWARE_FINGERPRINT';
  let fingerprint = localStorage.getItem(FINGERPRINT_KEY);
  
  if (!fingerprint) {
    // Generate a pseudo-hardware ID (e.g., MAC-style or UUID)
    // We use crypto.randomUUID if available, else fallback
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      fingerprint = crypto.randomUUID();
    } else {
      fingerprint = 'HW-' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    }
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
  }
  
  return fingerprint;
};
