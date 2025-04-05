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
 * This function also handles displaying various UI components such as
 * average doctor time, CSV export, and per-patient action buttons.
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

            // Creates a stats section to display average time with doctor
            const statsDiv = document.createElement("div");
            statsDiv.className = "queue-stats";
            const averageTime = calculateAverageDoctorTime(patients);
            statsDiv.innerHTML = `<strong>Average Time with Doctor:</strong> ${averageTime} min`;
            doctorQueueContainer.appendChild(statsDiv);

            // Creates an export button for queue data as CSV
            const exportBtn = document.createElement("button");
            exportBtn.innerText = "Export Queue as CSV";
            exportBtn.onclick = () => exportCSV(patients);
            exportBtn.style.marginBottom = "10px";
            doctorQueueContainer.appendChild(exportBtn);

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
                    triggerDoctorReadyAlert(patient.patientID);
                    triggerDesktopNotification(patient);
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
 * calculateAverageDoctorTime calculates the average time (in minutes)
 * that currently 'With Doctor' patients have spent with the doctor.
 */
function calculateAverageDoctorTime(patients) {
    const times = patients
        .filter(p => p.status === "With Doctor" && p.acceptedTime)
        .map(p => Math.floor((Date.now() - new Date(p.acceptedTime).getTime()) / 60000));

    if (times.length === 0) return 0;

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return Math.round(avg);
}

/**
 * exportCSV generates a CSV file containing the current doctor queue data
 * and triggers a download in the browser.
 */
function exportCSV(patients) {
    const headers = ["Queue #", "Patient ID", "Condition", "Severity", "Status", "Time With Doctor"];
    // Filters out discharged or seen patients
    const rows = patients
        .filter(p => p.status !== "Discharged" && !p.wasSeen)
        .map(p => [
            p.queueNumber,
            p.patientID,
            p.condition,
            p.severity,
            p.status,
            calculateTimeWithDoctor(p)
        ]);

    // Constructs CSV content
    let csvContent =
        "data:text/csv;charset=utf-8," +
        headers.join(",") +
        "\n" +
        rows.map(e => e.join(",")).join("\n");

    // Encodes the CSV for download
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "doctor_queue.csv");

    // Appends link, triggers click, then removes link from the DOM
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * triggerDoctorReadyAlert plays a short audio alert if a patient
 * is ready to see the doctor.
 */
function triggerDoctorReadyAlert(patientID) {
    const soundID = `doctor-ready-sound-${patientID}`;
    // Checks if an alert is not already present
    if (!document.getElementById(soundID)) {
        const audio = document.createElement("audio");
        audio.id = soundID;
        audio.src = "https://www.myinstants.com/media/sounds/bleep.mp3";
        audio.autoplay = true;
        document.body.appendChild(audio);

        // Removes the audio element after 3 seconds
        setTimeout(() => {
            audio.remove();
        }, 3000);
    }
}

/**
 * triggerDesktopNotification displays a browser notification
 * indicating a patient is ready to be seen, if permission is granted.
 */
function triggerDesktopNotification(patient) {
    if (Notification.permission === "granted") {
        new Notification("Doctor Ready", {
            body: `Patient #${patient.queueNumber} (${patient.patientID}) is ready to be seen.`,
        });
    }
}

/**
 * requestNotificationPermission prompts for notification permission
 * if not already granted.
 */
function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

/**
 * toggleAutoRefresh toggles the autoRefreshEnabled flag
 * and updates the button text. If re-enabled, triggers
 * a loadDoctorQueue call immediately.
 */
function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    document.getElementById("toggle-refresh-btn").innerText =
        autoRefreshEnabled ? "Pause Refresh" : "Resume Refresh";
    if (autoRefreshEnabled) loadDoctorQueue();
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
    requestNotificationPermission();

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggle-refresh-btn";
    toggleBtn.innerText = "Pause Refresh";
    toggleBtn.style.margin = "10px";
    toggleBtn.onclick = toggleAutoRefresh;

    // Places the toggle button above the doctorQueueContainer
    doctorQueueContainer.parentNode.insertBefore(toggleBtn, doctorQueueContainer);
});
