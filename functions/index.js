const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

// Define the severity wait times within the function or as a global variable
const severityWaitTimes = {
  Red: 0,      // Immediate attention
  Orange: 10,  // High urgency
  Yellow: 60,  // Elevated urgency
  Green: 120,  // Low urgency
  Blue: 240    // Non-urgent
};

exports.adjustWaitTimesOnDischarge = functions.database.ref('/patients/{patientId}')
  .onDelete(async (snapshot, context) => {
      const dischargedPatient = snapshot.val();
      if (!dischargedPatient || !dischargedPatient.acceptedTime) return null;

      const baseWaitTime = severityWaitTimes[dischargedPatient.severity] || 0;
      const acceptedTime = new Date(dischargedPatient.acceptedTime).getTime();
      const dischargeTime = Date.now();
      const timeSpent = Math.floor((dischargeTime - acceptedTime) / 60000); // ⏱ Actual time with doctor
      const timeAdjustment = baseWaitTime - timeSpent; // ⛑️ Compare to expected

      const patientsRef = admin.database().ref('/patients');
      const updates = {};
      const patientsSnapshot = await patientsRef.once('value');

      patientsSnapshot.forEach((childSnapshot) => {
          const patient = childSnapshot.val();
          if (
              patient.status.startsWith("Queueing for") &&
              patient.condition === dischargedPatient.condition &&
              patient.severity === dischargedPatient.severity
          ) {
              const currentWaitTime = patient.estimatedWaitTime || 0;
              const adjustedTime = currentWaitTime - timeAdjustment;
              updates[`${childSnapshot.key}/estimatedWaitTime`] = Math.max(0, adjustedTime);
          }
      });

      return patientsRef.update(updates);
  });