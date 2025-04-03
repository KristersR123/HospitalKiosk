/******************************************************
 * waitlist.js
 * 
 * PURPOSE:
 *  - Show a real-time view of all patients in "Queueing for ..."
 *    or "Please See Doctor" status.
 *  - Listen to Firebase changes and automatically update the UI.
 *  - Run local countdown timers for each patient until 0 => 
 *    "Please See Doctor" (or rely on server logic).
 ******************************************************/

// waitlist.js
// Real-time display of patients by condition+severity, countdown to "Please See Doctor"

const RENDER_API_URL = "https://hospitalkiosk.onrender.com";

// If using direct Firebase calls, you can do so. 
// Otherwise, we can just poll the /waitlist endpoint every X seconds.

let countdownIntervals = {};

function loadWaitlist() {
  fetch(`${RENDER_API_URL}/waitlist`)
    .then(r => r.json())
    .then(patients => {
      renderWaitlist(patients);
    })
    .catch(err => console.error("Error loading waitlist:", err));
}

function renderWaitlist(patients) {
  const container = document.getElementById("waitlist-container");
  container.innerHTML = "";

  // Clear old countdowns
  Object.keys(countdownIntervals).forEach(pid => clearInterval(countdownIntervals[pid]));
  countdownIntervals = {};

  if (!patients || patients.length === 0) {
    container.innerHTML = "<p>No patients in the waitlist.</p>";
    return;
  }

  // Group by "condition-severity"
  const groups = {};
  let firstPatient = null;

  patients.forEach(p => {
    if (!p.status || p.status === "With Doctor") return; // skip
    const key = `${p.condition}-${p.severity}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
    // Track first "Please See Doctor"
    if (
      p.status === "Please See Doctor" && 
      (!firstPatient || p.queueNumber < firstPatient.queueNumber)
    ) {
      firstPatient = p;
    }
  });

  Object.keys(groups).forEach(groupKey => {
    const [condition, severity] = groupKey.split("-");
    const sortedQueue = groups[groupKey].sort((a, b) => a.queueNumber - b.queueNumber);

    const section = document.createElement("div");
    section.classList.add("condition-section");
    section.setAttribute("data-condition", groupKey);
    section.innerHTML = `
      <div class="condition-title">
        ${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span>
      </div>
    `;

    const list = document.createElement("ul");
    list.classList.add("patient-list");

    sortedQueue.forEach(p => {
      const li = document.createElement("li");
      li.classList.add("patient-item");
      li.id = `queue-${p.patientID}`;
      const waitTime = p.estimatedWaitTime || 0;

      li.innerHTML = `
        <div class="queue-patient">
          Queue Position: <span class="queue-pos">#${p.queueNumber}</span><br>
          Estimated Wait Time:
          <span id="countdown-${p.patientID}" class="countdown">${Math.floor(waitTime)} min</span>
        </div>
      `;
      list.appendChild(li);
      startCountdown(p.patientID, waitTime, groupKey, p.queueNumber);
    });

    section.appendChild(list);
    container.appendChild(section);
  });

  // Show "Doctor is Ready" for that first "Please See Doctor" if any
  if (firstPatient) {
    updateDoctorReadyMessage(
      `${firstPatient.condition}-${firstPatient.severity}`, 
      firstPatient.queueNumber
    );
  }
}

function startCountdown(patientID, initialTime, conditionKey, queueNumber) {
  const countdownEl = document.getElementById(`countdown-${patientID}`);
  if (!countdownEl) return;

  if (countdownIntervals[patientID]) clearInterval(countdownIntervals[patientID]);

  let timeLeft = Math.floor(initialTime) * 60;
  countdownIntervals[patientID] = setInterval(() => {
    if (timeLeft <= 0) {
      countdownEl.innerHTML = "Please See Doctor";
      clearInterval(countdownIntervals[patientID]);
      delete countdownIntervals[patientID];
      updateDoctorReadyMessage(conditionKey, queueNumber);
    } else {
      const minutes = Math.floor(timeLeft / 60);
      countdownEl.innerHTML = `${minutes} min`;
    }
    timeLeft--;
  }, 1000);
}

function updateDoctorReadyMessage(conditionKey, queueNumber) {
  const section = document.querySelector(`[data-condition="${conditionKey}"]`);
  if (!section) return;

  let doctorReadyDiv = section.querySelector(".doctor-ready");
  if (!doctorReadyDiv) {
    doctorReadyDiv = document.createElement("div");
    doctorReadyDiv.classList.add("doctor-ready");
    doctorReadyDiv.style.fontWeight = "bold";
    doctorReadyDiv.style.color = "#28a745";
    doctorReadyDiv.style.marginTop = "10px";
    doctorReadyDiv.style.fontSize = "18px";
    doctorReadyDiv.style.padding = "10px";
    section.appendChild(doctorReadyDiv);
  }
  doctorReadyDiv.innerHTML = `Patient #${queueNumber} - Doctor is Ready for You`;
}

function pollWaitlist() {
  loadWaitlist();
}

// Optionally poll every 30s or do a real-time DB approach
setInterval(pollWaitlist, 30000);
document.addEventListener("DOMContentLoaded", pollWaitlist);