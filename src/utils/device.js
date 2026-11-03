// Device Fingerprint & Anti-Proxy Hardware Utility

export function getDeviceId() {
  // If demo proxy simulation mode is active, return the simulated hijacked device
  const proxySimulation = localStorage.getItem('ephesus_proxy_sim_active');
  if (proxySimulation === 'true') {
    return 'dev_simulated_borrowed_phone_99';
  }

  // Check if simulated user-device is assigned (for demo multi-account presentation)
  const simulatedUserDevice = localStorage.getItem('ephesus_simulated_user_device');
  if (simulatedUserDevice) {
    return simulatedUserDevice;
  }

  let deviceId = localStorage.getItem('ephesus_device_id');
  if (!deviceId) {
    const randomHex = Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
    deviceId = `dev_${randomHex}`;
    localStorage.setItem('ephesus_device_id', deviceId);
  }
  return deviceId;
}

export function getDeviceName() {
  const proxySimulation = localStorage.getItem('ephesus_proxy_sim_active');
  if (proxySimulation === 'true') {
    return "Rahul's Borrowed iPhone (Proxy Attempt)";
  }

  const simulatedDeviceName = localStorage.getItem('ephesus_simulated_device_name');
  if (simulatedDeviceName) {
    return simulatedDeviceName;
  }

  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'Apple iPhone (iOS)';
  if (/iPad/i.test(ua)) return 'Apple iPad (iPadOS)';
  if (/Android/i.test(ua)) return 'Android Smartphone';
  if (/Macintosh/i.test(ua)) return 'Apple MacBook (macOS)';
  if (/Windows/i.test(ua)) return 'Windows Laptop';
  return 'Personal Smartphone';
}

// Preset simulated devices for demo users so judges see 1-to-1 device binding
export const DEMO_DEVICE_PROFILES = {
  'rahul.k@providence.edu.in': {
    id: 'dev_rahul_iphone15',
    name: "Rahul's iPhone 15 Pro"
  },
  'cyril.b@providence.edu.in': {
    id: 'dev_cyril_galaxy_s24',
    name: "Cyril's Galaxy S24 Ultra"
  },
  'tony.a@providence.edu.in': {
    id: 'dev_tony_pixel8',
    name: "Tony's Google Pixel 8"
  },
  'jeffin.j@providence.edu.in': {
    id: 'dev_jeffin_oneplus12',
    name: "Jeffin's OnePlus 12"
  }
};

export function setSimulatedDeviceForUser(email) {
  if (DEMO_DEVICE_PROFILES[email]) {
    localStorage.setItem('ephesus_simulated_user_device', DEMO_DEVICE_PROFILES[email].id);
    localStorage.setItem('ephesus_simulated_device_name', DEMO_DEVICE_PROFILES[email].name);
  } else {
    localStorage.removeItem('ephesus_simulated_user_device');
    localStorage.removeItem('ephesus_simulated_device_name');
  }
}

export function toggleProxySimulation(enable) {
  if (enable) {
    localStorage.setItem('ephesus_proxy_sim_active', 'true');
  } else {
    localStorage.removeItem('ephesus_proxy_sim_active');
  }
}

export function isProxySimulationActive() {
  return localStorage.getItem('ephesus_proxy_sim_active') === 'true';
}
