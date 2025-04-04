const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");

const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// Function to Load & Auto-Update Waitlist in Real-Time
function loadWaitlistRealTime() {
    fetch(`${RENDER_API_URL}/waitlist`)
        .then(response => response.json())
        .then(patients => {
            waitlistContainer.innerHTML = "";
            if (!patients || patients.length === 0) {
                waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
                return;
            }

            Object.values(countdownIntervals).forEach(clearInterval);
            countdownIntervals = {};

            const conditionGroups = {};
            let firstPatientInQueue = null;

            patients.forEach(patient => {
                if (!patient.status || patient.status === "With Doctor" || patient.status === "Discharged" || patient.wasSeen) return;

                const key = `${patient.condition}-${patient.severity}`;
                if (!conditionGroups[key]) conditionGroups[key] = [];
                conditionGroups[key].push(patient);

                if (patient.status === "Please See Doctor") {
                    if (!firstPatientInQueue || patient.queueNumber < firstPatientInQueue.queueNumber) {
                        firstPatientInQueue = patient;
                    }
                }
            });

            Object.entries(conditionGroups).forEach(([groupKey, groupPatients]) => {
                const [condition, severity] = groupKey.split("-");
                const sortedQueue = groupPatients.sort((a, b) => a.queueNumber - b.queueNumber);

                const section = document.createElement("div");
                section.className = "condition-section";
                section.setAttribute("data-condition", groupKey);

                section.innerHTML = `
                    <div class="condition-title">${condition} - 
                        <span class="${severity.toLowerCase()}">${severity} Severity</span>
                    </div>
                `;

                const queueList = document.createElement("ul");
                queueList.className = "patient-list";

                sortedQueue.forEach(patient => {
                    const listItem = document.createElement("li");
                    listItem.className = "patient-item";
                    listItem.id = `queue-${patient.patientID}`;

                    const waitTime = patient.estimatedWaitTime ?? severityWaitTimes[patient.severity];

                    listItem.innerHTML = `
                        <div class="queue-patient">
                            Queue Position: <span class="queue-pos">#${patient.queueNumber}</span><br>
                            Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(waitTime)} min</span>
                        </div>
                    `;

                    queueList.appendChild(listItem);
                    startCountdown(patient.patientID, waitTime, groupKey, patient.queueNumber);
                });

                section.appendChild(queueList);
                waitlistContainer.appendChild(section);
            });

            if (firstPatientInQueue) {
                updateDoctorReadyMessage(`${firstPatientInQueue.condition}-${firstPatientInQueue.severity}`, firstPatientInQueue.queueNumber);
            }
        })
        .catch(err => {
            console.error("Waitlist fetch error:", err);
        });
}

let countdownIntervals = {}; // Track active countdowns

function startCountdown(patientID, time, groupKey, queueNum) {
    const countdownEl = document.getElementById(`countdown-${patientID}`);
    if (!countdownEl) return;

    if (countdownIntervals[patientID]) clearInterval(countdownIntervals[patientID]);

    let seconds = Math.floor(time * 60);

    countdownIntervals[patientID] = setInterval(() => {
        if (seconds <= 0) {
            countdownEl.innerHTML = "Please See Doctor";
            clearInterval(countdownIntervals[patientID]);
            delete countdownIntervals[patientID];
            updateDoctorReadyMessage(groupKey, queueNum);
            return;
        }

        const mins = Math.floor(seconds / 60);
        countdownEl.innerHTML = `${mins} min`;
        seconds--;
    }, 1000);
}


// Doctor Ready Message Appears
function updateDoctorReadyMessage(groupKey, queueNum) {
    const section = document.querySelector(`[data-condition="${groupKey}"]`);
    if (!section) return;

    let readyDiv = section.querySelector(".doctor-ready");
    if (!readyDiv) {
        readyDiv = document.createElement("div");
        readyDiv.className = "doctor-ready";
        readyDiv.style = "font-weight: bold; color: #28a745; margin-top: 10px; font-size: 18px; padding: 10px;";
        section.appendChild(readyDiv);
    }

    readyDiv.innerHTML = `Patient #${queueNum} - Doctor is Ready for You`;
}

// Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);


// Ensure this runs before `loadWaitlistRealTime`
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});




// // Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
