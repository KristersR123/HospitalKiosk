// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyDogrFYk6a2nGL4YVftXrvzHLPYxvJZ1U4",
    authDomain: "hospitalkiosk-a92a4.firebaseapp.com",
    databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "hospitalkiosk-a92a4",
    storageBucket: "hospitalkiosk-a92a4.firebasestorage.app",
    messagingSenderId: "781602336535",
    appId: "1:781602336535:web:caac14621d8591341f5152",
    measurementId: "G-0NWQC2EPBQ"
};

firebase.initializeApp(firebaseConfig);
const database = firebase.database();

const waitlistContainer = document.getElementById("waitlist-container");

// Irish Triage System Wait Times (Minutes)
const severityWaitTimes = {
    "Red": 0,      // Immediate
    "Orange": 10,  // Very urgent (max 10 minutes)
    "Yellow": 60,  // Urgent (max 60 minutes)
    "Green": 120,  // Standard (max 120 minutes)
    "Blue": 240    // Non-Urgent (max 240 minutes)
};

// Function to Load and Update the Waitlist
function loadWaitlist() {
    database.ref("patients")
        .orderByChild("status")
        .equalTo("Waiting for Doctor")
        .on("value", (snapshot) => {
            waitlistContainer.innerHTML = "";

            let patients = snapshot.val();
            if (!patients) {
                waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
                return;
            }

            let conditionGroups = {};
            
            // Group patients by condition & severity
            Object.keys(patients).forEach(patientID => {
                let patient = patients[patientID];
                let key = `${patient.condition}-${patient.severity}`;

                if (!conditionGroups[key]) {
                    conditionGroups[key] = [];
                }
                conditionGroups[key].push({
                    id: patientID,
                    severity: patient.severity,
                    triageTime: patient.triageTime
                });
            });

            Object.keys(conditionGroups).forEach(groupKey => {
                let [condition, severity] = groupKey.split("-");

                let sortedQueue = conditionGroups[groupKey].sort((a, b) => new Date(a.triageTime) - new Date(b.triageTime));

                let conditionSection = document.createElement("div");
                conditionSection.classList.add("condition-section");
                conditionSection.innerHTML = `<div class="condition-title">${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span></div>`;

                let queueList = document.createElement("ul");
                queueList.classList.add("patient-list");

                let baseWaitTime = 10; // First patient always gets 10 mins
                let queueData = [];

                sortedQueue.forEach((patient, index) => {
                    let queuePosition = index + 1;
                    let listItem = document.createElement("li");
                    listItem.classList.add("patient-item");
                    listItem.id = `queue-${patient.id}`;

                    let waitTimeMinutes;
                    if (index === 0) {
                        waitTimeMinutes = baseWaitTime;
                    } else {
                        waitTimeMinutes = baseWaitTime + severityWaitTimes[severity] * index;
                    }

                    let countdownEnd = new Date(patient.triageTime);
                    countdownEnd.setMinutes(countdownEnd.getMinutes() + waitTimeMinutes);

                    queueData.push({
                        id: patient.id,
                        queuePosition: queuePosition,
                        endTime: countdownEnd.getTime(),
                    });

                    if (index === 0) {
                        listItem.innerHTML = `
                            <div class="next-patient">
                                Next Patient: <span class="red">#${queuePosition}</span> <br>
                                Estimated Wait Time: <span class="countdown" id="timer-${groupKey}">${waitTimeMinutes}m</span>
                            </div>
                        `;
                    } else {
                        listItem.innerHTML = `
                            <div class="queue-patient">
                                In Queue: <span class="yellow">#${queuePosition}</span> - 
                                Estimated Wait: <span class="countdown" id="queue-time-${patient.id}">${waitTimeMinutes}m</span>
                            </div>
                        `;
                    }

                    queueList.appendChild(listItem);
                });

                conditionSection.appendChild(queueList);
                waitlistContainer.appendChild(conditionSection);

                startCountdown(condition, severity, queueData);
            });
        });
}

// Function to Start Countdown
function startCountdown(condition, severity, queue) {
    let firstPatientTimerId = `timer-${condition}-${severity}`;
    let firstPatientElement = document.getElementById(firstPatientTimerId);

    if (!firstPatientElement) {
        console.warn(`Timer element not found: ${firstPatientTimerId}`);
        return;
    }

    function updateTimers() {
        let now = new Date().getTime();
        let firstPatientEnd = queue[0].endTime;
        let timeLeft = firstPatientEnd - now;

        if (timeLeft <= 0) {
            firstPatientElement.innerHTML = "⚠️ Please proceed to doctor";
            firstPatientElement.style.color = "red";
        } else {
            let minutes = Math.floor(timeLeft / 60000);
            let seconds = Math.floor((timeLeft % 60000) / 1000);
            firstPatientElement.innerHTML = `${minutes}m ${seconds}s`;
        }

        // Dynamically update all patients' estimated wait times
        for (let i = 1; i < queue.length; i++) {
            let patientElement = document.getElementById(`queue-time-${queue[i].id}`);
            if (patientElement) {
                let adjustedWaitTime = timeLeft / 60000 + severityWaitTimes[severity] * i;
                let adjMinutes = Math.floor(adjustedWaitTime);
                let adjSeconds = Math.floor((adjustedWaitTime % 1) * 60);
                patientElement.innerHTML = `${adjMinutes}m ${adjSeconds}s`;
            }
        }

        setTimeout(updateTimers, 1000);
    }

    updateTimers();
}

// Load Waitlist on Page Load
window.onload = loadWaitlist;