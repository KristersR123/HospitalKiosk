// // Firebase Configuration
// const firebaseConfig = {
//     apiKey: "AIzaSyDogrFYk6a2nGL4YVftXrvzHLPYxvJZ1U4",
//     authDomain: "hospitalkiosk-a92a4.firebaseapp.com",
//     databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app",
//     projectId: "hospitalkiosk-a92a4",
//     storageBucket: "hospitalkiosk-a92a4.firebasestorage.app",
//     messagingSenderId: "781602336535",
//     appId: "1:781602336535:web:caac14621d8591341f5152",
//     measurementId: "G-0NWQC2EPBQ"
// };

// firebase.initializeApp(firebaseConfig);
// const database = firebase.database();

// const waitlistContainer = document.getElementById("waitlist-container");

// // Irish Triage System Wait Times (Minutes)
// const severityWaitTimes = {
//     "Red": 0,      // Immediate
//     "Orange": 10,  // Very urgent (max 10 minutes)
//     "Yellow": 60,  // Urgent (max 60 minutes)
//     "Green": 120,  // Standard (max 120 minutes)
//     "Blue": 240    // Non-Urgent (max 240 minutes)
// };

// // Function to Load and Update the Waitlist (Without Patient Names)
// // Load and Update Waitlist in Real-Time
// function loadWaitlist() {
//     database.ref("patients")
//         .orderByChild("status")
//         .equalTo("Waiting for Doctor")
//         .on("value", (snapshot) => {
//             waitlistContainer.innerHTML = "";

//             let patients = snapshot.val();
//             if (!patients) {
//                 waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
//                 return;
//             }

//             let conditionGroups = {};
//             Object.keys(patients).forEach(patientID => {
//                 let patient = patients[patientID];
//                 let key = `${patient.condition}-${patient.severity}`;

//                 if (!conditionGroups[key]) {
//                     conditionGroups[key] = [];
//                 }

//                 conditionGroups[key].push({
//                     id: patientID,
//                     severity: patient.severity,
//                     triageTime: new Date(patient.triageTime).getTime(),
//                     status: patient.status
//                 });
//             });

//             Object.keys(conditionGroups).forEach(groupKey => {
//                 let [condition, severity] = groupKey.split("-");
//                 let sortedQueue = conditionGroups[groupKey].sort((a, b) => a.triageTime - b.triageTime);

//                 let conditionSection = document.createElement("div");
//                 conditionSection.classList.add("condition-section");
//                 conditionSection.innerHTML = `
//                     <div class="condition-title">${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span></div>
//                 `;

//                 let queueList = document.createElement("ul");
//                 queueList.classList.add("patient-list");

//                 let baseWaitTime = severityWaitTimes[severity];
//                 let cumulativeWaitTime = 0;

//                 sortedQueue.forEach((patient, index) => {
//                     let queuePosition = index + 1;
//                     let listItem = document.createElement("li");
//                     listItem.classList.add("patient-item");
//                     listItem.id = `queue-${patient.id}`;

//                     let now = new Date().getTime();
//                     let elapsedTime = (now - patient.triageTime) / 60000;
//                     let remainingWaitTime = Math.max(baseWaitTime * queuePosition - elapsedTime, 0);

//                     if (patient.status === "With Doctor") {
//                         listItem.innerHTML = `<p>Patient is with the doctor.</p>`;
//                     } else {
//                         listItem.innerHTML = `
//                             <div class="queue-patient">
//                                 Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
//                                 Estimated Wait Time: <span class="countdown" id="queue-time-${patient.id}">${Math.floor(remainingWaitTime)}m</span>
//                             </div>
//                         `;
//                     }

//                     queueList.appendChild(listItem);
//                 });

//                 conditionSection.appendChild(queueList);
//                 waitlistContainer.appendChild(conditionSection);
//             });

//             updateWaitTimes();
//         });
// }


// // Function to Update Waiting Times Every Minute
// function updateWaitTimes() {
//     setInterval(() => {
//         database.ref("patients").once("value", snapshot => {
//             let patients = snapshot.val();
//             if (!patients) return;

//             let updates = {};
//             Object.keys(patients).forEach(patientID => {
//                 let patient = patients[patientID];
//                 if (patient.status === "Waiting for Doctor") {
//                     let now = new Date().getTime();
//                     let triageTime = new Date(patient.triageTime).getTime();
//                     let elapsedTime = (now - triageTime) / 60000;
//                     let severityWaitTime = severityWaitTimes[patient.severity] || 60;
//                     let newWaitTime = Math.max(severityWaitTime - elapsedTime, 0);

