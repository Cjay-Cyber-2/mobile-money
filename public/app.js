// Theme Management
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelectorAll(".theme-switcher button").forEach(btn => {
    const active = btn.dataset.theme === theme;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-pressed", active);
  });
}

function saveTheme(theme) {
  localStorage.setItem("theme", theme);
  setTheme(theme);
}

function loadTheme() {
  const saved = localStorage.getItem("theme") || "carbon";
  setTheme(saved);
}

// Initialize theme before anything else
loadTheme();

// Theme switcher event listeners
document.querySelectorAll(".theme-switcher button").forEach(btn => {
  btn.addEventListener("click", () => saveTheme(btn.dataset.theme));
});

// Live API Status Polling
async function updateSystemStatus() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");

  try {
    const res = await fetch("/health");
    if (res.ok) {
      const data = await res.json();
      if (data.status === "ok") {
        dot.className = "status-dot online";
        text.className = "status-text online";
        text.textContent = "System: Operational";
        return;
      }
    }
    dot.className = "status-dot offline";
    text.className = "status-text";
    text.textContent = "System: Issues Detected";
  } catch (error) {
    dot.className = "status-dot offline";
    text.className = "status-text";
    text.textContent = "System: Offline";
  }
}

// Live Horizon Health Polling
async function updateHorizonHealth() {
  let horizonDot = document.getElementById("horizon-status-dot");
  let horizonText = document.getElementById("horizon-status-text");
  let horizonLatency = document.getElementById("horizon-latency");

  if (!horizonDot) {
    const statusContainer = document.querySelector(".status-container") || document.body;
    const div = document.createElement("div");
    div.id = "horizon-health-widget";
    div.style.marginTop = "8px";
    div.innerHTML = `
      <span id="horizon-status-dot" class="status-dot offline"></span>
      <span id="horizon-status-text" class="status-text">Horizon: Checking...</span>
      <span id="horizon-latency" style="margin-left: 10px; font-size: 0.9em; opacity: 0.8;"></span>
    `;
    statusContainer.appendChild(div);
    horizonDot = document.getElementById("horizon-status-dot");
    horizonText = document.getElementById("horizon-status-text");
    horizonLatency = document.getElementById("horizon-latency");
  }

  try {
    const res = await fetch("/api/health/horizon");
    const data = await res.json();
    if (res.ok && data.status === "up") {
      horizonDot.className = "status-dot online";
      horizonText.className = "status-text online";
      horizonText.textContent = "Horizon: Connected";
      if (horizonLatency) {
        horizonLatency.textContent = `(${data.latencyMs}ms)`;
      }
    } else {
      horizonDot.className = "status-dot offline";
      horizonText.className = "status-text";
      horizonText.textContent = "Horizon: Degraded";
      if (horizonLatency && data.latencyMs) {
        horizonLatency.textContent = `(${data.latencyMs}ms)`;
      }
    }
  } catch (error) {
    horizonDot.className = "status-dot offline";
    horizonText.className = "status-text";
    horizonText.textContent = "Horizon: Offline";
    if (horizonLatency) {
      horizonLatency.textContent = "";
    }
  }
}

// Initial status check and periodic updates
updateSystemStatus();
updateHorizonHealth();
setInterval(updateSystemStatus, 15000);
setInterval(updateHorizonHealth, 15000);

// Interactive Exchange Rate Calculator
const RATES = {
  NGN: { USDC: 0.000645, XLM: 0.00645, label: "NGN", rateStr: "1 NGN = 0.00065 USDC" },
  XAF: { USDC: 0.001667, XLM: 0.01667, label: "XAF", rateStr: "1 XAF = 0.00167 USDC" },
  KES: { USDC: 0.007692, XLM: 0.07692, label: "KES", rateStr: "1 KES = 0.00769 USDC" },
  GHS: { USDC: 0.066667, XLM: 0.66667, label: "GHS", rateStr: "1 GHS = 0.0667 USDC" },
  TZS: { USDC: 0.000385, XLM: 0.003846, label: "TZS", rateStr: "1 TZS = 0.00038 USDC" },
  ZMW: { USDC: 0.037037, XLM: 0.37037, label: "ZMW", rateStr: "1 ZMW = 0.0370 USDC" },
  RWF: { USDC: 0.000758, XLM: 0.007576, label: "RWF", rateStr: "1 RWF = 0.00076 USDC" }
};

const sendAmountInput = document.getElementById("calc-send-amount");
const sendCurrencySelect = document.getElementById("calc-send-currency");
const receiveAmountInput = document.getElementById("calc-receive-amount");
const receiveAssetSelect = document.getElementById("calc-receive-asset");

const rateDisplay = document.getElementById("rate-display");
const feeDisplay = document.getElementById("fee-display");
const finalDisplay = document.getElementById("final-display");

function calculateConversion() {
  if (!sendAmountInput || !sendCurrencySelect || !receiveAssetSelect) return;

  const sendAmt = parseFloat(sendAmountInput.value) || 0;
  const sendCurrency = sendCurrencySelect.value;
  const receiveAsset = receiveAssetSelect.value;

  const config = RATES[sendCurrency];
  if (!config) return;

  const rate = config[receiveAsset] || 0;

  // Operator fee (1.5%)
  const fee = sendAmt * 0.015;
  const netAmt = Math.max(0, sendAmt - fee);
  const receiveVal = netAmt * rate;

  // Format decimal display outputs to 2 decimal places
  const formattedFee = fee.toFixed(2);
  const formattedReceiveVal = receiveVal.toFixed(2);

  // Update DOM elements cleanly
  if (rateDisplay) {
    rateDisplay.textContent = config.rateStr.replace("USDC", receiveAsset);
  }
  if (feeDisplay) {
    feeDisplay.textContent = `${formattedFee} ${sendCurrency}`;
  }
  if (receiveAmountInput) {
    receiveAmountInput.value = formattedReceiveVal;
  }
  if (finalDisplay) {
    finalDisplay.textContent = `${formattedReceiveVal} ${receiveAsset}`;
  }
}

// Add event listeners for inputs (including keypress and keyup for live calculation)
if (sendAmountInput) {
  sendAmountInput.addEventListener("input", calculateConversion);
  sendAmountInput.addEventListener("keypress", calculateConversion);
  sendAmountInput.addEventListener("keyup", calculateConversion);
  sendAmountInput.addEventListener("change", calculateConversion);
}
if (sendCurrencySelect) {
  sendCurrencySelect.addEventListener("change", calculateConversion);
}
if (receiveAssetSelect) {
  receiveAssetSelect.addEventListener("change", calculateConversion);
}

// Initial calculation
calculateConversion();
