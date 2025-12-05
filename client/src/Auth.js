import React, { useState } from "react";
import axios from "axios";

function Auth({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [file, setFile] = useState(null); 
  
  // --- FIX: Added Error State Definition ---
  const [error, setError] = useState(""); 

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); // Clear previous errors
    const endpoint = isLogin ? "/login" : "/register";
    let profilePicUrl = "";

    try {
      // 1. Upload Profile Photo (if registering and file exists)
      if (!isLogin && file) {
        const formData = new FormData();
        formData.append("file", file);

        const uploadRes = await axios.post("http://localhost:3001/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });

        profilePicUrl = uploadRes.data.fileUrl;
      }

      // 2. Submit Auth Request
      const response = await axios.post(`http://localhost:3001${endpoint}`, {
        username,
        password,
        profilePic: profilePicUrl, 
      });

      if (isLogin) {
        onLogin(response.data.username, response.data.profilePic);
      } else {
        alert("Registration successful! Please login.");
        setIsLogin(true);
        setFile(null);
        setPassword("");
      }
    } catch (err) {
      console.error(err);
      // Set the error state to display it in the UI
      setError(err.response?.data?.message || "An error occurred");
    }
  };

  return (
    <div className="joinChatContainer">
      <h3>{isLogin ? "Login" : "Register"}</h3>
      
      {/* Show Error Message if exists */}
      {error && <p style={{ color: "red", fontSize: "14px", margin: "5px 0" }}>{error}</p>}

      {/* Profile Photo Input (Register Only) */}
      {!isLogin && (
        <div style={{ width: "100%", marginBottom: "10px", textAlign: "left" }}>
          <label style={{ fontSize: "14px", fontWeight: "bold", display: "block", marginBottom: "5px" }}>
            Profile Photo (Optional):
          </label>
          <input 
            type="file" 
            onChange={(e) => setFile(e.target.files[0])} 
            accept="image/*"
            style={{ border: "none", padding: "0" }} 
          />
        </div>
      )}

      <input
        type="text"
        placeholder="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
      />
      
      <button onClick={handleSubmit}>
        {isLogin ? "Login" : "Register"}
      </button>
      
      <p 
        onClick={() => {
          setIsLogin(!isLogin);
          setFile(null);
          setError(""); // This line caused the error before because setError wasn't defined
        }} 
        style={{ cursor: "pointer", marginTop: "10px", textDecoration: "underline", color: "#43a047" }}
      >
        {isLogin ? "Need an account? Register" : "Already have an account? Login"}
      </p>
    </div>
  );
}

export default Auth;