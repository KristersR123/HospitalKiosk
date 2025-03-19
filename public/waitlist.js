const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");

const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// -----------------------------------------------------------
// 1) Load waitlist data
function loadWaitlistRealTime() {
    fetch(`${RENDER_API_URL}/waitlist`)
      .then(resp => resp.json())
      .then(patients => {
        console.log("📌 Waitlist Data:", patients);
        waitlistContainer.innerHTML = "";
  
        // Clear old intervals
        Object.keys(countdownIntervals).forEach(pid => {
          clearInterval(countdownIntervals[pid]);
          delete countdownIntervals[pid];
        });
  
        if (!patients || patients.length === 0) {
          waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
          return;
        }
  
        // Group by condition-severity
        let conditionGroups = {};
        let firstPatientNeedingDoctor = null;
  
        patients.forEach(p => {
          if (!p || !p.status) return;
          // skip "With Doctor" from display
          if (p.status === "With Doctor") return;
  
          let groupKey = `${p.condition}-${p.severity}`;
          if (!conditionGroups[groupKey]) {
            conditionGroups[groupKey] = [];
          }
          conditionGroups[groupKey].push(p);
  
          // If they are "Please See Doctor", track the earliest queueNumber
          if (p.status === "Please See Doctor") {
            if (!firstPatientNeedingDoctor || p.queueNumber < firstPatientNeedingDoctor.queueNumber) {
              firstPatientNeedingDoctor = p;
            }
          }
        });
  
        // Build UI sections
        Object.keys(conditionGroups).forEach(groupKey => {
          let [condition, severity] = groupKey.split("-");
          let patientsInGroup = conditionGroups[groupKey];
          // sort by queueNumber ascending
          patientsInGroup.sort((a,b) => a.queueNumber - b.queueNumber);
  
          let sectionDiv = document.createElement("div");
          sectionDiv.classList.add("condition-section");
          sectionDiv.setAttribute("data-condition", groupKey);
          sectionDiv.innerHTML = `
            <div class="condition-title">
              ${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span>
            </div>
          `;
  
          let listUl = document.createElement("ul");
          listUl.classList.add("patient-list");
  
          patientsInGroup.forEach((pt, idx) => {
            let position = idx + 1;
            let wait = pt.estimatedWaitTime !== undefined
              ? pt.estimatedWaitTime
              : (severityWaitTimes[pt.severity] || 60);
  
            let li = document.createElement("li");
            li.classList.add("patient-item");
            li.id = `queue-${pt.patientID}`;
  
            li.innerHTML = `
              <div class="queue-patient">
                Queue Position: <span class="queue-pos">#${position}</span><br>
                Estimated Wait Time: <span id="countdown-${pt.patientID}" class="countdown">${wait} min</span>
              </div>
            `;
            listUl.appendChild(li);
  
            // Start local countdown
            startCountdown(pt.patientID, wait, groupKey, position);
          });
  
          sectionDiv.appendChild(listUl);
          waitlistContainer.appendChild(sectionDiv);
        });
  
        // If we have a "Please See Doctor" patient, show the "doctor is ready" message
        if (firstPatientNeedingDoctor) {
          let condKey = `${firstPatientNeedingDoctor.condition}-${firstPatientNeedingDoctor.severity}`;
          updateDoctorReadyMessage(condKey, firstPatientNeedingDoctor.queueNumber);
        }
      })
      .catch(err => console.error("❌ Error loading waitlist:", err));
}
  

let countdownIntervals = {}; // Track active countdowns

// 2) Start countdown for each patient
function startCountdown(patientID, initialTime, conditionKey, queuePosition) {
    const cdownEl = document.getElementById(`countdown-${patientID}`);
    if (!cdownEl) return;
  
    if (countdownIntervals[patientID]) {
      clearInterval(countdownIntervals[patientID]);
      delete countdownIntervals[patientID];
    }
  
    let secondsLeft = initialTime * 60;
    countdownIntervals[patientID] = setInterval(() => {
      if (secondsLeft <= 0) {
        clearInterval(countdownIntervals[patientID]);
        delete countdownIntervals[patientID];
  
        cdownEl.innerHTML = "Please See Doctor";
        // We also show the "Doctor is ready" message if this is the #1 in queue
        // But you can decide if you want to do `fetch("/promote-patient")` here or not
        if (queuePosition === 1) {
          updateDoctorReadyMessage(conditionKey, queuePosition);
        }
      } else {
        let mm = Math.floor(secondsLeft / 60);
        cdownEl.innerHTML = `${mm} min`;
      }
      secondsLeft--;
    }, 1000);
}


// 3) Update "Doctor Ready" UI 
function updateDoctorReadyMessage(conditionKey, queueNum) {
    let condSection = document.querySelector(`[data-condition="${conditionKey}"]`);
    if (!condSection) return;
  
    let docReadyDiv = condSection.querySelector(".doctor-ready");
    if (!docReadyDiv) {
      docReadyDiv = document.createElement("div");
      docReadyDiv.classList.add("doctor-ready");
      docReadyDiv.style.fontWeight = "bold";
      docReadyDiv.style.color = "#28a745";
      docReadyDiv.style.marginTop = "10px";
      docReadyDiv.style.fontSize = "18px";
      docReadyDiv.style.padding = "10px";
      condSection.appendChild(docReadyDiv);
    }
    docReadyDiv.innerHTML = `🩺 Patient #${queueNum} - Doctor is Ready for You`;
}

// ✅ Auto-refresh every 30 seconds
// 4) Setup an auto-refresh
setInterval(loadWaitlistRealTime, 30000);

document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);



// // ✅ Load waitlist when the page loads
// document.addEventListener("DOMContentLoaded", loadWaitlistRealTime);
