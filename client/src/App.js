import "./App.css";
import io from "socket.io-client";
import { useState } from "react";
import Chat from "./Chat";
import Auth from "./Auth";

function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState("");
  const [profilePic, setProfilePic] = useState(""); // <--- NEW: State for Profile Photo
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // --- LOGIN LOGIC ---
  const handleLogin = (user, pic) => {
    // 1. Establish the Socket Connection to the server
    const newSocket = io.connect("http://localhost:3001");
    setSocket(newSocket);

    // 2. Update State
    setUsername(user);
    setProfilePic(pic); // <--- Store the profile pic URL received from Auth
    setIsLoggedIn(true);
  };

  // --- LOGOUT LOGIC ---
  const handleLogout = () => {
    // 1. Disconnect the socket manually 
    // This ensures the server immediately removes the user from the "Online Users" list
    if (socket) {
      socket.disconnect();
    }

    // 2. Reset all state to default (Return to Login Screen)
    setSocket(null);
    setUsername("");
    setProfilePic("");
    setIsLoggedIn(false);
  };

  return (
    <div className="App">
      {!isLoggedIn ? (
        // SCENARIO 1: Not Logged In -> Show Auth (Login/Register) Screen
        <Auth onLogin={handleLogin} />
      ) : (
        // SCENARIO 2: Logged In -> Show Chat Interface
        // We check if 'socket' exists to prevent crashing
        socket ? (
          <Chat 
            socket={socket} 
            username={username}
            profilePic={profilePic} // <--- Pass profilePic to Chat
            logout={handleLogout}   // <--- Pass logout function to Chat
          />
        ) : (
          <div style={{color: "#333", marginTop: "20px"}}>Connecting to server...</div>
        )
      )}
    </div>
  );
}

export default App;