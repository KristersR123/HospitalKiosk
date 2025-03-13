const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const doctorDashboard = document.getElementById("doctor-dashboard");


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
                    <p>Condition: <b>${patient.condition}</b></p>
                    <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
                    <p>Status: <span id="status-${patient.id}">${statusText}</span></p>
                    ${timerDisplay}
                    ${patient.status === "Please See Doctor" ? `<button class="accept-button" onclick="acceptPatient('${patient.id}')">Accept</button>` : ""}
                    ${patient.status === "With Doctor" ? `<button class="discharge-button" onclick="dischargePatient('${patient.id}')">Discharge</button>` : ""}
                `;

                doctorDashboard.appendChild(patientCard);

                // ✅ If patient is already "With Doctor", start the timer
                if (patient.status === "With Doctor") {
                    startDoctorTimer(patient.id, patient.acceptedTime);
                }
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
    .then(data => {
        alert(`✅ Patient ${patientID} has been accepted by the doctor.`);
        
        // Update the UI only if the elements exist
        const statusElement = document.getElementById(`status-${patientID}`);
        const acceptButton = document.querySelector(`#doctor-patient-${patientID} .accept-button`);
        const dischargeButton = document.querySelector(`#doctor-patient-${patientID} .discharge-button`);
        
        if (statusElement) {
            statusElement.innerText = "Being Seen";
        }
        if (acceptButton) {
            acceptButton.style.display = "none";
        }
        if (dischargeButton) {
            dischargeButton.style.display = "inline-block";
        }
        
        // Optionally, delay the refresh of the queue to let UI update complete
        setTimeout(() => loadDoctorQueue(), 1000);
    })
    .catch(error => console.error("❌ Error accepting patient:", error));
}

let doctorTimers = {}; // Track active timers

function startDoctorTimer(patientID, acceptedTime) {
    let startTime = new Date(acceptedTime).getTime();
    
    if (doctorTimers[patientID]) {
        clearInterval(doctorTimers[patientID]); // Clear existing timer if running
    }

    doctorTimers[patientID] = setInterval(() => {
        let now = new Date().getTime();
        let elapsedMinutes = Math.floor((now - startTime) / 60000); // Convert to minutes

        let timerElement = document.getElementById(`timer-${patientID}`);
        if (timerElement) {
            timerElement.innerText = `${elapsedMinutes} min`;
        }
    }, 60000); // ✅ Update every 1 minute
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
    .then(() => {
        alert(`✅ Patient ${patientID} has been discharged.`);

        // ✅ Remove patient from doctor dashboard
        document.getElementById(`doctor-patient-${patientID}`).remove();
        loadDoctorQueue();
    })
    .catch(error => console.error("❌ Error discharging patient:", error));
}


// ✅ Reload every 10 seconds
setInterval(loadDoctorQueue, 10000);

// Load dashboard on page load
document.addEventListener("DOMContentLoaded", loadDoctorQueue);
