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

// const doctorDashboard = document.getElementById("doctor-dashboard");

// // Severity-based wait times
// const severityWaitTimes = {
//     "Red": 0,
//     "Orange": 10,
//     "Yellow": 60,
//     "Green": 120,
//     "Blue": 240
// };

// // Function to Load and Update the Doctor's Dashboard in Real-Time
// // ✅ Function to Load Doctor's Dashboard in Real-Time
// function loadDoctorQueue() {
//     database.ref("patients").orderByChild("queueNumber").on("value", snapshot => {
//         doctorDashboard.innerHTML = ""; // Clear dashboard before updating

//         let patients = snapshot.val();
//         if (!patients) {
//             doctorDashboard.innerHTML = "<p>No patients in the queue.</p>";
//             return;
//         }

//         let sortedPatients = Object.values(patients)
//             .filter(p => p.status === "Waiting for Doctor" || p.status === "Please See Doctor") // ✅ Filter correctly
//             .sort((a, b) => a.queueNumber - b.queueNumber);

//         sortedPatients.forEach((patient, index) => {
//             let now = new Date().getTime();
//             let triageTime = new Date(patient.triageTime).getTime();
//             let elapsedTime = (now - triageTime) / 60000; // Convert to minutes
//             let baseWaitTime = severityWaitTimes[patient.severity] || 10;
//             let remainingTime = Math.max(baseWaitTime - elapsedTime, 0);

//             let statusText = patient.status === "Please See Doctor" ? "Waiting for Acceptance" : `${Math.floor(remainingTime)} min`;

//             let patientCard = document.createElement("div");
//             patientCard.classList.add("patient-card");
//             patientCard.innerHTML = `
//                 <h2>Patient #${patient.queueNumber}</h2>
//                 <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
//                 <p>Estimated Wait Time: <span id="wait-${patient.firebaseKey}">${statusText}</span></p>
//                 ${patient.status === "Please See Doctor" ? `<button class="accept-button" onclick="acceptPatient('${patient.firebaseKey}')">Accept</button>` : ""}
//             `;

//             doctorDashboard.appendChild(patientCard);
//         });
//     });
// }

// // ✅ Function to Load Doctor's Dashboard in Real-Time
// function loadDoctorQueue() {
//     database.ref("patients").orderByChild("queueNumber").on("value", snapshot => {
//         doctorDashboard.innerHTML = ""; // Clear dashboard before updating

//         let patients = snapshot.val();
//         if (!patients) {
//             doctorDashboard.innerHTML = "<p>No patients in the queue.</p>";
//             return;
//         }

//         let sortedPatients = Object.values(patients)
//             .filter(p => p.status === "Waiting for Doctor" || p.status === "Please See Doctor")
//             .sort((a, b) => a.queueNumber - b.queueNumber);

//         let firstPatient = sortedPatients[0]; // First patient in line
//         let now = new Date().getTime();

//         sortedPatients.forEach((patient, index) => {
//             let triageTime = new Date(patient.triageTime).getTime();
//             let elapsedTime = (now - triageTime) / 60000; // Convert to minutes
//             let baseWaitTime = severityWaitTimes[patient.severity] || 10;
//             let remainingTime = Math.max(baseWaitTime - elapsedTime, 0);

//             // ✅ If first patient is ready, allow doctor to accept
//             let isFirstPatientReady = patient.firebaseKey === firstPatient.firebaseKey && remainingTime <= 0;
//             let statusText = isFirstPatientReady ? "Please See Doctor" : `${Math.floor(remainingTime)} min`;

//             let patientCard = document.createElement("div");
//             patientCard.classList.add("patient-card");
//             patientCard.innerHTML = `
//                 <h2>Patient #${patient.queueNumber}</h2>
//                 <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
//                 <p>Estimated Wait Time: <span id="wait-${patient.firebaseKey}">${statusText}</span></p>
//                 ${isFirstPatientReady ? `<button class="accept-button" onclick="acceptPatient('${patient.firebaseKey}')">Accept</button>` : ""}
//             `;

//             doctorDashboard.appendChild(patientCard);
//         });
//     });
// }

// // ✅ Function to Accept a Patient and Adjust Queue Times
// function acceptPatient(patientID) {
//     database.ref(`patients/${patientID}`).once("value").then(snapshot => {
//         let patient = snapshot.val();
//         if (!patient) return;

//         let acceptedTime = new Date().toISOString();

//         database.ref(`patients/${patientID}`).update({
//             status: "With Doctor",
//             acceptedTime: acceptedTime
//         }).then(() => {
//             console.log(`✅ Patient ${patientID} accepted by the doctor.`);

