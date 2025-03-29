const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

exports.onPatientDischarge = functions.database.ref('/patients/{patientId}')
  .onDelete(async (snapshot, context) => {
    const dischargedPatient = snapshot.val();
    // Only process if this patient was seen by a doctor (has acceptedTime)
    if (!dischargedPatient || !dischargedPatient.acceptedTime) {
      return null;
    }
    
    const condition = dischargedPatient.condition;
    const severity = dischargedPatient.severity;
    // The base severity wait time (from triage)
    const baseWaitTime = dischargedPatient.baseWaitTime || 10;
    const acceptedTime = new Date(dischargedPatient.acceptedTime).getTime();
    const now = Date.now();
    // How long the doctor spent with this patient (in minutes)
    const elapsedDoctorTime = Math.floor((now - acceptedTime) / 60000);
    
    // Calculate adjustment: positive if doctor took longer than expected; negative if faster.
    const adjustment = elapsedDoctorTime - baseWaitTime;
    console.log(`Discharged patient ${context.params.patientId} spent ${elapsedDoctorTime} min (adjustment: ${adjustment} min) with the doctor.`);
    
    // Query waiting patients in the same condition and severity
    const waitingSnapshot = await admin.database().ref('/patients')
      .orderByChild('condition')
      .equalTo(condition)
      .once('value');
    
    const updates = {};
    waitingSnapshot.forEach(childSnapshot => {
      const waitingPatient = childSnapshot.val();
      const waitingPatientId = childSnapshot.key;
      // Only update patients still waiting (status starting with "Queueing for")
      // and who have been triaged (with a triageTime and an existing initialWaitTime)
      if (
        waitingPatient.status &&
        waitingPatient.status.startsWith("Queueing for") &&
        waitingPatient.severity === severity &&
        waitingPatient.triageTime &&
        waitingPatient.initialWaitTime !== undefined
      ) {
        const currentInitial = waitingPatient.initialWaitTime;
        const newBaseline = Math.max(currentInitial + adjustment, 0);
        // Update baseline only – do not update triageTime, so the countdown remains relative to the original check‑in time.
        updates[`${waitingPatientId}/initialWaitTime`] = newBaseline;
        // Optionally, update estimatedWaitTime to match the new baseline.
        updates[`${waitingPatientId}/estimatedWaitTime`] = newBaseline;
      }
    });
    
    if (Object.keys(updates).length > 0) {
      await admin.database().ref('/patients').update(updates);
      console.log("Updated waiting patients baselines:", updates);
    }
    return null;
});