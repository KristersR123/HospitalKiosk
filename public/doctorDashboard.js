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
  
        patients.forEach(patient => {
          const card = document.createElement("div");
          card.classList.add("patient-card");
          card.id = `doctor-patient-${patient.id}`;
  
          let statusText = patient.status === "With Doctor" ? "Being Seen" : "Waiting for Doctor";
          let timerHTML = (patient.status === "With Doctor")
            ? `<p>Time With Doctor: <span id="timer-${patient.id}">0 min</span></p>` 
            : "";
  
          let acceptHTML = (patient.status === "Please See Doctor")
            ? `<button class="accept-button" onclick="acceptPatient('${patient.id}')">Accept</button>` 
            : "";
          let dischargeHTML = (patient.status === "With Doctor")
            ? `<button class="discharge-button" onclick="dischargePatient('${patient.id}')">Discharge</button>` 
            : "";
  
          card.innerHTML = `
            <h2>Patient #${patient.queueNumber}</h2>
            <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
            <p>Status: <span id="status-${patient.id}">${statusText}</span></p>
            ${timerHTML}
            ${acceptHTML}
            ${dischargeHTML}
          `;
          doctorDashboard.appendChild(card);
  
          // If already "With Doctor", start the timer
          if (patient.status === "With Doctor") {
            startDoctorTimer(patient.id, patient.acceptedTime);
          }
        });
      })
      .catch(err => console.error("Error loading doctor queue:", err));
}

// Accept a "Please See Doctor" patient => "With Doctor"
function acceptPatient(patientID) {
  fetch(`${RENDER_API_URL}/accept-patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientID })
  })
    .then(r => r.json())
    .then(() => {
      alert(`Patient ${patientID} accepted by the doctor.`);
      const statusEl = document.getElementById(`status-${patientID}`);
      const acceptBtn = document.querySelector(`#doctor-patient-${patientID} .accept-button`);
      const dischargeBtn = document.querySelector(`#doctor-patient-${patientID} .discharge-button`);
      if (statusEl) statusEl.innerText = "Being Seen";
      if (acceptBtn) acceptBtn.style.display = "none";
      if (dischargeBtn) dischargeBtn.style.display = "inline-block";
      let acceptedTime = new Date().toISOString();
      startDoctorTimer(patientID, acceptedTime);
      loadDoctorQueue();
    })
    .catch(err => console.error("❌ Error accepting patient:", err));
}


// Start a local timer for the "With Doctor" status
function startDoctorTimer(patientID, acceptedTime) {
  let start = new Date(acceptedTime).getTime();
  if (doctorTimers[patientID]) clearInterval(doctorTimers[patientID]);
  doctorTimers[patientID] = setInterval(() => {
    let now = Date.now();
    let elapsed = Math.floor((now - start) / 1000);
    let m = Math.floor(elapsed / 60);
    let s = elapsed % 60;
    let timerEl = document.getElementById(`timer-${patientID}`);
    if (timerEl) {
      timerEl.innerHTML = `${m} min ${s}s`;
    }
  }, 1000);
}

// Discharge => calls /discharge-patient => removes from DB & recalc queue
function dischargePatient(patientID) {
  clearInterval(doctorTimers[patientID]);
  fetch(`${RENDER_API_URL}/discharge-patient`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientID })
  })
    .then(r => r.json())
    .then(() => {
      alert(`Patient ${patientID} has been discharged.`);
      const card = document.getElementById(`doctor-patient-${patientID}`);
      if (card) card.remove();
      loadDoctorQueue();
    })
    .catch(err => console.error("❌ Error discharging patient:", err));
}




// Reload every 10 seconds
setInterval(loadDoctorQueue, 10000);

// Load dashboard on page load
document.addEventListener("DOMContentLoaded", loadDoctorQueue);