//             adjustQueueWaitTimes(patientID);
//             loadDoctorQueue();
//         });
//     });
// }

// // // ✅ Adjust Queue Wait Times Based on Doctor Handling Time
// // function adjustQueueWaitTimes(acceptedPatientID) {
// //     database.ref(`patients/${acceptedPatientID}`).once("value").then(snapshot => {
// //         let acceptedPatient = snapshot.val();
// //         if (!acceptedPatient) return;

// //         let acceptedTime = new Date(acceptedPatient.acceptedTime).getTime();
// //         let now = new Date().getTime();
// //         let elapsedDoctorTime = (now - acceptedTime) / 60000; // Convert ms to minutes

// //         database.ref("patients").once("value").then(snapshot => {
// //             let patients = snapshot.val();
// //             if (!patients) return;

// //             let updates = {};
// //             Object.entries(patients).forEach(([id, patient]) => {
// //                 if (patient.status === "Waiting for Doctor") {
// //                     let newWaitTime = Math.max(patient.estimatedWaitTime - elapsedDoctorTime, 0);
// //                     updates[`${id}/estimatedWaitTime`] = newWaitTime;
// //                 }
// //             });

// //             // ✅ Update queue times dynamically
// //             database.ref("patients").update(updates);
// //         });
// //     });
// // }


// // // ✅ Accept a Patient and Adjust Queue
// // function acceptPatient(patientID) {
// //     database.ref(`patients/${patientID}`).once("value").then(snapshot => {
// //         let patient = snapshot.val();
// //         if (!patient) return;

// //         let acceptedTime = new Date().toISOString();

// //         database.ref(`patients/${patientID}`).update({
// //             status: "With Doctor",
// //             acceptedTime: acceptedTime
// //         }).then(() => {
// //             console.log(`✅ Patient ${patientID} accepted.`);

// //             // ✅ Reduce wait times for remaining patients by base time (e.g., 10 minutes)
// //             adjustWaitTimes(patientID, 10);
// //             loadDoctorQueue();
// //         });
// //     });
// // }

// // // ✅ Adjust Queue Wait Times When a Patient is Accepted
// // function adjustWaitTimes(acceptedPatientID, decrementTime) {
// //     database.ref("patients").once("value").then(snapshot => {
// //         let patients = snapshot.val();
// //         if (!patients) return;

// //         let updates = {};

// //         Object.entries(patients).forEach(([id, patient]) => {
// //             if (patient.status === "Waiting for Doctor" && id !== acceptedPatientID) {
// //                 let newWaitTime = Math.max(patient.estimatedWaitTime - decrementTime, 0);
// //                 updates[`${id}/estimatedWaitTime`] = newWaitTime;
// //             }
// //         });

// //         database.ref("patients").update(updates);
// //     });
// // }

// // ✅ Function to Discharge a Patient and Adjust Wait Times Dynamically
// function dischargePatient(patientID) {
//     database.ref(`patients/${patientID}`).once("value").then(snapshot => {
//         let patient = snapshot.val();
//         if (!patient) return;

//         let acceptedTime = new Date(patient.acceptedTime).getTime();
//         let now = new Date().getTime();
//         let elapsedDoctorTime = (now - acceptedTime) / 60000; // Convert ms to minutes

//         // ✅ Find patients with the same condition and severity
//         database.ref("patients").once("value").then(snapshot => {
//             let patients = snapshot.val();
//             if (!patients) return;

//             let updates = {};
//             Object.entries(patients).forEach(([id, nextPatient]) => {
//                 if (
//                     nextPatient.status === "Waiting for Doctor" &&
//                     nextPatient.condition === patient.condition && 
//                     nextPatient.severity === patient.severity
//                 ) {
//                     let newWaitTime = Math.max(nextPatient.estimatedWaitTime - elapsedDoctorTime, 0);
//                     updates[`${id}/estimatedWaitTime`] = newWaitTime;
//                 }
//             });

//             // ✅ Update queue times dynamically
//             database.ref("patients").update(updates);

//             // ✅ Remove discharged patient
//             database.ref(`patients/${patientID}`).remove().then(() => {
//                 console.log(`✅ Patient ${patientID} discharged.`);
//                 loadDoctorQueue();
//             });
//         });
//     });
// }




// // Load the doctor's dashboard in real-time
// document.addEventListener("DOMContentLoaded", loadDoctorQueue);



// ✅ Firebase Configuration
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
const doctorDashboard = document.getElementById("doctor-dashboard");

// ✅ Severity-based wait times
const severityWaitTimes = {
    "Red": 0,
    "Orange": 10,
    "Yellow": 60,
    "Green": 120,
    "Blue": 240
};

