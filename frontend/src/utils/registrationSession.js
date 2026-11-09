const KEY = "dpc-oj-registration-v1";

export function saveRegistrationSession(response) {
  if (!response?.verification_required || !/^[a-f0-9]{64}$/.test(response.registration_id || "")) {
    throw new Error("The server did not return a valid verification session.");
  }
  const data = {
    registration_id: response.registration_id,
    email: response.email,
    otpExpiresAt: Date.now() + Math.max(0, Number(response.expires_in) || 0) * 1000,
    resendAt: Date.now() + Math.max(0, Number(response.retry_after) || 0) * 1000,
    attempts_remaining: response.attempts_remaining,
    mail_sent: response.mail_sent,
    message: response.message || "Enter your latest verification code.",
  };
  try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch { /* Navigation state is a fallback. */ }
  return data;
}

export function readRegistrationSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem(KEY) || "null");
    return /^[a-f0-9]{64}$/.test(data?.registration_id || "") ? data : null;
  } catch { return null; }
}

export function storeRegistrationSession(data) {
  try { sessionStorage.setItem(KEY, JSON.stringify(data)); } catch { /* Optional persistence. */ }
}

export function clearRegistrationSession() {
  try { sessionStorage.removeItem(KEY); } catch { /* Optional persistence. */ }
}

export function finishLogin(response) {
  if (typeof response?.token !== "string" || !response.token || !response.user?.id) {
    throw new Error("The server did not confirm authentication.");
  }
  localStorage.setItem("token", response.token);
  localStorage.setItem("user", JSON.stringify(response.user));
  clearRegistrationSession();
  window.dispatchEvent(new Event("authChanged"));
}
