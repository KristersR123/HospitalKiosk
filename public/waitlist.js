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
        console.log("📌 Waitlist Data:", patients);

        waitlistContainer.innerHTML = "";

        if (!patients || patients.length === 0) {
            waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
            return;
        }

        let conditionGroups = {};

        // ✅ Clear all countdown timers before reloading data
        Object.keys(countdownIntervals).forEach(patientID => {
            clearInterval(countdownIntervals[patientID]);
            delete countdownIntervals[patientID];
        });

        patients.forEach(patient => {
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
            conditionSection.setAttribute("data-condition", groupKey); // ✅ Add identifier
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
            
                let remainingWaitTime = patient.estimatedWaitTime !== undefined ? patient.estimatedWaitTime : severityWaitTimes[patient.severity] || 60;
            
                listItem.innerHTML = `
                    <div class="queue-patient">
                        Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
                        Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(remainingWaitTime)} min</span>
                    </div>
                `;
            
                queueList.appendChild(listItem);
            
                // ✅ Start countdown and ensure correct queue number
                startCountdown(patient.patientID, remainingWaitTime, groupKey, queuePosition);
            });
        
            conditionSection.appendChild(queueList);
            waitlistContainer.appendChild(conditionSection);
        });
    })
    .catch(error => console.error("❌ Error loading waitlist:", error));
}

let countdownIntervals = {}; // Track active countdowns

function startCountdown(patientID, initialTime, conditionKey, queueNumber) {
    let countdownElement = document.getElementById(`countdown-${patientID}`);
    if (!countdownElement) return;

    console.log(`⏳ [Countdown Started] ${patientID}: timeLeft=${initialTime} min`);

    if (countdownIntervals[patientID]) {
        clearInterval(countdownIntervals[patientID]);
    }

    let timeLeft = Math.floor(initialTime) * 60; // Convert minutes to seconds

    countdownIntervals[patientID] = setInterval(() => {
        if (timeLeft <= 0) {
            countdownElement.innerHTML = "Please See Doctor";
            clearInterval(countdownIntervals[patientID]);
            delete countdownIntervals[patientID];

            // ✅ **NEW: Ensure the "Doctor Ready" message appears**
            updateDoctorReadyMessage(conditionKey, queueNumber);
        } else {
            let minutes = Math.floor(timeLeft / 60);
            countdownElement.innerHTML = `${minutes} min`;
        }
        timeLeft--;
    }, 1000);
}

// ✅ **Ensure the Doctor Ready Message Appears**
function updateDoctorReadyMessage(conditionKey, queueNumber) {
    let conditionSection = document.querySelector(`[data-condition="${conditionKey}"]`);
    if (!conditionSection) {
        console.warn(`⚠ Condition section not found for ${conditionKey}`);
        return;
    }

    let doctorReadyDiv = conditionSection.querySelector(".doctor-ready");
    if (!doctorReadyDiv) {
        doctorReadyDiv = document.createElement("div");
        doctorReadyDiv.classList.add("doctor-ready");
        doctorReadyDiv.style.fontWeight = "bold";
        doctorReadyDiv.style.color = "#28a745"; // Green text
        doctorReadyDiv.style.marginTop = "10px";
        doctorReadyDiv.style.fontSize = "18px";
        doctorReadyDiv.style.padding = "10px";
        conditionSection.appendChild(doctorReadyDiv);
    }

    // ✅ Show the "Doctor is Ready" message
    doctorReadyDiv.innerHTML = `🩺 Patient #${queueNumber} - Doctor is Ready for You`;
}

// ✅ Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);


// ✅ Ensure this runs before `loadWaitlistRealTime`
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});




// // ✅ Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
