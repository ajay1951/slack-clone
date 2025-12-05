require("dotenv").config();
const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const { Server } = require("socket.io");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Import Models
const User = require("./models/User");
const Message = require("./models/Message");
const Group = require("./models/Group");

const app = express();

// --- MIDDLEWARE ---
app.use(cors());
app.use(express.json());

// Serve static files (Images & Audio)
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log("MongoDB Error:", err));

// --- FILE UPLOAD CONFIGURATION (Multer) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads"); // Save to 'server/uploads'
  },
  filename: (req, file, cb) => {
    // timestamp + extension
    const ext = path.extname(file.originalname) || ".webm";
    cb(null, Date.now() + ext); 
  },
});
const upload = multer({ storage });

// --- HTTP ROUTES ---

// 1. REGISTER (Updated for Profile Pic)
app.post("/register", async (req, res) => {
  try {
    const { username, password, profilePic } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Use provided pic or a default placeholder
    const finalPic = profilePic || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

    const newUser = new User({ 
      username, 
      password: hashedPassword,
      profilePic: finalPic 
    });
    
    await newUser.save();

    res.status(201).json({ message: "User registered successfully" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. LOGIN (Updated to return Profile Pic)
app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
    
    // Return token, username, AND profilePic
    res.json({ 
      token, 
      username: user.username,
      profilePic: user.profilePic 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. FILE UPLOAD
app.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });
    const fileUrl = `http://localhost:3001/uploads/${req.file.filename}`;
    res.json({ fileUrl });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: "File upload failed" });
  }
});

// 4. GET MESSAGES
app.get("/messages/:room", async (req, res) => {
  try {
    const { room } = req.params;
    const messages = await Message.find({ room }).sort({ createdAt: 1 });
    res.json(messages);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch history" });
  }
});

// 5. GET ALL USERS (Updated to return Profile Pic)
app.get("/users", async (req, res) => {
  try {
    // Select only username and profilePic
    const users = await User.find({}, "username profilePic");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch users" });
  }
});

// 6. GET GROUPS
app.get("/groups", async (req, res) => {
  try {
    const groups = await Group.find().sort({ name: 1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: "Could not fetch groups" });
  }
});

// 7. CREATE GROUP
app.post("/groups", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ message: "Group name required" });
    
    const existing = await Group.findOne({ name });
    if (existing) return res.status(400).json({ message: "Group already exists" });

    const newGroup = new Group({ name });
    await newGroup.save();
    res.status(201).json(newGroup);
  } catch (error) {
    res.status(500).json({ error: "Could not create group" });
  }
});

// --- SOCKET.IO SERVER ---
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
  },
});

let activeUsers = [];

io.on("connection", (socket) => {
  console.log(`User Connected: ${socket.id}`);

  // 1. JOIN ROOM
  socket.on("join_room", (data) => {
    // Destructure profilePic from data
    const { username, room, profilePic } = data;

    // Leave previous rooms
    socket.rooms.forEach((r) => {
      if (r !== socket.id) socket.leave(r);
    });

    socket.join(room);
    console.log(`${username} joined ${room}`);

    // Update Active Users List (Store profilePic too!)
    activeUsers = activeUsers.filter(user => user.username !== username);
    activeUsers.push({ id: socket.id, username, room, profilePic });

    // Broadcast updated list
    io.emit("active_users", activeUsers);
  });

  // 2. SEND MESSAGE
  socket.on("send_message", async (data) => {
    try {
      // Create Message with authorPic
      const newMessage = new Message({
        id: data.id,
        room: data.room,
        author: data.author,
        authorPic: data.authorPic, // <--- Saving the pic
        type: data.type,
        message: data.message,
        time: data.time
      });
      await newMessage.save();
      
      // Broadcast to room
      io.to(data.room).emit("receive_message", data);
    } catch (err) {
      console.error("Error saving message:", err);
    }
  });

  // 3. DELETE MESSAGE
  socket.on("delete_message", async (data) => {
    // data = { id, room, type, fileUrl }
    try {
      await Message.findOneAndDelete({ id: data.id });

      // Delete file from disk if applicable
      if (data.type === "image" || data.type === "audio") {
        const filename = data.fileUrl.split("/uploads/")[1];
        if (filename) {
          const filePath = path.join(__dirname, "uploads", filename);
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        }
      }

      // Broadcast delete
      io.to(data.room).emit("receive_delete_message", data.id);
    } catch (err) {
      console.error("Error deleting message:", err);
    }
  });

  // 4. EDIT MESSAGE
  socket.on("edit_message", async (data) => {
    try {
      await Message.findOneAndUpdate({ id: data.id }, { message: data.newText, isEdited: true });
      io.to(data.room).emit("receive_edit_message", data);
    } catch (err) {
      console.error("Error editing message:", err);
    }
  });

  // 5. TYPING
  socket.on("typing", (data) => {
    socket.to(data.room).emit("display_typing", data);
  });

  socket.on("stop_typing", (data) => {
    socket.to(data.room).emit("display_typing", { message: "" });
  });

  // 6. DISCONNECT
  socket.on("disconnect", () => {
    activeUsers = activeUsers.filter((user) => user.id !== socket.id);
    io.emit("active_users", activeUsers);
    console.log("User Disconnected", socket.id);
  });
});

// --- START SERVER ---
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING ON PORT ${PORT}`);
});