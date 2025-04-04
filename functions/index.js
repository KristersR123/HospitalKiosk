/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Create and deploy your first functions
// https://firebase.google.com/docs/functions/get-started

// exports.helloWorld = onRequest((request, response) => {
//   logger.info("Hello logs!", {structuredData: true});
//   response.send("Hello from Firebase!");
// });
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
    .onUpdate(async (change, context) => {
        const patientBefore = change.before.val();
        const patientAfter = change.after.val();

        if (
            patientBefore.status === "With Doctor" &&
            patientAfter.status === "Discharged"
        ) {
            console.log("🔥 Triggered adjustWaitTimesOnDischarge");

            const baseWaitTime = severityWaitTimes[patientBefore.severity] || 0;
            const acceptedTime = new Date(patientBefore.acceptedTime).getTime();
            const now = Date.now();
            const actualTime = Math.floor((now - acceptedTime) / 60000);
            const extraTime = actualTime - baseWaitTime;

            if (extraTime === 0) {
                console.log("⏱ No adjustment needed (doctor took expected time).");
                return null;
            }

            const patientsRef = admin.database().ref('/patients');
            const patientsSnapshot = await patientsRef.once('value');

            let doctorStillBusy = false;
            const updates = {};

            patientsSnapshot.forEach((snap) => {
                const p = snap.val();

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
                return null;
            }

            patientsSnapshot.forEach((snap) => {
                const patient = snap.val();
                const key = snap.key;

                if (
                    (patient.status?.startsWith("Queueing for") || patient.status === "Please See Doctor") &&
                    patient.condition === patientBefore.condition &&
                    patient.severity === patientBefore.severity
                ) {
                    const currentWait = patient.estimatedWaitTime || 0;
                    const newWait = Math.max(currentWait + extraTime, 0);
                    updates[`${key}/estimatedWaitTime`] = newWait;
                }
            });

            if (Object.keys(updates).length > 0) {
                await patientsRef.update(updates);
                console.log(`✅ Updated wait times by ${extraTime > 0 ? "+" : ""}${extraTime} mins.`);
            }
        }

        return null;
    });