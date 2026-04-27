const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.static(__dirname));

const uri = "mongodb+srv://nurdauletrakhat2012_db_user:merushonok@cluster0.0u9r5ql.mongodb.net/nexuslink?retryWrites=true&w=majority";

mongoose.connect(uri)
    .then(() => console.log("✅ База подключена!"))
    .catch(err => console.error("❌ Ошибка базы:", err));

const MsgSchema = new mongoose.Schema({
    user: String, id: String, to: String, text: String, 
    type: { type: String, default: 'text' }, 
    time: String, color: String, date: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MsgSchema);

let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('auth request', async (data) => {
        const { nick, id } = data;
        const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        onlineUsers[id] = { nick, socketId: socket.id, color };
        socket.emit('auth success', { nick, id, color });

        // Загружаем последние 50 сообщений
        const history = await Message.find().sort({ date: -1 }).limit(50);
        socket.emit('load history', history.reverse());
        io.emit('update users', onlineUsers);
    });

    socket.on('chat message', async (msg) => {
        msg.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const newMsg = new Message(msg);
        await newMsg.save();

        if (msg.to === 'global') {
            io.emit('chat message', msg);
        } else {
            const target = onlineUsers[msg.to];
            if (target) io.to(target.socketId).emit('chat message', msg);
            socket.emit('chat message', msg);
        }
    });

    socket.on('disconnect', () => {
        for (let id in onlineUsers) {
            if (onlineUsers[id].socketId === socket.id) { delete onlineUsers[id]; break; }
        }
        io.emit('update users', onlineUsers);
    });
});

server.listen(process.env.PORT || 3000);
