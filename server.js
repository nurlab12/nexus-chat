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

const MsgSchema = new mongoose.Schema({
    user: String, id: String, to: String, text: String, 
    time: String, date: { type: Date, default: Date.now },
    deleted: { type: Boolean, default: false }
});

const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    nick: String, password: { type: String, required: true }
});

const Message = mongoose.model('Message', MsgSchema);
const User = mongoose.model('User', UserSchema);

let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('auth request', async (data) => {
        const { id, nick, password } = data;
        let userDoc = await User.findOne({ id });
        if (!userDoc) {
            userDoc = new User({ id, nick, password });
            await userDoc.save();
        } else if (userDoc.password !== password) {
            return socket.emit('auth error', 'Неверный пароль');
        }

        socket.userId = id;
        onlineUsers[id] = { nick: userDoc.nick, socketId: socket.id };
        
        socket.emit('auth success', { nick: userDoc.nick, id: userDoc.id });
        const history = await Message.find({ deleted: false }).sort({ date: -1 }).limit(100);
        socket.emit('load history', history.reverse());
        io.emit('update users', onlineUsers);
    });

    // Логика звонков
    socket.on('call-request', (data) => {
        const target = onlineUsers[data.to];
        if (target) io.to(target.socketId).emit('incoming-call', { from: socket.userId, from_nick: onlineUsers[socket.userId].nick, video: data.video });
    });

    ['call-offer', 'call-answer', 'ice-candidate', 'end-call'].forEach(event => {
        socket.on(event, (data) => {
            const target = onlineUsers[data.to];
            if (target) io.to(target.socketId).emit(event, { ...data, from: socket.userId });
        });
    });

    socket.on('chat message', async (msg) => {
        const newMsg = new Message(msg);
        const saved = await newMsg.save();
        if (msg.to === 'global') {
            io.emit('chat message', saved);
        } else {
            const target = onlineUsers[msg.to];
            if (target) io.to(target.socketId).emit('chat message', saved);
            socket.emit('chat message', saved);
        }
    });

    socket.on('delete message', async (id) => {
        await Message.findByIdAndUpdate(id, { deleted: true });
        io.emit('message deleted', id);
    });

    socket.on('disconnect', () => {
        if (socket.userId) {
            delete onlineUsers[socket.userId];
            io.emit('update users', onlineUsers);
        }
    });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server running"));
