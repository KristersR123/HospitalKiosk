/**
 * index.js (Cloud Function)
 * -------------------------
 * - Whenever a patient is removed from /patients/{id},
 *   if they have an acceptedTime, we compute how long
 *   they spent with the doctor (timeSpent) vs. the
 *   baseline severity time (baseWaitTime).
 * - We then adjust all "Queueing for X" patients with
 *   the same condition & severity by timeSpent - baseWaitTime.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
admin.initializeApp();

// Example base wait times (minutes) used in triage or if Cloud Function needs them:
const severityWaitTimes = {
  Red: 0,
  Orange: 10,
  Yellow: 60,
  Green: 120,
  Blue: 240,
};

exports.adjustWaitTimesOnDischarge = functions.database
  .ref('/patients/{patientId}')
  .onDelete(async (snapshot, context) => {
    const dischargedPatient = snapshot.val();
    // Only proceed if the doc had an acceptedTime => means they were actually "With Doctor"
    if (!dischargedPatient || !dischargedPatient.acceptedTime) {
      return null;
    }

    // Data
    const severity = dischargedPatient.severity;
    const condition = dischargedPatient.condition;
    const baseWaitTime = severityWaitTimes[severity] || 0;

    // Calculate actual time spent
    const acceptedTime = new Date(dischargedPatient.acceptedTime).getTime();
    const dischargeTime = Date.now();
    const timeSpent = Math.floor((dischargeTime - acceptedTime) / 60000);

    // timeDifference = (actualTimeSpent) - (baseWaitTime).
    // Positive => doctor took longer => add timeDifference to others
    // Negative => doctor was faster => subtract from others
    const timeDifference = timeSpent - baseWaitTime;

    const db = admin.database();
    const patientsRef = db.ref('/patients');
    const snapshotAll = await patientsRef.once('value');
    if (!snapshotAll.exists()) {
      return null;
    }

    const updates = {};
    snapshotAll.forEach((childSnap) => {
      const p = childSnap.val();
      const key = childSnap.key;
      // Adjust only those still in queue for the same condition+severity
      if (
        p.status &&
        p.status.startsWith('Queueing for') && 
        p.condition === condition && 
        p.severity === severity
      ) {
        const currWait = p.estimatedWaitTime || 0;
        const newWaitTime = Math.max(currWait + timeDifference, 0);
        updates[`${key}/estimatedWaitTime`] = newWaitTime;
      }
    });

    if (Object.keys(updates).length > 0) {
      await patientsRef.update(updates);
      console.log('✅ Updated wait times after discharge:', updates);
    }
    return null;
  });