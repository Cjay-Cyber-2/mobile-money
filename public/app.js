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

loadTheme();

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

updateSystemStatus();
setInterval(updateSystemStatus, 15000);

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
const finalDisplay = document.getElementById(
  "final-display"
);

function calculateConversion() {
  if (!sendAmountInput || !sendCurrencySelect || !receiveAssetSelect) return;

  const sendAmt = parseFloat(sendAmountInput.value) || 0;
  const sendCurrency = sendCurrencySelect.value;
  const receiveAsset = receiveAssetSelect.value;

  const config = RATES[sendCurrency];
  if (!config) return;

  const rate = config[receiveAsset] || 0;
  const fee = sendAmt * 0.015;
  const netAmt = Math.max(0, sendAmt - fee);
  const receiveVal = netAmt * rate;

  const formattedFee = fee.toFixed(2);
  const formattedReceiveVal = receiveVal.toFixed(2);

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

calculateConversion();

// SEP-24 Document Upload Retry Support in Hosted Flow
window.handleDocumentUploadFailure = function(containerId, errorDetails) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = `
    <div class="upload-error-state">
      <p class="error-msg">❌ Document validation failed: ${errorDetails || "Invalid file format or verification error."}</p>
      <button id="retry-upload-btn" class="btn btn-primary">
        Retry Upload
      </button>
    </div>
  `;

  const retryBtn = container.querySelector("#retry-upload-btn");
  if (retryBtn) {
    retryBtn.addEventListener("click", async () => {
      retryBtn.disabled = true;
      retryBtn.textContent = "Cleaning storage & retrying...";
      
      try {
        const applicantId = container.dataset.applicantId;
        const docType = container.dataset.docType;
        const fileInput = document.getElementById(container.dataset.fileInputId);
        
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
          throw new Error("Please select a valid document file to retry.");
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        reader.onload = async function(e) {
          const base64Data = e.target.result.split(",")[1];
          const payload = {
            applicant_id: applicantId,
            type: docType,
            filename: file.name,
            data: base64Data
          };

          const res = await fetch("/api/kyc/documents/retry", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
          });

          const resultJson = await res.json();
          if (res.ok) {
            container.innerHTML = `<p class="success-msg">✅ Document successfully re-uploaded and verified!</p>`;
          } else {
            throw new Error(resultJson.message || "Retry upload failed");
          }
        };

        reader.readAsDataURL(file);
      } catch (err) {
        window.handleDocumentUploadFailure(containerId, err.message);
      }
    });
  }
};
