import jwt from "jsonwebtoken";
import fetch from "node-fetch";

async function run() {
    const token = jwt.sign({ id: "123", role: "ADMIN", username: "admin" }, "super-secret-key-for-arxiva-123", { expiresIn: "1h" });
    const res = await fetch("http://172.168.9.240:3000/users", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
            username: "internaltest" + Date.now(),
            password: "password123",
            role: "INTERNAL",
            nama: "Internal User",
            email: "test@test.com",
            telepon: "123456"
        })
    });
    console.log(res.status);
    console.log(await res.text());
}
run();
