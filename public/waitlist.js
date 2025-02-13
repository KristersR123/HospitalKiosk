const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");


// ✅ Function to Load & Auto-Update Waitlist in Real-Time
function loadWaitlistRealTime() {
fetch(`${RENDER_API_URL}/waitlist`)
    .then(response => response.json())
    .then(patients => {
        console.log("📌 Waitlist Data:", patients); // ✅ Debugging output

        waitlistContainer.innerHTML = ""; // Clear the container

        if (!patients || patients.length === 0) {
            waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
            return;
        }

        let conditionGroups = {};

        patients.forEach(patient => {
            console.log("✅ Checking patient entry:", patient); // ✅ Log patient before filtering

            if (!patient || !patient.status) {  // ✅ Prevents errors
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
                
                let baseWaitTime = severityWaitTimes[patient.severity] || 60;

                let remainingWaitTime = patient.estimatedWaitTime !== undefined 
                    ? Math.max(patient.estimatedWaitTime - elapsedTime, 0)
                    : Math.max(baseWaitTime * queuePosition - elapsedTime, 0);

                let statusText = remainingWaitTime > 0 
                    ? `<span class="countdown">${Math.floor(remainingWaitTime)} min</span>`
                    : "Please See Doctor";

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

// ✅ Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);

const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// ✅ Ensure this runs before `loadWaitlistRealTime`
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});

// // ✅ Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