// ✅ Load & Auto-Update Doctor's Dashboard
function loadDoctorQueue() {
    database.ref("patients").orderByChild("queueNumber").on("value", snapshot => {
        doctorDashboard.innerHTML = "";

        let patients = snapshot.val();
        if (!patients) {
            doctorDashboard.innerHTML = "<p>No patients in the queue.</p>";
            return;
        }

        let sortedPatients = Object.values(patients)
            .filter(p => p.status === "Waiting for Doctor" || p.status === "Please See Doctor")
            .sort((a, b) => a.queueNumber - b.queueNumber);

        let now = Date.now();
        let firstPatient = sortedPatients[0];

        sortedPatients.forEach((patient, index) => {
            let triageTime = new Date(patient.triageTime).getTime();
            let elapsedTime = (now - triageTime) / 60000;
            let baseWaitTime = severityWaitTimes[patient.severity] || 10;
            let remainingTime = Math.max(baseWaitTime - elapsedTime, 0);

            let isFirstPatientReady = patient.firebaseKey === firstPatient.firebaseKey && remainingTime <= 0;
            let statusText = isFirstPatientReady ? "Please See Doctor" : `${Math.floor(remainingTime)} min`;

            let patientCard = document.createElement("div");
            patientCard.classList.add("patient-card");
            patientCard.innerHTML = `
                <h2>Patient #${patient.queueNumber}</h2>
                <p>Severity: <span class="${patient.severity.toLowerCase()}">${patient.severity}</span></p>
                <p>Estimated Wait Time: <span id="wait-${patient.firebaseKey}">${statusText}</span></p>
                ${isFirstPatientReady ? `<button class="accept-button" onclick="acceptPatient('${patient.firebaseKey}')">Accept</button>` : ""}
            `;

            doctorDashboard.appendChild(patientCard);
        });
    });
}

// ✅ Accept Patient (Triggers Wait Timer)
function acceptPatient(patientID) {
    let acceptedTime = new Date().toISOString();

    database.ref(`patients/${patientID}`).update({
        status: "With Doctor",
        acceptedTime: acceptedTime
    }).then(() => {
        console.log(`✅ Patient ${patientID} accepted by the doctor.`);
        startTreatmentTimer(patientID);
    });
}

// ✅ Treatment Timer: Tracks Time Between Acceptance & Discharge
function startTreatmentTimer(patientID) {
    let timer = setInterval(() => {
        database.ref(`patients/${patientID}`).once("value").then(snapshot => {
            let patient = snapshot.val();
            if (!patient || patient.status !== "With Doctor") {
                clearInterval(timer); // Stop if patient is discharged
                return;
            }

            let acceptedTime = new Date(patient.acceptedTime).getTime();
            let now = new Date().getTime();
            let elapsedMinutes = Math.floor((now - acceptedTime) / 60000);

            console.log(`⏳ Patient ${patientID} has been with doctor for ${elapsedMinutes} minutes.`);
        });
    }, 60000); // Every 1 minute
}

// ✅ Discharge Patient & Adjust Queue Times
function dischargePatient(patientID) {
    database.ref(`patients/${patientID}`).once("value").then(snapshot => {
        let patient = snapshot.val();
        if (!patient) return;

        let acceptedTime = new Date(patient.acceptedTime).getTime();
        let now = new Date().getTime();
        let elapsedDoctorTime = Math.floor((now - acceptedTime) / 60000); // Convert to minutes

        console.log(`✅ Patient ${patientID} discharged after ${elapsedDoctorTime} minutes.`);

        // ✅ Update Wait Times for Patients with Same Condition & Severity
        database.ref("patients").once("value").then(snapshot => {
            let patients = snapshot.val();
            if (!patients) return;

            let updates = {};
            Object.entries(patients).forEach(([id, nextPatient]) => {
                if (
                    nextPatient.status === "Waiting for Doctor" &&
                    nextPatient.condition === patient.condition &&
                    nextPatient.severity === patient.severity
                ) {
                    let newWaitTime = (nextPatient.estimatedWaitTime || severityWaitTimes[nextPatient.severity]) + elapsedDoctorTime;
                    updates[`${id}/estimatedWaitTime`] = newWaitTime;
                }
            });

            database.ref("patients").update(updates);
            database.ref(`patients/${patientID}`).remove().then(() => {
                console.log(`✅ Patient ${patientID} removed from queue.`);
            });
        });
    });
}

// ✅ Load the doctor's dashboard in real-time
document.addEventListener("DOMContentLoaded", loadDoctorQueue);