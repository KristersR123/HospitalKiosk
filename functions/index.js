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
      const timeSpent = Math.floor((dischargeTime - acceptedTime) / 60000); // Time in minutes
  
      const timeDifference = timeSpent - baseWaitTime; // + if over severity, - if under
  
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
  
          // Apply the real adjustment: + if doctor took longer, - if faster
          const adjustedTime = currentWaitTime + timeDifference;
          updates[`${childSnapshot.key}/estimatedWaitTime`] = Math.max(0, adjustedTime);
        }
      });
  
      return patientsRef.update(updates);
    });
  
