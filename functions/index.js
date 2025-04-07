//'functions' from firebase-functions/v1 for a Realtime Database trigger
const functions = require("firebase-functions/v1"); // Import V1 style Cloud Functions from firebase
const admin = require("firebase-admin");            // Admin SDK for server access to Firebase

// Initialise the Admin SDK (must happen once in the Cloud Function)
admin.initializeApp(); // Loads credentials from default environment (provided by Firebase)

// ===========================================
// DEFINE SEVERITY WAIT TIMES (GLOBAL VAR)
// ===========================================
/**
 * severityWaitTimes is a simple object that maps each triage severity level
 * (Orange/Yellow/Green/Blue) to a base expected wait time (in minutes).
 */
const severityWaitTimes = {
  Orange: 10,
  Yellow: 60,
  Green: 120,
  Blue: 240
};

// ===========================================
// SHARED FUNCTION TO ADJUST WAIT TIMES
// ===========================================
async function adjustWaitTimes(hospitalPath, change, context) {
  const patientBefore = change.before.val(); // Get patient data before the update
  const patientAfter = change.after.val();   // Get patient data after the update

  // Check if the patient was with the doctor and now has been discharged
  if (
    patientBefore.status === "With Doctor" &&
    patientAfter.status === "Discharged"
  ) {
    const baseWaitTime = severityWaitTimes[patientBefore.severity] || 0; // Get expected base wait time for severity
    const acceptedTime = new Date(patientBefore.acceptedTime).getTime(); // Time patient was accepted
    const now = Date.now();                                              // Current system time
    const actualTime = Math.floor((now - acceptedTime) / 60000);         // Calculate actual time with doctor in minutes
    const extraTime = actualTime - baseWaitTime;                         // Calculate the time difference from expected

    // If no difference in time, no need to adjust others
    if (extraTime === 0) return null;

    const patientsRef = admin.database().ref(hospitalPath); // Reference to hospital-specific patient list
    const snapshot = await patientsRef.once("value");        // Fetch all patient data in this hospital

    let doctorStillBusy = false; // To track if another doctor is still handling the same condition/severity
    const updates = {};          // Object to store updates for estimated wait times

    // Loop through all patients to check if another doctor is still handling similar patient
    snapshot.forEach((snap) => {
      const p = snap.val(); // Get patient data
      if (
        p.status === "With Doctor" &&                             // Doctor is still busy
        p.condition === patientBefore.condition &&               // Same condition
        p.severity === patientBefore.severity                    // Same severity
      ) {
        doctorStillBusy = true; // Found a similar patient still being handled
      }
    });

    // If a doctor is still busy with another similar patient, don't adjust queue
    if (doctorStillBusy) return null;

    // Loop through patients again to adjust wait times for queued patients
    snapshot.forEach((snap) => {
      const p = snap.val();   // Get patient
      const key = snap.key;   // Firebase key

      // Only adjust wait time if patient is still waiting or just about to see doctor
      if (
        (p.status?.startsWith("Queueing for") || p.status === "Please See Doctor") &&
        p.condition === patientBefore.condition &&
        p.severity === patientBefore.severity
      ) {
        const currentWait = p.estimatedWaitTime || 0;                  // Get current wait time
        const newWait = Math.max(currentWait + extraTime, 0);         // Adjust wait time with extraTime, ensure it's not negative
        updates[`${key}/estimatedWaitTime`] = newWait;                // Add update to batch
      }
    });

    // Apply all updates to database at once
    if (Object.keys(updates).length > 0) {
      await patientsRef.update(updates); // Commit all updates to Firebase DB
      console.log(
        `[${hospitalPath}] Adjusted wait times by ${extraTime} minutes.`
      );
    }
  }

  return null; // End the function
}

// ===========================================
// HOSPITAL A CLOUD FUNCTION
// ===========================================
// Triggered when any patient record under /hospitalA-patients/{patientId} is updated
exports.adjustWaitTimesHospitalA = functions.database
  .ref("/hospitalA-patients/{patientId}") // Path to watch
  .onUpdate((change, context) => adjustWaitTimes("hospitalA-patients", change, context)); // Use shared logic

// ===========================================
// HOSPITAL B CLOUD FUNCTION
// ===========================================
// Triggered when any patient record under /hospitalB-patients/{patientId} is updated
exports.adjustWaitTimesHospitalB = functions.database
  .ref("/hospitalB-patients/{patientId}") // Path to watch
  .onUpdate((change, context) => adjustWaitTimes("hospitalB-patients", change, context)); // Use shared logic