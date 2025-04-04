const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const doctorDashboard = document.getElementById("doctor-dashboard");

let doctorTimers = {}; // Track active timers

let autoRefreshEnabled = true;

function loadDoctorQueue() {
    if (!autoRefreshEnabled) return;

    fetch(`${RENDER_API_URL}/doctor-queue`)
        .then(response => response.json())
        .then(patients => {
            doctorQueueContainer.innerHTML = "";

            if (!patients || patients.length === 0) {
                doctorQueueContainer.innerHTML = "<p>No patients in queue.</p>";
                return;
            }

            const statsDiv = document.createElement("div");
            statsDiv.className = "queue-stats";
            const averageTime = calculateAverageDoctorTime(patients);
            statsDiv.innerHTML = `<strong>Average Time with Doctor:</strong> ${averageTime} min`;
            doctorQueueContainer.appendChild(statsDiv);

            const exportBtn = document.createElement("button");
            exportBtn.innerText = "Export Queue as CSV";
            exportBtn.onclick = () => exportCSV(patients);
            exportBtn.style.marginBottom = "10px";
            doctorQueueContainer.appendChild(exportBtn);

            const table = document.createElement("table");
            table.className = "doctor-table";

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

            const tbody = document.createElement("tbody");

            patients.forEach(patient => {
                const row = document.createElement("tr");
                const withDoctorTime = calculateTimeWithDoctor(patient);

                row.innerHTML = `
                    <td>#${patient.queueNumber}</td>
                    <td>${patient.patientID}</td>
                    <td>${patient.condition}</td>
                    <td>${patient.severity}</td>
                    <td>${patient.status}</td>
                    <td>${withDoctorTime}</td>
                    <td>
                        ${patient.status === "Please See Doctor" ? `<button onclick="acceptPatient('${patient.patientID}')">Accept</button>` :
                            patient.status === "With Doctor" ? `<button onclick="dischargePatient('${patient.patientID}')">Discharge</button>` :
                            "--"}
                    </td>
                `;

                if (patient.status === "Please See Doctor") {
                    row.style.backgroundColor = "#d4edda";
                    triggerDoctorReadyAlert(patient.patientID);
                    triggerDesktopNotification(patient);
                }

                tbody.appendChild(row);
            });

            table.appendChild(tbody);
            doctorQueueContainer.appendChild(table);
        })
        .catch(err => {
            console.error("Error loading doctor queue:", err);
        });
}

function calculateTimeWithDoctor(patient) {
    if (patient.status !== "With Doctor" || !patient.acceptedTime) return "--";
    const acceptedTime = new Date(patient.acceptedTime).getTime();
    const now = Date.now();
    const diffMinutes = Math.floor((now - acceptedTime) / 60000);
    return `${diffMinutes} min`;
}

function calculateAverageDoctorTime(patients) {
    const times = patients
        .filter(p => p.status === "With Doctor" && p.acceptedTime)
        .map(p => Math.floor((Date.now() - new Date(p.acceptedTime).getTime()) / 60000));

    if (times.length === 0) return 0;

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    return Math.round(avg);
}

function exportCSV(patients) {
    const headers = ["Queue #", "Patient ID", "Condition", "Severity", "Status", "Time With Doctor"];
    const rows = patients.map(p => [
        p.queueNumber,
        p.patientID,
        p.condition,
        p.severity,
        p.status,
        calculateTimeWithDoctor(p)
    ]);

    let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "doctor_queue.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function triggerDoctorReadyAlert(patientID) {
    const soundID = `doctor-ready-sound-${patientID}`;
    if (!document.getElementById(soundID)) {
        const audio = document.createElement("audio");
        audio.id = soundID;
        audio.src = "https://www.myinstants.com/media/sounds/bleep.mp3";
        audio.autoplay = true;
        document.body.appendChild(audio);

        setTimeout(() => {
            audio.remove();
        }, 3000);
    }
}

function triggerDesktopNotification(patient) {
    if (Notification.permission === "granted") {
        new Notification("Doctor Ready", {
            body: `Patient #${patient.queueNumber} (${patient.patientID}) is ready to be seen.`,
        });
    }
}

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

function toggleAutoRefresh() {
    autoRefreshEnabled = !autoRefreshEnabled;
    document.getElementById("toggle-refresh-btn").innerText = autoRefreshEnabled ? "Pause Refresh" : "Resume Refresh";
    if (autoRefreshEnabled) loadDoctorQueue();
}

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

setInterval(loadDoctorQueue, 15000);
document.addEventListener("DOMContentLoaded", () => {
    loadDoctorQueue();
    requestNotificationPermission();

    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggle-refresh-btn";
    toggleBtn.innerText = "Pause Refresh";
    toggleBtn.style.margin = "10px";
    toggleBtn.onclick = toggleAutoRefresh;
    document.body.insertBefore(toggleBtn, doctorQueueContainer);
});