//                     updates[`${patientID}/estimatedWaitTime`] = newWaitTime;
//                 }
//             });

//             database.ref("patients").update(updates);
//         });
//     }, 60000);
// }

// // Load Waitlist on Page Load
// document.addEventListener("DOMContentLoaded", loadWaitlist);

// Firebase Configuration
// const firebaseConfig = {
//     apiKey: "AIzaSyDogrFYk6a2nGL4YVftXrvzHLPYxvJZ1U4",
//     authDomain: "hospitalkiosk-a92a4.firebaseapp.com",
//     databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app",
//     projectId: "hospitalkiosk-a92a4",
//     storageBucket: "hospitalkiosk-a92a4.firebasestorage.app",
//     messagingSenderId: "781602336535",
//     appId: "1:781602336535:web:caac14621d8591341f5152",
//     measurementId: "G-0NWQC2EPBQ"
// };

// firebase.initializeApp(firebaseConfig);
// const database = firebase.database();
// const waitlistContainer = document.getElementById("waitlist-container");

// // Irish Triage System Wait Times (Minutes)
// const severityWaitTimes = {
//     "Red": 0,
//     "Orange": 10,
//     "Yellow": 60,
//     "Green": 120,
//     "Blue": 240
// };

// Function to Load and Update the Waitlist in Real-Time
// function loadWaitlist() {
//     database.ref("patients").orderByChild("status").on("value", (snapshot) => {
//         waitlistContainer.innerHTML = "";

//         let patients = snapshot.val();
//         if (!patients) {
//             waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
//             return;
//         }

//         // ✅ Include both "Waiting for Doctor" and "Please See Doctor" patients
//         let filteredPatients = Object.values(patients).filter(p =>
//             p.status === "Waiting for Doctor" || p.status === "Please See Doctor"
//         );

//         if (filteredPatients.length === 0) {
//             waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
//             return;
//         }

//         let conditionGroups = {};
//         filteredPatients.forEach(patient => {
//             let key = `${patient.condition}-${patient.severity}`;
//             if (!conditionGroups[key]) {
//                 conditionGroups[key] = [];
//             }
//             conditionGroups[key].push(patient);
//         });

//         // ✅ Render the updated queue
//         Object.keys(conditionGroups).forEach(groupKey => {
//             let [condition, severity] = groupKey.split("-");
//             let sortedQueue = conditionGroups[groupKey].sort((a, b) => a.triageTime - b.triageTime);

//             let conditionSection = document.createElement("div");
//             conditionSection.classList.add("condition-section");
//             conditionSection.innerHTML = `
//                 <div class="condition-title">${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span></div>
//             `;

//             let queueList = document.createElement("ul");
//             queueList.classList.add("patient-list");

//             sortedQueue.forEach((patient, index) => {
//                 let queuePosition = index + 1;
//                 let listItem = document.createElement("li");
//                 listItem.classList.add("patient-item");
//                 listItem.id = `queue-${patient.id}`;

//                 let now = new Date().getTime();
//                 let elapsedTime = (now - new Date(patient.triageTime).getTime()) / 60000;
//                 let baseWaitTime = severityWaitTimes[patient.severity];
//                 let remainingWaitTime = Math.max(baseWaitTime * queuePosition - elapsedTime, 0);

//                 listItem.innerHTML = `
//                     <div class="queue-patient">
//                         Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
//                         Estimated Wait Time: <span class="countdown" id="queue-time-${patient.id}">${Math.floor(remainingWaitTime)}m</span>
//                     </div>
//                 `;

//                 queueList.appendChild(listItem);
//             });

//             conditionSection.appendChild(queueList);
//             waitlistContainer.appendChild(conditionSection);
//         });

//         updateWaitTimes();
//     });
// }

// function loadWaitlist() {
//     database.ref("patients").orderByChild("queueNumber").on("value", (snapshot) => {
//         waitlistContainer.innerHTML = "";

//         let patients = snapshot.val();
//         if (!patients) {
//             waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
//             return;
//         }

//         let filteredPatients = Object.values(patients).filter(p =>
//             p.status === "Waiting for Doctor" || p.status === "Please See Doctor"
//         );

//         if (filteredPatients.length === 0) {
//             waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
//             return;
//         }

