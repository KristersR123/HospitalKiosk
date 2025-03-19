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
    .then((response) => response.json())
    .then((patients) => {
      console.log("📌 Waitlist Data:", patients);
      waitlistContainer.innerHTML = "";

      if (!patients || patients.length === 0) {
        waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
        return;
      }

      // Group by condition-severity
      let conditionGroups = {};
      // Clear old countdowns
      Object.keys(countdownIntervals).forEach((pid) => {
        clearInterval(countdownIntervals[pid]);
        delete countdownIntervals[pid];
      });

      // Filter out patients who are "With Doctor"
      patients.forEach((p) => {
        if (!p || !p.status) return;
        if (p.status === "With Doctor") {
          // skip them
          return;
        }
        let groupKey = `${p.condition}-${p.severity}`;
        if (!conditionGroups[groupKey]) {
          conditionGroups[groupKey] = [];
        }
        conditionGroups[groupKey].push(p);
      });

      Object.keys(conditionGroups).forEach((groupKey) => {
        const [condition, severity] = groupKey.split("-");
        const sortedQueue = conditionGroups[groupKey].sort(
          (a, b) => a.queueNumber - b.queueNumber
        );

        const conditionSection = document.createElement("div");
        conditionSection.classList.add("condition-section");
        conditionSection.setAttribute("data-condition", groupKey);

        conditionSection.innerHTML = `
          <div class="condition-title">
            ${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span>
          </div>
        `;

        const queueList = document.createElement("ul");
        queueList.classList.add("patient-list");

        sortedQueue.forEach((patient, idx) => {
          const queuePos = idx + 1;
          const li = document.createElement("li");
          li.classList.add("patient-item");
          li.id = `queue-${patient.patientID}`;

          const waitTime =
            patient.estimatedWaitTime !== undefined
              ? patient.estimatedWaitTime
              : severityWaitTimes[patient.severity] || 60;

          li.innerHTML = `
            <div class="queue-patient">
              Queue Position: <span class="queue-pos">#${queuePos}</span><br>
              Estimated Wait Time:
              <span id="countdown-${patient.patientID}" class="countdown">
                ${Math.floor(waitTime)} min
              </span>
            </div>
          `;

          queueList.appendChild(li);
          startCountdown(patient.patientID, waitTime, groupKey, queuePos);
        });

        conditionSection.appendChild(queueList);
        waitlistContainer.appendChild(conditionSection);
      });
    })
    .catch((err) => console.error("❌ Error loading waitlist:", err));
}

let countdownIntervals = {}; // Track active countdowns

function startCountdown(patientID, initialTime, conditionKey, queueNumber) {
  const countdownElement = document.getElementById(`countdown-${patientID}`);
  if (!countdownElement) return;

  let timeLeft = Math.floor(initialTime) * 60; // seconds

  if (countdownIntervals[patientID]) {
    clearInterval(countdownIntervals[patientID]);
  }

  countdownIntervals[patientID] = setInterval(() => {
    if (timeLeft <= 0) {
      clearInterval(countdownIntervals[patientID]);
      delete countdownIntervals[patientID];
      countdownElement.textContent = "0 min"; 
      // DO NOT PROMOTE HERE. Let the discharge logic handle it.
    } else {
      const minutes = Math.floor(timeLeft / 60);
      countdownElement.textContent = `${minutes} min`;
    }
    timeLeft--;
  }, 1000);
}


// ✅ Ensure the Doctor Ready Message Appears
// function updateDoctorReadyMessage(conditionKey, queueNumber) {
//     let conditionSection = document.querySelector(`[data-condition="${conditionKey}"]`);
//     if (!conditionSection) {
//         console.warn(`⚠ Condition section not found for ${conditionKey}`);
//         return;
//     }

//     let doctorReadyDiv = conditionSection.querySelector(".doctor-ready");
//     if (!doctorReadyDiv) {
//         doctorReadyDiv = document.createElement("div");
//         doctorReadyDiv.classList.add("doctor-ready");
//         doctorReadyDiv.style.fontWeight = "bold";
//         doctorReadyDiv.style.color = "#28a745"; // Green text
//         doctorReadyDiv.style.marginTop = "10px";
//         doctorReadyDiv.style.fontSize = "18px";
//         doctorReadyDiv.style.padding = "10px";
//         conditionSection.appendChild(doctorReadyDiv);
//     }

//     // ✅ Show the "Doctor is Ready" message
//     doctorReadyDiv.innerHTML = `🩺 Patient #${queueNumber} - Doctor is Ready for You`;
// }

// ✅ Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);


// ✅ Ensure this runs before `loadWaitlistRealTime`
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});




// // ✅ Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
