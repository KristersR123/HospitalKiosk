// doctorDashboard.js
// Lists patients "Please See Doctor" or "With Doctor", lets the doctor Accept or Discharge

const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const doctorDashboard = document.getElementById("doctor-dashboard");

let doctorTimers = {};

function loadDoctorQueue() {
  fetch(`${RENDER_API_URL}/doctor-queue`)
    .then(r => r.json())
    .then(patients => {
      doctorDashboard.innerHTML = "";
      if (!patients || patients.length === 0) {
        doctorDashboard.innerHTML = "<p>No patients currently being seen.</p>";
        return;
      }
      // Clear existing intervals
      Object.keys(doctorTimers).forEach(pid => clearInterval(doctorTimers[pid]));

      patients.forEach(p => {
        const card = document.createElement("div");
        card.classList.add("patient-card");
        card.id = `doctor-patient-${p.id}`;

        const statusText = p.status === "With Doctor" ? "Being Seen" : "Waiting for Doctor";
        const timerDisplay = (p.status === "With Doctor")
          ? `<p>Time With Doctor: <span id="timer-${p.id}">0 min</span></p>`
          : "";

        card.innerHTML = `
          <h2>Patient #${p.queueNumber}</h2>
          <p>Severity: <span class="${p.severity.toLowerCase()}">${p.severity}</span></p>
          <p>Status: <span id="status-${p.id}">${statusText}</span></p>
          ${timerDisplay}
          ${p.status === "Please See Doctor" 
            ? `<button class="accept-button" onclick="acceptPatient('${p.id}')">Accept</button>`
            : ""
          }
          ${p.status === "With Doctor"
            ? `<button class="discharge-button" onclick="dischargePatient('${p.id}')">Discharge</button>`
            : ""
          }
        `;
        doctorDashboard.appendChild(card);

        // Start timer if "With Doctor"
        if (p.status === "With Doctor") {
          startDoctorTimer(p.id, p.acceptedTime);
        }
      });
    })
    .catch(err => {
      console.error("Error loading doctor queue:", err);
    });
}

function acceptPatient(patientID) {
  fetch(`${RENDER_API_URL}/accept-patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientID })
  })
    .then(r => r.json())
    .then(() => {
      alert(`Patient ${patientID} accepted by doctor.`);
      loadDoctorQueue(); // Re-load
    })
    .catch(err => console.error("acceptPatient error:", err));
}

function startDoctorTimer(patientID, acceptedTime) {
  // Start a local time-interval for display
  const start = new Date(acceptedTime).getTime();
  if (doctorTimers[patientID]) clearInterval(doctorTimers[patientID]);

  doctorTimers[patientID] = setInterval(() => {
    const now = Date.now();
    const elapsed = Math.floor((now - start) / 1000);
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;
    const timerEl = document.getElementById(`timer-${patientID}`);
    if (timerEl) timerEl.innerHTML = `${m} min ${s}s`;
  }, 1000);
}

function dischargePatient(patientID) {
  clearInterval(doctorTimers[patientID]);
  fetch(`${RENDER_API_URL}/discharge-patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientID })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        alert(`Patient ${patientID} discharged.`);
        document.getElementById(`doctor-patient-${patientID}`)?.remove();
      } else {
        alert("Error discharging patient.");
      }
      loadDoctorQueue();
    })
    .catch(err => console.error("dischargePatient error:", err));
}

// Refresh every 10s
setInterval(loadDoctorQueue, 10000);

document.addEventListener("DOMContentLoaded", loadDoctorQueue);