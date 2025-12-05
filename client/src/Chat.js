import React, { useEffect, useState, useRef } from "react";
import axios from "axios";
import { v4 as uuidv4 } from "uuid";

// 1. ACCEPT 'logout' PROP
function Chat({ socket, username, logout }) {
  // ... (All your existing state variables) ...
  const [currentRoom, setCurrentRoom] = useState("General");
  const [messageList, setMessageList] = useState([]);
  const [activeUsers, setActiveUsers] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  
  const [sidebarView, setSidebarView] = useState("groups");
  const [newGroupName, setNewGroupName] = useState("");

  const [currentMessage, setCurrentMessage] = useState("");
  const [typingStatus, setTypingStatus] = useState("");
  const [editingMessageId, setEditingMessageId] = useState(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const [timeoutId, setTimeoutId] = useState(null);

  const [currentTheme, setCurrentTheme] = useState("#ffffff");
  const [showSettings, setShowSettings] = useState(false);

  // --- 1. INITIAL FETCH ---
  useEffect(() => {
    const fetchInitData = async () => {
      try {
        const usersRes = await axios.get("http://localhost:3001/users");
        setAllUsers(usersRes.data);
        const groupsRes = await axios.get("http://localhost:3001/groups");
        setGroups(groupsRes.data);
      } catch (e) { console.error(e); }
    };
    fetchInitData();
  }, []);

  // --- 2. SWITCH ROOM ---
  useEffect(() => {
    const switchRoom = async () => {
      if (socket) socket.emit("join_room", { username, room: currentRoom });
      try {
        const histRes = await axios.get(`http://localhost:3001/messages/${currentRoom}`);
        setMessageList(histRes.data);
      } catch (e) { console.error(e); }
    };
    switchRoom();
  }, [currentRoom, socket, username]);

  // --- 3. LISTENERS ---
  useEffect(() => {
    if (!socket) return;
    const handleReceiveMsg = (data) => setMessageList((list) => [...list, data]);
    const handleUserList = (users) => setActiveUsers(users);
    const handleTyping = (data) => setTypingStatus(data.message);
    const handleDeleteMsg = (id) => setMessageList((list) => list.filter((msg) => msg.id !== id));
    const handleEditMsg = (data) => setMessageList((list) => list.map((msg) => (msg.id === data.id ? { ...msg, message: data.newText, isEdited: true } : msg)));

    socket.on("receive_message", handleReceiveMsg);
    socket.on("active_users", handleUserList);
    socket.on("display_typing", handleTyping);
    socket.on("receive_delete_message", handleDeleteMsg);
    socket.on("receive_edit_message", handleEditMsg);

    return () => {
      socket.off("receive_message", handleReceiveMsg);
      socket.off("active_users", handleUserList);
      socket.off("display_typing", handleTyping);
      socket.off("receive_delete_message", handleDeleteMsg);
      socket.off("receive_edit_message", handleEditMsg);
    };
  }, [socket]);

  // --- ACTIONS (Keep all your existing functions: sendMessage, deleteMessage, etc.) ---
  const getCurrentTime = () => new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

  const createGroup = async () => {
    if (!newGroupName.trim()) return;
    try {
      const res = await axios.post("http://localhost:3001/groups", { name: newGroupName });
      setGroups([...groups, res.data]);
      setNewGroupName("");
      setCurrentRoom(res.data.name);
    } catch (e) { alert("Group exists"); }
  };

  const sendMessage = async () => {
    if (currentMessage !== "") {
      if (editingMessageId) { submitEdit(); return; }
      const messageData = { id: uuidv4(), room: currentRoom, author: username, type: "text", message: currentMessage, time: getCurrentTime(), isEdited: false };
      await socket.emit("send_message", messageData);
      setCurrentMessage("");
      socket.emit("stop_typing", { room: currentRoom });
    }
  };

  const startEdit = (id, text) => { setEditingMessageId(id); setCurrentMessage(text || ""); };
  const cancelEdit = () => { setEditingMessageId(null); setCurrentMessage(""); };
  const submitEdit = async () => {
    await socket.emit("edit_message", { id: editingMessageId, room: currentRoom, newText: currentMessage });
    setEditingMessageId(null); setCurrentMessage("");
  };
  const deleteMessage = (msg) => {
    socket.emit("delete_message", { id: msg.id, room: currentRoom, type: msg.type, fileUrl: msg.message });
  };
  
  const handleFileSelect = async (e) => {
    const file = e.target.files[0]; if(!file) return;
    const formData = new FormData(); formData.append("file", file);
    try {
      const res = await axios.post("http://localhost:3001/upload", formData, { headers: { "Content-Type": "multipart/form-data" } });
      const messageData = { id: uuidv4(), room: currentRoom, author: username, type: "image", message: res.data.fileUrl, time: getCurrentTime() };
      await socket.emit("send_message", messageData);
    } catch (e) { console.error(e); }
  };

  const startRecording = async () => {
     /* Copy your existing recording logic here */
     try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mediaRecorder = new MediaRecorder(stream);
        mediaRecorderRef.current = mediaRecorder;
        audioChunksRef.current = [];
        mediaRecorder.ondataavailable = (e) => { if(e.data.size>0) audioChunksRef.current.push(e.data); };
        mediaRecorder.onstop = async () => {
            const blob = new Blob(audioChunksRef.current, {type: "audio/webm"});
            const fd = new FormData(); fd.append("file", blob, "voice.webm");
            try {
            const res = await axios.post("http://localhost:3001/upload", fd, {headers:{"Content-Type":"multipart/form-data"}});
            const data = { id: uuidv4(), room: currentRoom, author: username, type: "audio", message: res.data.fileUrl, time: getCurrentTime() };
            await socket.emit("send_message", data);
            } catch(e) { console.error(e); }
            stream.getTracks().forEach(t=>t.stop());
        };
        mediaRecorder.start(); setIsRecording(true);
      } catch(e) { alert("Mic denied"); }
  };
  const stopRecording = () => { if(mediaRecorderRef.current) { mediaRecorderRef.current.stop(); setIsRecording(false); } };
  
  const handleInputString = (e) => {
     setCurrentMessage(e.target.value);
     if(!editingMessageId) { socket.emit("typing", { room: currentRoom, message: `${username} is typing...` }); if(timeoutId) clearTimeout(timeoutId); setTimeoutId(setTimeout(() => socket.emit("stop_typing", { room: currentRoom }), 2000)); }
  };
  const changeTheme = (c) => { setCurrentTheme(c); setShowSettings(false); };
  const getMetaColor = () => currentTheme === "#212121" ? "#ccc" : "black";

  return (
    <div className="chat-container">
      {/* SIDEBAR */}
      <div className="user-sidebar">
        <div className="sidebar-tabs">
          <button className={sidebarView === "groups" ? "active-tab" : ""} onClick={() => setSidebarView("groups")}>Groups</button>
          <button className={sidebarView === "online" ? "active-tab" : ""} onClick={() => setSidebarView("online")}>Online</button>
          <button className={sidebarView === "all" ? "active-tab" : ""} onClick={() => setSidebarView("all")}>All</button>
        </div>

        <ul className="sidebar-list">
          {sidebarView === "groups" && (
            <>
              <li onClick={() => setCurrentRoom("General")} className={currentRoom === "General" ? "active-room" : ""}># General</li>
              {groups.map((g) => ( <li key={g._id} onClick={() => setCurrentRoom(g.name)} className={currentRoom === g.name ? "active-room" : ""}># {g.name}</li> ))}
              <div className="create-group-container">
                <input type="text" placeholder="New Group" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} />
                <button onClick={createGroup}>+</button>
              </div>
            </>
          )}
          {sidebarView === "online" && activeUsers.map((u) => <li key={u.id}><span className="status-dot online">●</span> {u.username}</li>)}
          {sidebarView === "all" && allUsers.map((u) => <li key={u._id}><span className="status-dot offline">●</span> {u.username}</li>)}
        </ul>
      </div>

      {/* CHAT WINDOW */}
      <div className="chat-window">
        {/* HEADER */}
        <div className="chat-header">
          <p>{currentRoom}</p>
          <div className="header-right">
             {/* --- NEW LOGOUT BUTTON --- */}
             <button className="logout-btn" onClick={logout}>Logout</button>
             <span className="settings-icon" onClick={() => setShowSettings(!showSettings)}>⚙️</span>
          </div>
        </div>

        {showSettings && (
           <div className="settings-menu">
             <div className="theme-options">
               <div className="color-circle" style={{background: "#ffffff"}} onClick={() => changeTheme("#ffffff")}></div>
               <div className="color-circle" style={{background: "#212121"}} onClick={() => changeTheme("#212121")}></div>
             </div>
           </div>
        )}
        
        {/* BODY */}
        <div className="chat-body" style={{ background: currentTheme }}>
          {messageList.map((msg) => (
            <div key={msg.id} className="message" id={username === msg.author ? "you" : "other"}>
              <div>
                <div className="message-content">
                  {msg.type === "image" ? <img src={msg.message} alt="shared" style={{maxWidth:"150px"}}/> : msg.type === "audio" ? <audio controls src={msg.message} style={{width:"200px"}}/> : <p>{msg.message}</p>}
                  {msg.isEdited && <span className="edited-label">(edited)</span>}
                </div>
                <div className="message-meta">
                   <span style={{color: getMetaColor()}}>{msg.time}</span>
                   <span style={{color: getMetaColor(), fontWeight: "bold", marginLeft: "5px"}}>{msg.author}</span>
                   {username === msg.author && (
                     <div className="msg-actions">
                       {msg.type === "text" && <button onClick={() => startEdit(msg.id, msg.message)}>✏️</button>}
                       <button onClick={() => deleteMessage(msg)}>🗑️</button>
                     </div>
                   )}
                </div>
              </div>
            </div>
          ))}
          {typingStatus && <div className="typing-indicator"><p>{typingStatus}</p></div>}
        </div>

        {/* FOOTER */}
        <div className="chat-footer">
          {editingMessageId ? (
             <>
                <span style={{marginRight: "10px", fontWeight:"bold", color: "#43a047"}}>Editing...</span>
                <input type="text" value={currentMessage || ""} onChange={(e) => setCurrentMessage(e.target.value)} onKeyPress={(e) => e.key === "Enter" && submitEdit()} />
                <button onClick={submitEdit}>✅</button>
                <button onClick={cancelEdit} style={{color:"red"}}>❌</button>
             </>
          ) : (
             <>
                <button className="icon-btn" onClick={() => fileInputRef.current.click()}>📎</button>
                <input type="file" style={{ display: "none" }} ref={fileInputRef} onChange={handleFileSelect} />
                <button className={`icon-btn ${isRecording ? "recording" : ""}`} onClick={isRecording ? stopRecording : startRecording}>{isRecording ? "⏹️" : "🎤"}</button>
                <input type="text" value={currentMessage || ""} placeholder={`Message #${currentRoom}...`} onChange={handleInputString} onKeyPress={(e) => e.key === "Enter" && sendMessage()} disabled={isRecording}/>
                <button onClick={sendMessage}>&#9658;</button>
             </>
          )}
        </div>
      </div>
    </div>
  );
}
export default Chat;