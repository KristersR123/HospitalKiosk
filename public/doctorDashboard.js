const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const doctorDashboard = document.getElementById("doctor-dashboard");

// Function to Load Doctor's Dashboard
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

                let timerDisplay = patient.status === "With Doctor" ? `<p>Time With Doctor: <span id="timer-${patient.id}">0 min</span></p>` : "";

                patientCard.innerHTML = `
                    <h2>Patient #${patient.queueNumber}</h2>
                    <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
                    <p>Status: <span id="status-${patient.id}">${patient.status}</span></p>
                    ${timerDisplay}
                    ${patient.status === "Please See Doctor" ? `<button class="accept-button" onclick="acceptPatient('${patient.id}')">Accept</button>` : ""}
                    ${patient.status === "With Doctor" ? `<button class="discharge-button" onclick="dischargePatient('${patient.id}')">Discharge</button>` : ""}
                `;

                doctorDashboard.appendChild(patientCard);
            });
        })
        .catch(error => console.error("❌ Error loading doctor queue:", error));
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
        alert(`✅ Patient ${patientID} has been accepted by the doctor.`);
        
        document.getElementById(`status-${patientID}`).innerText = "With Doctor";
        document.querySelector(`#doctor-patient-${patientID} .accept-button`).style.display = "none";
        document.querySelector(`#doctor-patient-${patientID} .discharge-button`).style.display = "inline-block";

        startDoctorTimer(patientID);
        loadDoctorQueue();
    })
    .catch(error => console.error("❌ Error accepting patient:", error));
}

// ✅ Track Time a Patient Spends With the Doctor
let doctorTimers = {};


function startDoctorTimer(patientID) {
    let timeSpent = 0;
    
    doctorTimers[patientID] = setInterval(() => {
        timeSpent++;
        document.getElementById(`timer-${patientID}`).innerHTML = `${timeSpent} min`;
    }, 60000); // ✅ Updates every 1 minute
}

// Function to Discharge a Patient
function dischargePatient(patientID) {
    clearInterval(doctorTimers[patientID]); // ✅ Stop timer

    fetch(`${RENDER_API_URL}/discharge-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID })
    })
    .then(response => response.json())
    .then(data => {
        alert(`✅ Patient ${patientID} has been discharged.`);

        // ✅ Remove patient from dashboard
        document.getElementById(`doctor-patient-${patientID}`).remove();
        loadDoctorQueue();
    })
    .catch(error => console.error("❌ Error discharging patient:", error));
}


// ✅ Reload every 10 seconds
setInterval(loadDoctorQueue, 10000);

// Load dashboard on page load
document.addEventListener("DOMContentLoaded", loadDoctorQueue);
