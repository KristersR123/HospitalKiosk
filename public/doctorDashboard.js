const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const doctorDashboard = document.getElementById("doctor-dashboard");

let doctorTimers = {}; // Track active timers

function loadDoctorQueue() {
    fetch(`${RENDER_API_URL}/doctor-queue`)
        .then(response => response.json())
        .then(patients => {
            console.log("📌 Doctor queue:", patients);
            doctorDashboard.innerHTML = "";

            if (!Array.isArray(patients) || patients.length === 0) {
                doctorDashboard.innerHTML = "<p>No patients currently being seen.</p>";
                return;
            }

            patients.forEach(patient => {
                let patientCard = document.createElement("div");
                patientCard.classList.add("patient-card");
                patientCard.id = `doctor-patient-${patient.id}`;

                let statusText = patient.status === "With Doctor" ? "Being Seen" : "Waiting for Doctor";
                let timerDisplay = patient.status === "With Doctor" ?
                    `<p>Time With Doctor: <span id="timer-${patient.id}">0 min</span></p>` : "";

                patientCard.innerHTML = `
                    <h2>Patient #${patient.queueNumber}</h2>
                    <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
                    <p>Status: <span id="status-${patient.id}">${statusText}</span></p>
                    ${timerDisplay}
                    ${patient.status === "Please See Doctor" ? `<button class="accept-button" onclick="acceptPatient('${patient.id}')">Accept</button>` : ""}
                    ${patient.status === "With Doctor" ? `<button class="discharge-button" onclick="dischargePatient('${patient.id}')">Discharge</button>` : ""}
                `;

                doctorDashboard.appendChild(patientCard);

                if (patient.status === "With Doctor") {
                    startDoctorTimer(patient.id, patient.acceptedTime);
                }
            });
        })
        .catch(error => console.error("Error loading doctor queue:", error));
}

// Function to Accept a Patient
function acceptPatient(patientID) {
    fetch(`${RENDER_API_URL}/accept-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID })
    })
    .then(response => response.json())
    .then(() => {
        alert(`Patient ${patientID} has been accepted by the doctor.`);
        // Check if the elements exist before updating styles
        const statusElem = document.getElementById(`status-${patientID}`);
        const acceptBtn = document.querySelector(`#doctor-patient-${patientID} .accept-button`);
        const dischargeBtn = document.querySelector(`#doctor-patient-${patientID} .discharge-button`);
        if (statusElem) statusElem.innerText = "Being Seen";
        if (acceptBtn) acceptBtn.style.display = "none";
        if (dischargeBtn) dischargeBtn.style.display = "inline-block";
        // Record current time as acceptedTime
        let acceptedTime = new Date().toISOString();
        startDoctorTimer(patientID, acceptedTime);
        loadDoctorQueue();
    })
    .catch(error => console.error("❌ Error accepting patient:", error));
}



function startDoctorTimer(patientID, acceptedTime) {
    let startTime = new Date(acceptedTime).getTime();
    if (doctorTimers[patientID]) {
        clearInterval(doctorTimers[patientID]);
    }
    doctorTimers[patientID] = setInterval(() => {
        let now = new Date().getTime();
        let elapsedMinutes = Math.floor((now - startTime) / 60000);
        let timerElement = document.getElementById(`timer-${patientID}`);
        if (timerElement) {
            timerElement.innerHTML = `${elapsedMinutes} min`;
        }
    }, 60000);
}

// Function to Discharge a Patient
function dischargePatient(patientID) {
    clearInterval(doctorTimers[patientID]); // Stop timer

    fetch(`${RENDER_API_URL}/discharge-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID })
    })
    .then(response => response.json())
    .then(() => {
        alert(`Patient ${patientID} has been discharged.`);
        const patientCard = document.getElementById(`doctor-patient-${patientID}`);
        if (patientCard) patientCard.remove();
        loadDoctorQueue();
    })
    .catch(error => console.error("❌ Error discharging patient:", error));
}



// Reload every 10 seconds
setInterval(loadDoctorQueue, 10000);

// Load dashboard on page load
document.addEventListener("DOMContentLoaded", loadDoctorQueue);