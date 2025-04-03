const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");
const firebaseApp = firebase.initializeApp({ databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app" });
const db = firebaseApp.database();

const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

let countdownIntervals = {}; // Track active countdowns

function startCountdown(patientID, initialTime, conditionKey, queueNumber) {
    let countdownElement = document.getElementById(`countdown-${patientID}`);
    if (!countdownElement) return;

    if (countdownIntervals[patientID]) {
        clearInterval(countdownIntervals[patientID]);
    }

    let timeLeft = Math.floor(initialTime) * 60; // in seconds

    countdownIntervals[patientID] = setInterval(() => {
        if (timeLeft < 60) { // when less than 1 minute left
            countdownElement.innerHTML = "Please See Doctor";
            clearInterval(countdownIntervals[patientID]);
            delete countdownIntervals[patientID];
            updateDoctorReadyMessage(conditionKey, queueNumber);
        } else {
            let minutes = Math.ceil(timeLeft / 60); // ensure display is intuitive
            countdownElement.innerHTML = `${minutes} min`;
        }
        timeLeft--;
    }, 1000);
}

function updateDoctorReadyMessage(conditionKey, queueNumber) {
    let conditionSection = document.querySelector(`[data-condition="${conditionKey}"]`);
    if (!conditionSection) return;

    let doctorReadyDiv = conditionSection.querySelector(".doctor-ready");
    if (!doctorReadyDiv) {
        doctorReadyDiv = document.createElement("div");
        doctorReadyDiv.classList.add("doctor-ready");
        doctorReadyDiv.style.fontWeight = "bold";
        doctorReadyDiv.style.color = "#28a745";
        doctorReadyDiv.style.marginTop = "10px";
        doctorReadyDiv.style.fontSize = "18px";
        doctorReadyDiv.style.padding = "10px";
        conditionSection.appendChild(doctorReadyDiv);
    }
    doctorReadyDiv.innerHTML = `Patient #${queueNumber} - Doctor is Ready for You`;
}

function renderWaitlist(patients) {
    waitlistContainer.innerHTML = "";
    let conditionGroups = {};
    Object.keys(countdownIntervals).forEach(patientID => {
        clearInterval(countdownIntervals[patientID]);
        delete countdownIntervals[patientID];
    });

    let firstPatientInQueue = null;

    patients.forEach(patient => {
        if (!patient || !patient.status || patient.status === "With Doctor") return;
        let key = `${patient.condition}-${patient.severity}`;
        if (!conditionGroups[key]) conditionGroups[key] = [];
        conditionGroups[key].push(patient);
        if (patient.status === "Please See Doctor" && (!firstPatientInQueue || patient.queueNumber < firstPatientInQueue.queueNumber)) {
            firstPatientInQueue = patient;
        }
    });

    Object.keys(conditionGroups).forEach(groupKey => {
        let [condition, severity] = groupKey.split("-");
        let sortedQueue = conditionGroups[groupKey].sort((a, b) => a.queueNumber - b.queueNumber);
        let conditionSection = document.createElement("div");
        conditionSection.classList.add("condition-section");
        conditionSection.setAttribute("data-condition", groupKey);
        conditionSection.innerHTML = `
            <div class="condition-title">${condition} - 
                <span class="${severity.toLowerCase()}">${severity} Severity</span>
            </div>
        `;

        let queueList = document.createElement("ul");
        queueList.classList.add("patient-list");

        sortedQueue.forEach(patient => {
            let fixedQueueNumber = patient.queueNumber;
            let listItem = document.createElement("li");
            listItem.classList.add("patient-item");
            listItem.id = `queue-${patient.patientID}`;
            let remainingWaitTime = patient.estimatedWaitTime !== undefined 
                ? patient.estimatedWaitTime 
                : severityWaitTimes[patient.severity] || 60;
            listItem.innerHTML = `
                <div class="queue-patient">
                    Queue Position: <span class="queue-pos">#${fixedQueueNumber}</span><br>
                    Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(remainingWaitTime)} min</span>
                </div>
            `;
            queueList.appendChild(listItem);
            startCountdown(patient.patientID, remainingWaitTime, groupKey, fixedQueueNumber);
        });

        conditionSection.appendChild(queueList);
        waitlistContainer.appendChild(conditionSection);
    });

    if (firstPatientInQueue) {
        updateDoctorReadyMessage(`${firstPatientInQueue.condition}-${firstPatientInQueue.severity}`, firstPatientInQueue.queueNumber);
    }
}

function setupRealtimeListener() {
    const patientsRef = db.ref("patients");
    patientsRef.on("value", snapshot => {
        if (!snapshot.exists()) {
            waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
            return;
        }
        const data = snapshot.val();
        const patients = Object.keys(data).map(key => data[key]);
        renderWaitlist(patients);
    });
}

document.addEventListener("DOMContentLoaded", setupRealtimeListener);