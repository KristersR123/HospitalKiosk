/**
 * Import function triggers from their respective submodules:
 *
 * const { onCall } = require("firebase-functions/v2/https");
 * const { onDocumentWritten } = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

// The "onRequest" and "logger" below are examples from firebase-functions v2, though not used in this snippet.
const { onRequest } = require("firebase-functions/v2/https"); // Example import for HTTPS trigger
const logger = require("firebase-functions/logger");         // Example logger for Firebase

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
 * (Red/Orange/Yellow/Green/Blue) to a base expected wait time (in minutes).
 */
const severityWaitTimes = {
  Red: 0,     // Highest priority, immediate
  Orange: 10, // Very urgent
  Yellow: 60, // Urgent
  Green: 120, // Standard
  Blue: 240   // Non-urgent
};

// ===========================================
// CLOUD FUNCTION TRIGGER: adjustWaitTimesOnDischarge
// ===========================================
/**
 * Triggered whenever a child within '/patients/{patientId}' is updated.
 * used .onUpdate(...) so it fires if an existing patient changes data.
 */
exports.adjustWaitTimesOnDischarge = functions.database
  .ref("/patients/{patientId}") // Path in Realtime DB
  .onUpdate(async (change, context) => {
    // Grab the 'before' and 'after' snapshots from the update
    const patientBefore = change.before.val(); // Data prior to update
    const patientAfter = change.after.val();   // Data after update

    // only act if the status changed from "With Doctor" to "Discharged"
    if (
      patientBefore.status === "With Doctor" &&
      patientAfter.status === "Discharged"
    ) {
      console.log("Triggered adjustWaitTimesOnDischarge");

      // Base wait time is derived from severityWaitTimes, defaulting to 0 if not found
      const baseWaitTime = severityWaitTimes[patientBefore.severity] || 0;

      // acceptedTime indicates when the doctor accepted the patient
      const acceptedTime = new Date(patientBefore.acceptedTime).getTime();
      // now is the current time in ms
      const now = Date.now();
      // actualTime is the total minutes the patient spent with the doctor
      const actualTime = Math.floor((now - acceptedTime) / 60000);

      // extraTime = actualTime (spent) - baseWaitTime (expected)
      // If positive => took longer than expected
      // If negative => finished earlier than expected
      const extraTime = actualTime - baseWaitTime;

      if (extraTime === 0) {
        console.log("⏱ No adjustment needed (doctor took expected time).");
        return null; // If no difference in time, skip
      }

      // fetch the entire '/patients' dataset to see who else is waiting
      const patientsRef = admin.database().ref("/patients");
      const patientsSnapshot = await patientsRef.once("value");

      let doctorStillBusy = false; // track if there's another doc in the same group
      const updates = {};          // store updates to wait times here

      // First pass: check if any other doc is busy with the same condition + severity
      patientsSnapshot.forEach((snap) => {
        const p = snap.val();
        // If a doc is 'With Doctor' for the same condition/severity, don't adjust
        if (
          p.status === "With Doctor" &&
          p.condition === patientBefore.condition &&
          p.severity === patientBefore.severity
        ) {
          doctorStillBusy = true;
        }
      });

      if (doctorStillBusy) {
        console.log("⚠ Doctor still busy with similar patient — skipping adjustment.");
        return null; // If so, do nothing
      }

      // Second pass: for all patients still queueing or 'Please See Doctor' with the same condition+severity
      patientsSnapshot.forEach((snap) => {
        const patient = snap.val();
        const key = snap.key;

        // only adjust patients in the same group who are queueing or waiting
        if (
          (patient.status?.startsWith("Queueing for") ||
            patient.status === "Please See Doctor") &&
          patient.condition === patientBefore.condition &&
          patient.severity === patientBefore.severity
        ) {
          const currentWait = patient.estimatedWaitTime || 0;
          // newWait is the adjusted wait time
          const newWait = Math.max(currentWait + extraTime, 0);
          updates[`${key}/estimatedWaitTime`] = newWait; // Store in updates
        }
      });

      // If there's anything to update, commit it
      if (Object.keys(updates).length > 0) {
        await patientsRef.update(updates);
        console.log(
          `Updated wait times by ${extraTime > 0 ? "+" : ""}${extraTime} mins.`
        );
      }
    }

    return null; // End of the function
  });
f
