const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");

const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// ✅ Function to Load & Auto-Update Waitlist in Real-Time
function loadWaitlistRealTime() {
    fetch(`${RENDER_API_URL}/waitlist`)
    .then(response => response.json())
    .then(patients => {
        
        console.log("📌 Waitlist Data:", patients); // Debugging output

        waitlistContainer.innerHTML = ""; // Clear the container

        if (!patients || patients.length === 0) {
            waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
            return;
        }

        let conditionGroups = {};

        patients.forEach(patient => {
            console.log("✅ Checking patient entry:", patient);

            if (!patient || !patient.status) { 
                console.warn("⚠ Skipping invalid patient entry:", patient);
                return;
            }

            let key = `${patient.condition}-${patient.severity}`;
            if (!conditionGroups[key]) {
                conditionGroups[key] = [];
            }
            conditionGroups[key].push(patient);
        });

        Object.keys(conditionGroups).forEach(groupKey => {
            let [condition, severity] = groupKey.split("-");
            let sortedQueue = conditionGroups[groupKey].sort((a, b) => a.queueNumber - b.queueNumber);

            let conditionSection = document.createElement("div");
            conditionSection.classList.add("condition-section");
            conditionSection.innerHTML = `
                <div class="condition-title">${condition} - 
                    <span class="${severity.toLowerCase()}">${severity} Severity</span>
                </div>
            `;

            let queueList = document.createElement("ul");
            queueList.classList.add("patient-list");

            sortedQueue.forEach((patient, index) => {
                let queuePosition = index + 1;
                let listItem = document.createElement("li");
                listItem.classList.add("patient-item");
                listItem.id = `queue-${patient.patientID}`;

                let now = new Date().getTime();
                let triageTime = new Date(patient.triageTime).getTime();
                let elapsedTime = (now - triageTime) / 60000;
                
                let baseWaitTime = severityWaitTimes[patient.severity] || 60; // Get base time for severity
                let estimatedWaitTime = (patient.estimatedWaitTime !== undefined) ? patient.estimatedWaitTime : baseWaitTime;
                let remainingWaitTime = Math.max(estimatedWaitTime - elapsedTime, 0);

                console.log("🟢 Patient Data:", patient);
                console.log("➡ Severity:", patient.severity);
                console.log("➡ Base Wait Time:", baseWaitTime);
                console.log("➡ Estimated Wait Time from Backend:", patient.estimatedWaitTime);
                console.log("➡ Calculated Remaining Wait Time:", remainingWaitTime);


                listItem.innerHTML = `
                    <div class="queue-patient">
                        Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
                        Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(remainingWaitTime)} min</span>
                    </div>
                `;

                queueList.appendChild(listItem);

                // Start live countdown
                startCountdown(patient.patientID, remainingWaitTime);
            });

            conditionSection.appendChild(queueList);
            waitlistContainer.appendChild(conditionSection);
        });
    })
    .catch(error => console.error("❌ Error loading waitlist:", error));
}

// ✅ Function to Start Live Countdown for Each Patient
function startCountdown(patientID, initialTime) {
    let countdownElement = document.getElementById(`countdown-${patientID}`);
    if (!countdownElement) return;

    let timeLeft = initialTime * 60; // Convert minutes to seconds
    let timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            countdownElement.innerHTML = "Please See Doctor";
            clearInterval(timerInterval);
        } else {
            let minutes = Math.floor(timeLeft / 60);
            countdownElement.innerHTML = `${minutes} min`;
            timeLeft--;
        }
    }, 1000);
}

// ✅ Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);


// ✅ Ensure this runs before `loadWaitlistRealTime`
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});

// // ✅ Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
