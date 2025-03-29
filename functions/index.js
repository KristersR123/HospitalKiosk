const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

exports.adjustWaitTimesOnDischarge = functions.database.ref('/patients/{patientId}')
  .onDelete(async (snapshot, context) => {
    const dischargedPatient = snapshot.val();
    if (!dischargedPatient || !dischargedPatient.acceptedTime) {
      return null;
    }

    const acceptedTime = new Date(dischargedPatient.acceptedTime).getTime();
    const dischargeTime = Date.now(); // Assuming the delete time is the discharge time
    const timeSpentWithDoctor = Math.floor((dischargeTime - acceptedTime) / 60000); // in minutes
    const expectedTime = severityWaitTimes[dischargedPatient.severity] || 10; // Default or specific time per severity

    // Calculate the difference from expected time
    const timeDifference = timeSpentWithDoctor - expectedTime;

    // Fetch all patients in the same condition and severity
    const patientsRef = admin.database().ref('/patients');
    const updates = {};
    const patientsSnapshot = await patientsRef
      .orderByChild('condition')
      .equalTo(dischargedPatient.condition)
      .once('value');
    patientsSnapshot.forEach((childSnapshot) => {
      let patient = childSnapshot.val();
      if (patient.status.startsWith("Queueing for") && 
          patient.severity === dischargedPatient.severity) {
        // Adjust times based on difference
        let newTime = Math.max((patient.estimatedWaitTime || 0) - timeDifference, 0);
        updates[childSnapshot.key + '/estimatedWaitTime'] = newTime;
      }
    });

    return patientsRef.update(updates);
  });