//         let conditionGroups = {};
//         filteredPatients.forEach(patient => {
//             let key = `${patient.condition}-${patient.severity}`;
//             if (!conditionGroups[key]) {
//                 conditionGroups[key] = [];
//             }
//             conditionGroups[key].push(patient);
//         });

//         Object.keys(conditionGroups).forEach(groupKey => {
//             let [condition, severity] = groupKey.split("-");
//             let sortedQueue = conditionGroups[groupKey].sort((a, b) => a.queueNumber - b.queueNumber);

//             let conditionSection = document.createElement("div");
//             conditionSection.classList.add("condition-section");
//             conditionSection.innerHTML = `
//                 <div class="condition-title">${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span></div>
//             `;

//             let queueList = document.createElement("ul");
//             queueList.classList.add("patient-list");

//             sortedQueue.forEach((patient, index) => {
//                 let queuePosition = index + 1;
//                 let listItem = document.createElement("li");
//                 listItem.classList.add("patient-item");
//                 listItem.id = `queue-${patient.firebaseKey}`;

//                 let now = new Date().getTime();
//                 let elapsedTime = (now - new Date(patient.triageTime).getTime()) / 60000;
//                 let baseWaitTime = severityWaitTimes[patient.severity];
//                 let remainingWaitTime = Math.max(baseWaitTime * queuePosition - elapsedTime, 0);

//                 let statusText = patient.status === "Please See Doctor"
//                     ? "Waiting for Acceptance"
//                     : `<span class="countdown">${Math.floor(remainingWaitTime)}m</span>`;

//                 listItem.innerHTML = `
//                     <div class="queue-patient">
//                         Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
//                         Estimated Wait Time: ${statusText}
//                     </div>
//                 `;

//                 queueList.appendChild(listItem);
//             });

//             conditionSection.appendChild(queueList);
//             waitlistContainer.appendChild(conditionSection);
//         });
//     });
// }



// // Function to Update Waiting Times Every Minute
// function updateWaitTimes() {
//     setInterval(() => {
//         database.ref("patients").once("value").then(snapshot => {
//             let patients = snapshot.val();
//             if (!patients) return;

//             let updates = {};
//             Object.entries(patients).forEach(([id, patient]) => {
//                 if (patient.status === "Waiting for Doctor") {
//                     let elapsedTime = (new Date().getTime() - new Date(patient.triageTime).getTime()) / 60000;
//                     let newWaitTime = Math.max(severityWaitTimes[patient.severity] - elapsedTime, 0);
//                     updates[`${id}/estimatedWaitTime`] = newWaitTime;
//                 }
//             });

//             database.ref("patients").update(updates);
//         });
//     }, 60000);
// }

// // Load waitlist on page load
// document.addEventListener("DOMContentLoaded", loadWaitlist);

const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const waitlistContainer = document.getElementById("waitlist-container");

// Function to Load and Update the Waitlist
function loadWaitlist() {
    fetch(`${RENDER_API_URL}/waitlist`)
        .then(response => response.json())
        .then(patients => {
            waitlistContainer.innerHTML = "";

            if (!patients.length) {
                waitlistContainer.innerHTML = "<p>No patients in the waitlist.</p>";
                return;
            }

            let conditionGroups = {};
            patients.forEach(patient => {
                let key = `${patient.condition}-${patient.severity}`;
                if (!conditionGroups[key]) conditionGroups[key] = [];
                conditionGroups[key].push(patient);
            });

            Object.keys(conditionGroups).forEach(groupKey => {
                let [condition, severity] = groupKey.split("-");
                let sortedQueue = conditionGroups[groupKey].sort((a, b) => a.queueNumber - b.queueNumber);

                let conditionSection = document.createElement("div");
                conditionSection.classList.add("condition-section");
                conditionSection.innerHTML = `
                    <div class="condition-title">${condition} - <span class="${severity.toLowerCase()}">${severity} Severity</span></div>
                `;

                let queueList = document.createElement("ul");
                queueList.classList.add("patient-list");

                sortedQueue.forEach((patient, index) => {
                    let queuePosition = index + 1;
                    let listItem = document.createElement("li");
                    listItem.classList.add("patient-item");
                    listItem.innerHTML = `
                        <div class="queue-patient">
                            Queue Position: <span class="queue-pos">#${queuePosition}</span><br>
                            Estimated Wait Time: <span class="countdown">${patient.estimatedWaitTime} min</span>
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

// ✅ Update waitlist automatically every 30 seconds
setInterval(loadWaitlist, 30000);

// ✅ Load waitlist on page load
document.addEventListener("DOMContentLoaded", loadWaitlist);
