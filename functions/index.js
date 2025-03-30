const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

// Define the severity wait times within the function or as a global variable
const severityWaitTimes = {
    Red: 0,
    Orange: 10,
    Yellow: 60,
    Green: 120,
    Blue: 240
  };
  
  exports.adjustWaitTimesOnDischarge = functions.database.ref('/patients/{patientId}')
    .onDelete(async (snapshot, context) => {
      const dischargedPatient = snapshot.val();
      if (!dischargedPatient || !dischargedPatient.acceptedTime) return null;
  
      const baseWaitTime = severityWaitTimes[dischargedPatient.severity] || 0;
      const acceptedTime = new Date(dischargedPatient.acceptedTime).getTime();
      const dischargeTime = Date.now();
      const timeSpent = Math.floor((dischargeTime - acceptedTime) / 60000); // Time in minutes
      const timeDifference = timeSpent - baseWaitTime; // + if over severity, - if under
  
      const patientsRef = admin.database().ref('/patients');
      const updates = {};
      const patientsSnapshot = await patientsRef.once('value');
  
      let doctorStillBusy = false;
  
      patientsSnapshot.forEach((childSnapshot) => {
        const patient = childSnapshot.val();
        if (
          patient.status === "With Doctor" &&
          patient.condition === dischargedPatient.condition &&
          patient.severity === dischargedPatient.severity
        ) {
          doctorStillBusy = true;
        }
      });
  
      if (doctorStillBusy) {
        console.log("Another doctor is still with a patient. Skipping adjustment.");
        return null;
      }
  
      patientsSnapshot.forEach((childSnapshot) => {
        const patient = childSnapshot.val();
        if (
          (patient.status.startsWith("Queueing for") || patient.status === "Please See Doctor") &&
          patient.condition === dischargedPatient.condition &&
          patient.severity === dischargedPatient.severity
        ) {
          const currentWaitTime = patient.estimatedWaitTime || 0;
          const adjustedTime = currentWaitTime + timeDifference;
          updates[`${childSnapshot.key}/estimatedWaitTime`] = Math.max(0, adjustedTime);
        }
      });
  
      return patientsRef.update(updates);
    });
