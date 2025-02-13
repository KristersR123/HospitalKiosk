// // Initialize Firebase
// const firebaseConfig = {
//     apiKey: "AIzaSyDogrFYk6a2nGL4YVftXrvzHLPYxvJZ1U4",
//     authDomain: "hospitalkiosk-a92a4.firebaseapp.com",
//     databaseURL: "https://hospitalkiosk-a92a4-default-rtdb.europe-west1.firebasedatabase.app",
//     projectId: "hospitalkiosk-a92a4",
//     storageBucket: "hospitalkiosk-a92a4.firebasestorage.app",
//     messagingSenderId: "781602336535",
//     appId: "1:781602336535:web:caac14621d8591341f5152",
//     measurementId: "G-0NWQC2EPBQ"
// };

// firebase.initializeApp(firebaseConfig);
// const database = firebase.database();

// // Function to Generate Unique Patient ID
// function generatePatientID() {
//     return "PAT-" + Math.floor(100000 + Math.random() * 900000); // Example: PAT-123456
// }

// // Function to Submit Patient Info
// function submitPatientInfo() {
//     let fullName = document.getElementById("full-name").value.trim();
//     let dob = document.getElementById("dob").value;
//     let gender = document.getElementById("gender").value;

//     // Input Validation
//     if (!/^[a-zA-Z]+ [a-zA-Z]+$/.test(fullName)) {
//         alert("Enter a valid full name (First and Last name).");
//         return;
//     }
//     let dobDate = new Date(dob);
//     if (dobDate >= new Date()) {
//         alert("Date of birth cannot be in the future.");
//         return;
//     }
//     if (gender === "") {
//         alert("Please select a gender.");
//         return;
//     }

//     let patientID = generatePatientID(); // Assign Unique ID
//     let checkInTime = new Date().toISOString();

//     // Create a new patient record
//     let patientRef = database.ref("patients").push(); // Generates Firebase key
//     let patientKey = patientRef.key; // Get the generated Firebase key

//     let patientData = {
//         firebaseKey: patientKey, // Explicitly store Firebase Key
//         patientID: patientID,    // Explicitly store generated ID
//         fullName: fullName,
//         dateOfBirth: dob,
//         gender: gender,
//         checkInTime: checkInTime,
//         status: "Awaiting Condition Selection"
//     };

//     // Store in Firebase
//     patientRef.set(patientData).then(() => {
//         console.log("Patient stored successfully:", patientData);
//         sessionStorage.setItem("patientID", patientKey); // Store Firebase key
//         sessionStorage.setItem("customPatientID", patientID); // Store Generated ID
//         window.location.href = "patientData.html"; // Redirect to Condition Selection
//     }).catch(error => {
//         console.error("Error storing patient:", error);
//         alert("Check-in failed. Try again.");
//     });
// }

// let selectedCategory = null;

// // Function to Select a Condition
// function selectCategory(category) {
//     selectedCategory = category;
//     document.getElementById("selected-category").textContent = `You've Selected: ${category}`;
// }

// // Function to Confirm Selection and Assign Queue Number
// function confirmSelection() {
//     if (!selectedCategory) {
//         alert("Please select a category!");
//         return;
//     }

//     let patientID = sessionStorage.getItem("patientID");
//     if (!patientID) {
//         alert("Session expired. Please start again.");
//         window.location.href = "index.html";
//         return;
//     }

//     let patientRef = database.ref("patients/" + patientID);

//     // Fetch the next available queue number for this condition
//     database.ref("queueNumbers/" + selectedCategory).once("value", (snapshot) => {
//         let queueNumber = snapshot.val() ? snapshot.val() + 1 : 1; // Increment queue number

//         // Update queue number in patient record
//         patientRef.update({
//             condition: selectedCategory,
//             status: "Waiting for Triage",
//             queueNumber: queueNumber
//         }).then(() => {
//             alert(`Your condition has been submitted!\nYour queue number: #${queueNumber}`);
//             database.ref("queueNumbers/" + selectedCategory).set(queueNumber); // Store new queue number
//             window.location.href = "index.html"; // Redirect back for next patient
//         }).catch(error => {
//             console.error("Error submitting condition:", error);
//         });
//     });
// }


// ✅ Replace this with your Render API URL
const RENDER_API_URL = "https://hospitalkiosk.onrender.com";

// Function to Generate Unique Patient ID
function generatePatientID() {
    return "PAT-" + Math.floor(100000 + Math.random() * 900000); // Example: PAT-123456
}

// Function to Submit Patient Info via Render API
function submitPatientInfo() {
    let fullName = document.getElementById("full-name").value.trim();
    let dob = document.getElementById("dob").value;
    let gender = document.getElementById("gender").value;

    // ✅ Input Validation
    if (!/^[a-zA-Z]+ [a-zA-Z]+$/.test(fullName)) {
        alert("Enter a valid full name (First and Last name).");
        return;
    }
    let dobDate = new Date(dob);
    if (dobDate >= new Date()) {
        alert("Date of birth cannot be in the future.");
        return;
    }
    if (gender === "") {
        alert("Please select a gender.");
        return;
    }

    let patientData = {
        fullName: fullName,
        dob: dob,
        gender: gender
    };

    // ✅ Send patient info to Render backend
    fetch(`${RENDER_API_URL}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log("✅ Patient stored successfully:", data);
            sessionStorage.setItem("patientID", data.patientID);
            sessionStorage.setItem("customPatientID", data.customPatientID);
            window.location.href = "patientData.html"; // Redirect to Condition Selection
        } else {
            alert("Check-in failed. Try again.");
        }
    })
    .catch(error => {
        console.error("❌ Error storing patient:", error);
        alert("Check-in failed. Try again.");
    });
}

let selectedCategory = null;

// Function to Select a Condition
function selectCategory(category) {
    selectedCategory = category;
    document.getElementById("selected-category").textContent = `You've Selected: ${category}`;
}

// Function to Confirm Selection and Assign Queue Number
function confirmSelection() {
    if (!selectedCategory) {
        alert("Please select a category!");
        return;
    }

    let patientID = sessionStorage.getItem("patientID");
    if (!patientID) {
        alert("Session expired. Please start again.");
        window.location.href = "index.html";
        return;
    }

    let patientData = { patientID, condition: selectedCategory };

    fetch(`${RENDER_API_URL}/assign-condition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            alert(`✅ Your condition has been submitted!\nYour queue number: #${data.queueNumber}`);
            window.location.href = "index.html"; // Redirect back for next patient
        }
    })
    .catch(error => console.error("❌ Error submitting condition:", error));
}

// Function to Load and Display Estimated Wait Times
function loadWaitTime() {
    let patientID = sessionStorage.getItem("patientID");
    if (!patientID) {
        console.error("❌ No patient ID found in session storage.");
        return;
    }

    fetch(`${RENDER_API_URL}/patient-wait-time/${patientID}`)
    .then(response => response.json())
    .then(data => {
        let waitTimeElement = document.getElementById("estimated-wait-time");
        
        if (!waitTimeElement) {
            console.error("❌ 'estimated-wait-time' element not found in DOM.");
            return;
        }

        if (data.success) {
            waitTimeElement.textContent = `Estimated Wait Time: ${data.estimatedWaitTime} minutes`;
        } else {
            waitTimeElement.textContent = "Wait time not available.";
        }
    })
    .catch(error => console.error("❌ Error fetching wait time:", error));
}

// Load estimated wait time on page load
document.addEventListener("DOMContentLoaded", loadWaitTime);