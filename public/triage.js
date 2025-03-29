const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const patientList = document.getElementById("patient-list");
// Function to Load Patients for Triage
function loadTriagePatientsRealTime() {
    fetch(`${RENDER_API_URL}/patients-awaiting-triage`)
    .then(response => response.json())
    .then(patients => {
        updatePatientList(patients);
    })
    .catch(error => {
        console.error("❌ Error loading triage patients:", error);
        patientList.innerHTML = `<tr><td colspan="5">Failed to load patients. Please try refreshing.</td></tr>`;
    });
}

function updatePatientList(patients) {
    patientList.innerHTML = ""; // Clear the table before appending

    if (!patients || patients.length === 0) {
        patientList.innerHTML = `<tr><td colspan="5">No patients awaiting triage.</td></tr>`;
        return;
    }

    patients.forEach(patient => {
        const row = createPatientRow(patient);
        patientList.appendChild(row);
    });
}

function createPatientRow(patient) {
    let row = document.createElement("tr");
    row.innerHTML = `
        <td>${patient.patientID}</td>
        <td>${patient.fullName}</td>
        <td>${patient.condition || "Not Assigned"}</td>
        <td>
            <select id="severity-${patient.patientID}">
                <option value="">Select Severity</option>
                <option value="Red">Red (Immediate)</option>
                <option value="Orange">Orange (Very Urgent)</option>
                <option value="Yellow">Yellow (Urgent)</option>
                <option value="Green">Green (Standard)</option>
                <option value="Blue">Blue (Non-Urgent)</option>
            </select>
        </td>
        <td>
            <button onclick="assignSeverity('${patient.patientID}')">Confirm</button>
        </td>
    `;
    return row;
}

// Function to Assign Severity Level
function assignSeverity(patientID) {
    let severity = document.getElementById(`severity-${patientID}`).value;
    if (!severity) {
        alert("Please select a severity level.");
        return;
    }

    fetch(`${RENDER_API_URL}/assign-severity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID, severity })
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert("Severity assigned successfully!");
            loadTriagePatientsRealTime(); // Refresh patient list dynamically
        } else {
            throw new Error("Server responded with an error.");
        }
    })
    .catch(error => {
        console.error("❌ Error assigning severity:", error);
        alert("Failed to assign severity. Please try again.");
    });
}

// Automatically reload every 5 seconds for real-time updates
setInterval(loadTriagePatientsRealTime, 5000);

// Load patients when the page loads
document.addEventListener("DOMContentLoaded", loadTriagePatientsRealTime);