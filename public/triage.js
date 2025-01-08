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

// Reference to patient list
const patientList = document.getElementById("patient-list");

// Function to Load Patients in Real-Time
function loadPatients() {
    patientList.innerHTML = ""; // Clear table

    database.ref("patients").orderByChild("status").equalTo("Waiting for Triage")
        .on("value", (snapshot) => {
            patientList.innerHTML = ""; // Clear the list before appending
            snapshot.forEach((childSnapshot) => {
                let patient = childSnapshot.val();
                let patientKey = childSnapshot.key;

                let row = document.createElement("tr");
                row.setAttribute("id", `row-${patientKey}`);

                row.innerHTML = `
                    <td>${patient.patientID}</td>
                    <td>${patient.fullName}</td>
                    <td>${patient.condition}</td>
                    <td>
                        <select id="severity-${patientKey}">
                            <option value="">Select Severity</option>
                            <option value="Red">Red (Immediate)</option>
                            <option value="Orange">Orange (Very Urgent)</option>
                            <option value="Yellow">Yellow (Urgent)</option>
                            <option value="Green">Green (Standard)</option>
                            <option value="Blue">Blue (Non-Urgent)</option>
                        </select>
                    </td>
                    <td>
                        <button onclick="assignSeverity('${patientKey}')">Confirm</button>
                    </td>
                `;

                patientList.appendChild(row);
            });
        });
}

// Function to Assign Severity Level and Update Database
function assignSeverity(patientKey) {
    let severity = document.getElementById(`severity-${patientKey}`).value;
    if (!severity) {
        alert("Please select a severity level.");
        return;
    }

    // Map severity to wait times (Adjust based on real hospital triage system)
    const severityWaitTimes = {
        "Red": 0,     // Immediate
        "Orange": 15, // 15 minutes
        "Yellow": 60, // 60 minutes
        "Green": 120  // 120 minutes
    };

    let waitTime = severityWaitTimes[severity] || 60; // Default to 60 minutes if unknown

    let checkInTime = new Date().toISOString(); // Capture timestamp at the moment of triage

    database.ref("patients/" + patientKey).update({
        severity: severity,
        estimatedWaitTime: waitTime,
        status: "Waiting for Doctor",
        triageTime: checkInTime  // Store exact triage time to calculate countdown correctly
    }).then(() => {
        loadPatients(); // Refresh patient list
    }).catch(error => {
        console.error("Error updating severity:", error);
    });
}

// Load patients on page load
window.onload = loadPatients;