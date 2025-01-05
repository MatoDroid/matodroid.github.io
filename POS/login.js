const BACKEND_URL = "https://matodroid.onrender.com"; // URL backendu
const token = localStorage.getItem("authToken"); // Načítanie tokenu z localStorage
if (!token) {
    console.error("Token chýba. Používateľ musí byť prihlásený.");
}
document.getElementById("login-button").addEventListener("click", async () => {
    const username = document.getElementById("username").value;
    const password = document.getElementById("password").value;

//    console.log("Zadané údaje:", { username, password });

    try {
        const response = await fetch(`${BACKEND_URL}/login`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ username, password }),
        });

        const result = await response.json();
//        console.log("Odpoveď servera na login:", result);

        if (response.ok && result.success) {
            localStorage.setItem("authToken", result.token);
//            console.log("Token uložený do localStorage:", result.token);

            // Presmerovanie podľa role
            if (result.role === "admin") {
                window.location.href = "/POS/admin.html";
            } else if (result.role === "user") {
                window.location.href = "/POS/pos.html";
            }
        } else {
            document.getElementById("error-message").textContent = result.message || "Neplatné údaje.";
        }
    } catch (error) {
        console.error("Chyba servera pri prihlasovaní:", error);
        document.getElementById("error-message").textContent = "Chyba servera. Skúste znova.";
    }
});

