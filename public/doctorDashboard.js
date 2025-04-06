// RENDER_API_URL is the backend endpoint from which to fetch doctor queue data
const RENDER_API_URL = "https://hospitalkiosk.onrender.com";

// doctorQueueContainer references the DOM element for displaying the queue
const doctorQueueContainer = document.getElementById("doctor-dashboard");

// doctorTimers stores active timer intervals keyed by patient IDs
let doctorTimers = {}; 

// autoRefreshEnabled indicates whether the queue auto-refresh is active
let autoRefreshEnabled = true;

/**
 * loadDoctorQueue fetches the doctor queue data and updates the DOM.
 */
function loadDoctorQueue() {
    // Checks if auto-refresh is disabled before proceeding
    if (!autoRefreshEnabled) return;

    // Fetches the doctor-queue data from the backend
    fetch(`${RENDER_API_URL}/doctor-queue`)
        .then(response => response.json())
        .then(patients => {
            // Clears any previous content in the container
            doctorQueueContainer.innerHTML = "";

            // If there are no patients, displays a message and exits
            if (!patients || patients.length === 0) {
                doctorQueueContainer.innerHTML = "<p>No patients in queue.</p>";
                return;
            }

            // Creates an HTML table to list all patients in the doctor queue
            const table = document.createElement("table");
            table.className = "doctor-table";

            // Builds the table header with column titles
            const thead = document.createElement("thead");
            thead.innerHTML = `
                <tr>
                    <th>Queue #</th>
                    <th>Patient ID</th>
                    <th>Condition</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Time With Doctor</th>
                    <th>Action</th>
                </tr>
            `;
            table.appendChild(thead);

            // Creates a tbody for patient rows
            const tbody = document.createElement("tbody");

            // Iterates over each patient to construct a row in the table
            patients.forEach(patient => {
                // Skips if patient is discharged or flagged as seen
                if (patient.status === "Discharged" || patient.wasSeen) return;

                // Creates a new table row
                const row = document.createElement("tr");
                // Calculates time the patient has been with the doctor
                const withDoctorTime = calculateTimeWithDoctor(patient);

                // Builds the row cells
                row.innerHTML = `
                    <td>#${patient.queueNumber}</td>
                    <td>${patient.patientID}</td>
                    <td>${patient.condition}</td>
                    <td>${patient.severity}</td>
                    <td>${patient.status}</td>
                    <td>${withDoctorTime}</td>
                    <td>
                        ${
                            patient.status === "Please See Doctor"
                              ? `<button onclick="acceptPatient('${patient.patientID}')">Accept</button>`
                              : patient.status === "With Doctor"
                                  ? `<button onclick="dischargePatient('${patient.patientID}')">Discharge</button>`
                                  : "--"
                        }
                    </td>
                `;

                // Highlights row if the patient status is "Please See Doctor"
                if (patient.status === "Please See Doctor") {
                    row.style.backgroundColor = "#d4edda";
                }

                // Appends row to the table body
                tbody.appendChild(row);
            });

            // Appends the completed tbody to the table
            table.appendChild(tbody);
            // Appends the table to the container
            doctorQueueContainer.appendChild(table);
        })
        .catch(err => {
            // Logs an error if fetching or processing fails
            console.error("Error loading doctor queue:", err);
        });
}

/**
 * calculateTimeWithDoctor returns the number of minutes a patient
 * has been with the doctor, based on acceptedTime.
 */
function calculateTimeWithDoctor(patient) {
    if (patient.status !== "With Doctor" || !patient.acceptedTime) return "--";
    const acceptedTime = new Date(patient.acceptedTime).getTime();
    const now = Date.now();
    const diffMinutes = Math.floor((now - acceptedTime) / 60000);
    return `${diffMinutes} min`;
}

/**
 * acceptPatient calls the API to mark a patient as accepted by the doctor.
 */
function acceptPatient(patientID) {
    fetch(`${RENDER_API_URL}/accept-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID })
    })
        .then(res => res.json())
        .then(response => {
            console.log("Accepted:", response);
            loadDoctorQueue();
        })
        .catch(err => console.error("Error accepting patient:", err));
}

/**
 * dischargePatient calls the API to mark a patient as discharged.
 */
function dischargePatient(patientID) {
    fetch(`${RENDER_API_URL}/discharge-patient`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID })
    })
        .then(res => res.json())
        .then(response => {
            console.log("Discharged:", response);
            loadDoctorQueue();
        })
        .catch(err => console.error("Error discharging patient:", err));
}

/**
 * Sets an interval that periodically calls loadDoctorQueue
 * to refresh the display every 15 seconds.
 */
setInterval(loadDoctorQueue, 15000);

/**
 * Runs on DOMContentLoaded, initiating the first queue load,
 * requesting notification permission, and adding a button
 * for toggling auto-refresh.
 */
document.addEventListener("DOMContentLoaded", () => {
    loadDoctorQueue();

    // Places the toggle button above the doctorQueueContainer
    doctorQueueContainer.parentNode.insertBefore(toggleBtn, doctorQueueContainer);
});
