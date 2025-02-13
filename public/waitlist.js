const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");

// ✅ Severity-based Wait Times (Minutes)
const severityWaitTimes = {
    "Red": 0,      // Immediate
    "Orange": 10,  // Very urgent
    "Yellow": 60,  // Urgent
    "Green": 120,  // Standard
    "Blue": 240    // Non-Urgent
};

// ✅ Function to Load & Auto-Update Waitlist in Real-Time
function loadWaitlistRealTime() {
    fetch(`${RENDER_API_URL}/waitlist`)
    .then(response => response.json())
    .then(patients => {
        waitlistContainer.innerHTML = ""; // Clear the container

        if (!patients || patients.length === 0) {
            waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
            return;
        }

        let conditionGroups = {};

        patients.forEach(patient => {
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
                let elapsedTime = (now - new Date(patient.triageTime).getTime()) / 60000;
                let baseWaitTime = severityWaitTimes[patient.severity] || 60;
                let remainingWaitTime = Math.max(baseWaitTime * queuePosition - elapsedTime, 0);

                let statusText = patient.status === "Please See Doctor"
                    ? "Waiting for Acceptance"
                    : `<span class="countdown">${Math.floor(remainingWaitTime)} min</span>`;

                listItem.innerHTML = `
                    <div class="queue-patient">
                        Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
                        Estimated Wait Time: ${statusText}
                    </div>
                `;

                queueList.appendChild(listItem);
            });

            conditionSection.appendChild(queueList);
            waitlistContainer.appendChild(conditionSection);
        });
    })
    .catch(error => console.error("❌ Error loading waitlist:", error));
}

// ✅ Automatically refresh waitlist every 5 seconds
setInterval(loadWaitlistRealTime, 5000);

// ✅ Load waitlist when the page loads
document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);