const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const doctorDashboard = document.getElementById("doctor-dashboard");

let doctorTimers = {}; // Track active timers

function loadDoctorQueue() {
    fetch(`${RENDER_API_URL}/doctor-queue`)
      .then(r => r.json())
      .then(patients => {
        console.log("📌 Doctor queue:", patients);
        doctorDashboard.innerHTML = "";
  
        if (!Array.isArray(patients) || patients.length === 0) {
          doctorDashboard.innerHTML = "<p>No patients currently being seen.</p>";
          return;
        }
  
        patients.forEach(pt => {
          let card = document.createElement("div");
          card.classList.add("patient-card");
          card.id = `doctor-patient-${pt.id}`;
  
          let statusText = pt.status === "With Doctor" ? "Being Seen" : "Waiting for Doctor";
  
          // Show a local timer only if "With Doctor"
          let localTimerHtml = pt.status === "With Doctor"
            ? `<p>Time With Doctor: <span id="timer-${pt.id}">0 min</span></p>`
            : "";
  
          let acceptBtnHtml = pt.status === "Please See Doctor"
            ? `<button class="accept-button" onclick="acceptPatient('${pt.id}')">Accept</button>`
            : "";
  
          let dischargeBtnHtml = pt.status === "With Doctor"
            ? `<button class="discharge-button" onclick="dischargePatient('${pt.id}')">Discharge</button>`
            : "";
  
          card.innerHTML = `
            <h2>Patient #${pt.queueNumber}</h2>
            <p>Severity: <span class="${pt.severity.toLowerCase()}">${pt.severity}</span></p>
            <p>Status: <span id="status-${pt.id}">${statusText}</span></p>
            ${localTimerHtml}
            ${acceptBtnHtml}
            ${dischargeBtnHtml}
          `;
  
          doctorDashboard.appendChild(card);
  
          // If "With Doctor", start a local timer
          if (pt.status === "With Doctor") {
            startDoctorTimer(pt.id, pt.acceptedTime);
          }
        });
      })
      .catch(err => console.error("❌ Error loading doctor queue:", err));
}
  


// Accept a patient => POST /accept-patient
function acceptPatient(patientID) {
    fetch(`${RENDER_API_URL}/accept-patient`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientID })
    })
      .then(r => r.json())
      .then(data => {
        alert(`Patient ${patientID} accepted by doctor.`);
  
        // Swap UI from "Please See Doctor" => "With Doctor"
        let statusEl = document.getElementById(`status-${patientID}`);
        if (statusEl) statusEl.innerText = "Being Seen";
  
        let acceptBtn = document.querySelector(`#doctor-patient-${patientID} .accept-button`);
        let dischargeBtn = document.querySelector(`#doctor-patient-${patientID} .discharge-button`);
  
        if (acceptBtn) acceptBtn.style.display = "none";
        if (dischargeBtn) dischargeBtn.style.display = "inline-block";
  
        // Start local timer
        let acceptedTime = new Date().toISOString();
        startDoctorTimer(patientID, acceptedTime);
  
        loadDoctorQueue();
      })
      .catch(err => console.error("❌ Error accepting patient:", err));
}
  


// Start local "Time with doc" timer
function startDoctorTimer(patientID, acceptedTime) {
    let startMs = new Date(acceptedTime).getTime();
    if (doctorTimers[patientID]) {
      clearInterval(doctorTimers[patientID]);
      delete doctorTimers[patientID];
    }
    doctorTimers[patientID] = setInterval(() => {
      let now = Date.now();
      let elapsedSec = Math.floor((now - startMs) / 1000);
      let mm = Math.floor(elapsedSec / 60);
      let ss = elapsedSec % 60;
      let timerEl = document.getElementById(`timer-${patientID}`);
      if (timerEl) {
        timerEl.innerHTML = `${mm} min ${ss}s`;
      }
    }, 1000);
}
  
// Discharge => POST /discharge-patient
function dischargePatient(patientID) {
    clearInterval(doctorTimers[patientID]);
    delete doctorTimers[patientID];
  
    fetch(`${RENDER_API_URL}/discharge-patient`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patientID })
    })
      .then(r => r.json())
      .then(data => {
        alert(`Patient ${patientID} has been discharged.`);
        let card = document.getElementById(`doctor-patient-${patientID}`);
        if (card) card.remove();
        loadDoctorQueue();
      })
      .catch(err => console.error("❌ Error discharging patient:", err));
}


// Reload every 10 seconds
setInterval(loadDoctorQueue, 10000);

// Load dashboard on page load
document.addEventListener("DOMContentLoaded", loadDoctorQueue);