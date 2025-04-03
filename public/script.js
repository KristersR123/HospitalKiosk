
// Replace this with your Render API URL
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

    // Input Validation
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

    // Send patient info to Render backend
    fetch(`${RENDER_API_URL}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patientData)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            console.log("Patient stored successfully:", data);
            sessionStorage.setItem("patientID", data.patientID);
            sessionStorage.setItem("customPatientID", data.customPatientID);
            window.location.href = "patientData.html"; // Redirect to Condition Selection
        } else {
            alert("Check-in failed. Try again.");
        }
    })
    .catch(error => {
        console.error("Error storing patient:", error);
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
        console.log("Server response:", data); // Debugging log

        if (data.success && data.queueNumber !== undefined) {
            alert(`Your condition has been submitted!\nYour queue number: #${data.queueNumber}`);
            window.location.href = "index.html"; // Redirect back for next patient
        } else {
            alert("Error: Queue number not assigned. Please try again.");
        }
    })
    .catch(error => {
        console.error("Error submitting condition:", error);
        alert("Submission failed. Try again.");
    });
}

// Function to Load and Display Estimated Wait Times
function loadWaitTime() {
    let patientID = sessionStorage.getItem("patientID");
    if (!patientID) return;

    fetch(`${RENDER_API_URL}/patient-wait-time/${patientID}`)
    .then(response => response.json())
    .then(data => {
        const waitTimeElement = document.getElementById("estimated-wait-time");
        if (!waitTimeElement) {
            console.error("Error: 'estimated-wait-time' element not found in DOM.");
            return;
        }

        if (data.success) {
            waitTimeElement.textContent = `Estimated Wait Time: ${data.estimatedWaitTime} minutes`;
        } else {
            waitTimeElement.textContent = "Estimated Wait Time: Not Available";
        }
    })
    .catch(error => console.error("Error fetching wait time:", error));
}
