// RENDER_API_URL points to the backend API for triage operations
const RENDER_API_URL = "https://hospitalkiosk.onrender.com";

// patientList references the HTML element where triage patients are displayed
const patientList = document.getElementById("patient-list");

/**
 * loadTriagePatientsRealTime fetches all patients who are waiting for triage
 * and populates the table with their information in real time.
 */
function loadTriagePatientsRealTime() {
    // Sends a GET request to retrieve patients awaiting triage
    fetch(`${RENDER_API_URL}/patients-awaiting-triage`)
        .then(response => response.json()) // Parses response as JSON
        .then(patients => {
            // Clears the table before populating new data
            patientList.innerHTML = "";

            // If there are no patients, shows a message and returns
            if (!patients || patients.length === 0) {
                patientList.innerHTML = `<tr><td colspan="5">No patients awaiting triage.</td></tr>`;
                return;
            }

            // Iterates over each patient to create rows
            patients.forEach(patient => {
                // Creates a table row
                let row = document.createElement("tr");
                // Builds the HTML cells within that row
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

                // Appends this row to the table
                patientList.appendChild(row);
            });
        })
        .catch(error => console.error("❌ Error loading triage patients:", error));
}

/**
 * assignSeverity updates the chosen severity level for a given patient,
 * then refreshes the triage list.
 */
function assignSeverity(patientID) {
    // Retrieves the value from the severity dropdown
    let severity = document.getElementById(`severity-${patientID}`).value;

    // Alerts if no severity has been selected
    if (!severity) {
        alert("Please select a severity level.");
        return;
    }

    // Sends a POST request to update the severity on the server
    fetch(`${RENDER_API_URL}/assign-severity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientID, severity })
    })
        .then(response => response.json()) // Parses JSON from the response
        .then(data => {
            // Checks if the severity assignment was successful
            if (data.success) {
                alert("Severity assigned successfully!");
                // Refreshes the list after successful update
                loadTriagePatientsRealTime();
            } else {
                alert("Error assigning severity.");
            }
        })
        .catch(error => console.error("❌ Error assigning severity:", error));
}

// Sets an interval to reload triage patient data every 5 seconds in real time
setInterval(loadTriagePatientsRealTime, 5000);

// Loads the triage patients once the page's DOM has finished loading
document.addEventListener("DOMContentLoaded", loadTriagePatientsRealTime);
