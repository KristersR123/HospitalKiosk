// RENDER_API_URL references the backend endpoint for waitlist operations
const RENDER_API_URL = "https://hospitalkiosk.onrender.com/hospitalA";

// waitlistContainer is the DOM element where the waitlist is displayed
const waitlistContainer = document.getElementById("waitlist-container");

// severityWaitTimes holds the base wait times (in minutes) for each severity level
const severityWaitTimes = {
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

/**
 * loadWaitlistRealTime fetches and displays the current waitlist,
 * grouping patients by condition and severity, and starts countdowns.
 */
function loadWaitlistRealTime() {
    // Retrieves the waitlist from the backend
    fetch(`${RENDER_API_URL}/waitlist`)
        .then(response => response.json()) // Parses the response as JSON
        .then(patients => {
            // Clears any existing content from the container
            waitlistContainer.innerHTML = "";

            // Checks if there are no patients, and displays a message if so
            if (!patients || patients.length === 0) {
                waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
                return;
            }

            // Clears all existing countdown intervals
            Object.values(countdownIntervals).forEach(clearInterval);
            countdownIntervals = {};

            // conditionGroups will group patients by "condition-severity"
            const conditionGroups = {};
            // firstPatientInQueue holds the first patient who reaches "Please See Doctor"
            let firstPatientInQueue = null;

            // Iterates over each patient, skipping certain statuses
            patients.forEach(patient => {
                if (!patient.status ||
                    patient.status === "With Doctor" ||
                    patient.status === "Discharged" ||
                    patient.wasSeen
                ) {
                    return;
                }

                // Builds a grouping key as "condition-severity"
                const key = `${patient.condition}-${patient.severity}`;
                // Creates an array for the group if not existing
                if (!conditionGroups[key]) conditionGroups[key] = [];
                // Adds the patient to that group
                conditionGroups[key].push(patient);

                // Tracks if this patient is the earliest "Please See Doctor"
                if (patient.status === "Please See Doctor") {
                    if (!firstPatientInQueue ||
                        patient.queueNumber < firstPatientInQueue.queueNumber
                    ) {
                        firstPatientInQueue = patient;
                    }
                }
            });

            // Transforms each condition group into separate sections on the page
            Object.entries(conditionGroups).forEach(([groupKey, groupPatients]) => {
                // Splits the key into condition and severity
                const [condition, severity] = groupKey.split("-");

                // Sorts patients in ascending order based on queueNumber
                const sortedQueue = groupPatients.sort((a, b) => a.queueNumber - b.queueNumber);

                // Creates a container section for this condition-severity group
                const section = document.createElement("div");
                section.className = "condition-section";
                section.setAttribute("data-condition", groupKey);

                // Inserts a title showing the condition and severity
                section.innerHTML = `
                    <div class="condition-title">${condition} - 
                        <span class="${severity.toLowerCase()}">${severity} Severity</span>
                    </div>
                `;

                // Creates an unordered list to hold individual patients
                const queueList = document.createElement("ul");
                queueList.className = "patient-list";

                // Builds a list item for each patient in this group
                sortedQueue.forEach(patient => {
                    const listItem = document.createElement("li");
                    listItem.className = "patient-item";
                    listItem.id = `queue-${patient.patientID}`;

                    // Determines the wait time, defaulting if severityWaitTimes is not found
                    const waitTime = patient.estimatedWaitTime ?? severityWaitTimes[patient.severity];

                    // Populates the list item with queue position and initial wait time
                    listItem.innerHTML = `
                        <div class="queue-patient">
                            Patient ID: <strong>${patient.patientID}</strong><br>
                            Queue Position: <span class="queue-pos">#${patient.queueNumber}</span><br>
                            Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(waitTime)} min</span>
                        </div>
                    `;

                    // Appends this patient item to the queue list
                    queueList.appendChild(listItem);

                    // Starts a countdown for each patient’s wait time
                    startCountdown(patient.patientID, waitTime, groupKey, patient.queueNumber);
                });

                // Appends the list of patients to the section
                section.appendChild(queueList);
                // Appends the entire section to the waitlist container
                waitlistContainer.appendChild(section);
            });

            // If a patient with "Please See Doctor" status is found, triggers a message
            if (firstPatientInQueue) {
                updateDoctorReadyMessage(
                    `${firstPatientInQueue.condition}-${firstPatientInQueue.severity}`,
                    firstPatientInQueue.queueNumber
                );
            }
        })
        .catch(err => {
            // Logs any errors from fetching or processing the waitlist
            console.error("Waitlist fetch error:", err);
        });
}

// countdownIntervals holds any active countdown timers keyed by patient ID
let countdownIntervals = {};

/**
 * startCountdown updates the DOM with a minute-by-minute countdown for a patient.
 * Once the countdown reaches zero, the text becomes "Please See Doctor".
 */
function startCountdown(patientID, time, groupKey, queueNum) {
    // Identifies the DOM element that displays the countdown
    const countdownEl = document.getElementById(`countdown-${patientID}`);
    if (!countdownEl) return;

    // Clears any existing interval for this patient to avoid duplicates
    if (countdownIntervals[patientID]) clearInterval(countdownIntervals[patientID]);

    // Converts wait time from minutes to seconds for a per-second countdown
    let seconds = Math.floor(time * 60);

    // Sets up the interval for a per-second update
    countdownIntervals[patientID] = setInterval(() => {
        // If time is up, display "Please See Doctor" and clear the interval
        if (seconds <= 0) {
            countdownEl.innerHTML = "Please See Doctor";
            clearInterval(countdownIntervals[patientID]);
            delete countdownIntervals[patientID];
            updateDoctorReadyMessage(groupKey, queueNum);
            return;
        }

        // Decrements the timer and updates the DOM with minutes left
        const mins = Math.floor(seconds / 60);
        countdownEl.innerHTML = `${mins} min`;
        seconds--;
    }, 1000);
}

/**
 * updateDoctorReadyMessage displays a highlighted message indicating
 * the earliest patient who is ready to see the doctor.
 */
function updateDoctorReadyMessage(groupKey, queueNum) {
    // Locates the section for the groupKey, which matches condition-severity
    const section = document.querySelector(`[data-condition="${groupKey}"]`);
    if (!section) return;

    // Finds or creates a div to show the "Doctor is Ready" message
    let readyDiv = section.querySelector(".doctor-ready");
    if (!readyDiv) {
        readyDiv = document.createElement("div");
        readyDiv.className = "doctor-ready";
        readyDiv.style = "font-weight: bold; color: #28a745; margin-top: 10px; font-size: 18px; padding: 10px;";
        section.appendChild(readyDiv);
    }

    // Sets the text to inform which patient number is ready
    readyDiv.innerHTML = `Patient #${queueNum} - Doctor is Ready for You`;
}

// Sets up a periodic refresh of the waitlist every 30 seconds
setInterval(loadWaitlistRealTime, 30000);

// Ensures the waitlist is loaded as soon as the DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});

// A commented-out alternative approach for loading on page load
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
