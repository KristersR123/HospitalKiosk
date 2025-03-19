const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");

const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// Function to load and auto-update the waitlist
function loadWaitlistRealTime() {
  fetch(`${RENDER_API_URL}/waitlist`)
    .then(response => response.json())
    .then(patients => {
      console.log("📌 Waitlist Data:", patients);
      waitlistContainer.innerHTML = "";

      // Clear old intervals
      Object.keys(countdownIntervals).forEach(pid => {
        clearInterval(countdownIntervals[pid]);
        delete countdownIntervals[pid];
      });

      if (!patients || !patients.length) {
        waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
        return;
      }

      // Group by condition-severity
      const groups = {};
      patients.forEach(p => {
        if (!p.status) return;
        // Optionally skip those "With Doctor"
        if (p.status === "With Doctor") return;
        const key = `${p.condition}-${p.severity}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      });

      Object.keys(groups).forEach(groupKey => {
        let [condition, severity] = groupKey.split("-");
        let sorted = groups[groupKey].sort((a, b) => a.queueNumber - b.queueNumber);

        let section = document.createElement("div");
        section.classList.add("condition-section");
        section.setAttribute("data-condition", groupKey);
        section.innerHTML = `
          <div class="condition-title">
            ${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span>
          </div>
        `;

        let listEl = document.createElement("ul");
        listEl.classList.add("patient-list");

        sorted.forEach((patient, index) => {
          let queuePos = index + 1;
          let li = document.createElement("li");
          li.classList.add("patient-item");
          li.id = `queue-${patient.patientID}`;

          // Use existing or fallback wait time
          let base = severityWaitTimes[patient.severity] || 60;
          let est = patient.estimatedWaitTime !== undefined ? patient.estimatedWaitTime : base;

          li.innerHTML = `
            <div class="queue-patient">
              Queue Position: <span class="queue-pos">#${queuePos}</span><br>
              Estimated Wait Time: <span id="countdown-${patient.patientID}" class="countdown">${Math.floor(est)} min</span>
            </div>
          `;
          listEl.appendChild(li);

          // Start the countdown for each patient
          startCountdown(patient.patientID, est, groupKey, queuePos);
        });

        section.appendChild(listEl);
        waitlistContainer.appendChild(section);
      });
    })
    .catch(err => console.error("❌ Error loading waitlist:", err));
}
  
  

 // Optionally update a "Doctor is Ready" message if needed
            // ✅ Update "Doctor is Ready" message
            // if (firstPatientInQueue) {
            //     updateDoctorReadyMessage(`${firstPatientInQueue.condition}-${firstPatientInQueue.severity}`, firstPatientInQueue.queueNumber);
            // }

let countdownIntervals = {}; // Track active countdowns

function startCountdown(patientID, initialTime, conditionKey, queueNumber) {
  const el = document.getElementById(`countdown-${patientID}`);
  if (!el) return;

  let timeLeft = Math.floor(initialTime) * 60; // seconds
  countdownIntervals[patientID] = setInterval(() => {
    if (timeLeft <= 0) {
      clearInterval(countdownIntervals[patientID]);
      delete countdownIntervals[patientID];
      el.innerHTML = "0 min";

      // If the patient is #1 in queue => promote them
      if (queueNumber === 1) {
        fetch(`${RENDER_API_URL}/promote-patient`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientID })
        })
          .then(r => r.json())
          .then(data => {
            console.log("Patient promoted =>", data);
            // If you want to show "Doctor is ready" visually:
            updateDoctorReadyMessage(conditionKey, queueNumber);
            // Reload waitlist so we see updated status
            loadWaitlistRealTime();
          })
          .catch(e => console.error("Error promoting patient:", e));
      }
    } else {
      let minutes = Math.floor(timeLeft / 60);
      el.innerHTML = `${minutes} min`;
    }
    timeLeft--;
  }, 1000);
}
  
  


// Optional function: show "Doctor is Ready" in the UI
function updateDoctorReadyMessage(conditionKey, queueNumber) {
    let section = document.querySelector(`[data-condition="${conditionKey}"]`);
    if (!section) return;
    let div = section.querySelector(".doctor-ready");
    if (!div) {
      div = document.createElement("div");
      div.classList.add("doctor-ready");
      div.style.fontWeight = "bold";
      div.style.color = "#28a745";
      div.style.marginTop = "10px";
      div.style.fontSize = "18px";
      div.style.padding = "10px";
      section.appendChild(div);
    }
    div.innerHTML = `🩺 Patient #${queueNumber} - Doctor is Ready for You`;
  }
  
// ✅ Auto-refresh every 30 seconds
setInterval(loadWaitlistRealTime, 30000);


// ✅ Ensure this runs before `loadWaitlistRealTime`
document.addEventListener("DOMContentLoaded", () => {
    loadWaitlistRealTime();
});




// // ✅ Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
