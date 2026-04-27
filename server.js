const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 1e8 });

app.use(express.static(__dirname));

const uri = "mongodb+srv://nurdauletrakhat2012_db_user:merushonok@cluster0.0u9r5ql.mongodb.net/nexuslink?retryWrites=true&w=majority";

mongoose.connect(uri).then(() => console.log("✅ DB Connected")).catch(err => console.error(err));

// Расширенная схема сообщения
const MsgSchema = new mongoose.Schema({
    user: String, id: String, to: String, text: String, 
    type: { type: String, default: 'text' }, 
    time: String, color: String, avatar: String, date: { type: Date, default: Date.now }
});

// Схема пользователя (для сохранения настроек)
const UserSchema = new mongoose.Schema({
    id: String, nick: String, avatar: String, theme: String, notifications: Boolean
});

const Message = mongoose.model('Message', MsgSchema);
const User = mongoose.model('User', UserSchema);

let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('auth request', async (data) => {
        const { id, nick } = data;
        
        // Ищем юзера в базе или создаем нового
        let userDoc = await User.findOne({ id: id });
        if (!userDoc) {
            userDoc = new User({ id, nick, avatar: '', theme: 'dark', notifications: true });
            await userDoc.save();
        }

        const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        onlineUsers[id] = { nick: userDoc.nick, socketId: socket.id, color, avatar: userDoc.avatar };
        
        socket.emit('auth success', { nick: userDoc.nick, id: userDoc.id, color, avatar: userDoc.avatar });

        const history = await Message.find().sort({ date: -1 }).limit(50);
        socket.emit('load history', history.reverse());
        io.emit('update users', onlineUsers);
    });

    // Обновление профиля
    socket.on('update profile', async (data) => {
        const { oldId, newId, newNick, newAvatar } = data;
        await User.findOneAndUpdate({ id: oldId }, { id: newId, nick: newNick, avatar: newAvatar });
        
        if (onlineUsers[oldId]) {
            onlineUsers[newId] = { ...onlineUsers[oldId], nick: newNick, avatar: newAvatar };
            if (oldId !== newId) delete onlineUsers[oldId];
        }
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
