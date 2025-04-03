// triage.js
// Shows all patients "Waiting for Triage", and sets severity

const RENDER_API_URL = "https://hospitalkiosk.onrender.com";
const patientList = document.getElementById("patient-list");

function loadTriagePatients() {
  fetch(`${RENDER_API_URL}/patients-awaiting-triage`)
    .then(r => r.json())
    .then(patients => {
      renderTriageList(patients);
    })
    .catch(err => {
      console.error("Error loading triage patients:", err);
      patientList.innerHTML = `<tr><td colspan="5">Failed to load. Refresh?</td></tr>`;
    });
}

function renderTriageList(patients) {
  patientList.innerHTML = "";
  if (!patients || patients.length === 0) {
    patientList.innerHTML = `<tr><td colspan="5">No patients awaiting triage.</td></tr>`;
    return;
  }
  patients.forEach(p => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${p.patientID}</td>
      <td>${p.fullName}</td>
      <td>${p.condition || "Not Assigned"}</td>
      <td>
        <select id="severity-${p.patientID}">
          <option value="">Select Severity</option>
          <option value="Red">Red (Immediate)</option>
          <option value="Orange">Orange (Very Urgent)</option>
          <option value="Yellow">Yellow (Urgent)</option>
          <option value="Green">Green (Standard)</option>
          <option value="Blue">Blue (Non-Urgent)</option>
        </select>
      </td>
      <td>
        <button onclick="assignSeverity('${p.patientID}')">Confirm</button>
      </td>
    `;
    patientList.appendChild(row);
  });
}

function assignSeverity(patientID) {
  const severity = document.getElementById(`severity-${patientID}`).value;
  if (!severity) {
    alert("Please select a severity first.");
    return;
  }
  fetch(`${RENDER_API_URL}/assign-severity`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ patientID, severity })
  })
    .then(r => r.json())
    .then(data => {
      if (data.success) {
        alert("Severity assigned successfully.");
        loadTriagePatients();
      } else {
        alert("Error assigning severity.");
      }
    })
    .catch(err => {
      console.error("assignSeverity error:", err);
      alert("Failed to assign severity.");
    });
}

// Auto-refresh every 5s for real-time triage
setInterval(loadTriagePatients, 5000);

document.addEventListener("DOMContentLoaded", loadTriagePatients);
