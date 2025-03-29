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
            console.log("Waitlist Data:", patients);
            waitlistContainer.innerHTML = "";

            if (!patients || patients.length === 0) {
                waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
                return;
            }

            let conditionGroups = {};
            clearCountdowns(); // Clears all active countdowns before setting new ones

            let firstPatientInQueue = null;
            patients.forEach(patient => {
                if (!patient || !patient.status || patient.status === "With Doctor") {
                    return; // Skip patients already with doctor or invalid entries
                }

                let key = `${patient.condition}-${patient.severity}`;
                conditionGroups[key] = conditionGroups[key] || [];
                conditionGroups[key].push(patient);

                if (patient.status === "Please See Doctor" && (!firstPatientInQueue || patient.queueNumber < firstPatientInQueue.queueNumber)) {
                    firstPatientInQueue = patient;
                }
            });

            Object.keys(conditionGroups).forEach(groupKey => {
                updateConditionSection(groupKey, conditionGroups[groupKey]);
            });

            if (firstPatientInQueue) {
                updateDoctorReadyMessage(firstPatientInQueue.condition, firstPatientInQueue.severity, firstPatientInQueue.queueNumber);
            }
        })
        .catch(error => console.error("Error loading waitlist:", error));
}

function clearCountdowns() {
    Object.keys(countdownIntervals).forEach(patientID => {
        clearInterval(countdownIntervals[patientID]);
        delete countdownIntervals[patientID];
    });
}

function updateConditionSection(groupKey, patients) {
    let [condition, severity] = groupKey.split("-");
    let conditionSection = document.createElement("div");
    conditionSection.classList.add("condition-section");
    conditionSection.setAttribute("data-condition", groupKey);
    conditionSection.innerHTML = `<div class="condition-title">${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span></div>`;
    let queueList = document.createElement("ul");
    queueList.classList.add("patient-list");

    patients.sort((a, b) => a.queueNumber - b.queueNumber).forEach(patient => {
        let listItem = createQueueListItem(patient);
        queueList.appendChild(listItem);
        startCountdown(patient.patientID, patient.estimatedWaitTime, groupKey, patient.queueNumber);
    });

    conditionSection.appendChild(queueList);
    waitlistContainer.appendChild(conditionSection);
}

function createQueueListItem(patient) {
    let listItem = document.createElement("li");
    listItem.classList.add("patient-item");
    listItem.id = `queue-${patient.patientID}`;

    listItem.innerHTML = `
        <div class="queue-patient">
            Queue Position: <span class="queue-pos">#${patient.queueNumber}</span><br>
            Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(patient.estimatedWaitTime)} min</span>
        </div>
    `;
    return listItem;
}

function startCountdown(patientID, initialTime, conditionKey, queueNumber) {
    let countdownElement = document.getElementById(`countdown-${patientID}`);
    if (!countdownElement) return;

    let timeLeft = Math.floor(initialTime) * 60; // Convert minutes to seconds
    countdownIntervals[patientID] = setInterval(() => {
        timeLeft -= 60;
        if (timeLeft <= 0) {
            clearInterval(countdownIntervals[patientID]);
            delete countdownIntervals[patientID];
            countdownElement.innerHTML = "Please See Doctor";
            updateDoctorReadyMessage(conditionKey, queueNumber);
        } else {
            countdownElement.innerHTML = `${Math.floor(timeLeft / 60)} min`;
        }
    }, 60000);
}

function updateDoctorReadyMessage(condition, severity, queueNumber) {
    let conditionKey = `${condition}-${severity}`;
    let conditionSection = document.querySelector(`[data-condition="${conditionKey}"]`);
    if (!conditionSection) return;

    let doctorReadyDiv = conditionSection.querySelector(".doctor-ready");
    if (!doctorReadyDiv) {
        doctorReadyDiv = document.createElement("div");
        doctorReadyDiv.classList.add("doctor-ready");
        doctorReadyDiv.style.cssText = "font-weight: bold; color: #28a745; margin-top: 10px; font-size: 18px; padding: 10px;";
        conditionSection.appendChild(doctorReadyDiv);
    }
    doctorReadyDiv.innerHTML = `Patient #${queueNumber} - Doctor is Ready for You`;
}

// Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);

// Ensure the function runs when the page loads
document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);