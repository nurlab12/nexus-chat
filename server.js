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
    type: { type: String, default: 'text' }, 
    time: String, avatar: String, 
    deleted: { type: Boolean, default: false },
    date: { type: Date, default: Date.now }
});

const UserSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    nick: String,
    password: { type: String, required: true }, // ПОЛЕ ПАРОЛЯ
    avatar: String,
    theme: { type: String, default: 'dark' }
});

const Message = mongoose.model('Message', MsgSchema);
const User = mongoose.model('User', UserSchema);

let onlineUsers = {}; 

io.on('connection', (socket) => {
    socket.on('auth request', async (data) => {
        const { id, nick, password } = data;
        
        let userDoc = await User.findOne({ id: id });
        
        if (!userDoc) {
            // Если юзера нет — регистрируем с паролем
            userDoc = new User({ id, nick, password, avatar: '' });
            await userDoc.save();
        } else {
            // Если юзер есть — проверяем пароль
            if (userDoc.password !== password) {
                return socket.emit('auth error', 'Неверный пароль для этого ID');
            }
        }

        const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        onlineUsers[id] = { nick: userDoc.nick, socketId: socket.id, color, avatar: userDoc.avatar };
        
        socket.emit('auth success', { nick: userDoc.nick, id: userDoc.id, color, avatar: userDoc.avatar });

        // Быстрая загрузка истории
        const history = await Message.find({ deleted: false }).sort({ date: -1 }).limit(100);
        socket.emit('load history', history.reverse());
        io.emit('update users', onlineUsers);
    });

    socket.on('delete message', async (msgId) => {
        await Message.findByIdAndUpdate(msgId, { deleted: true });
        io.emit('message deleted', msgId);
    });

    socket.on('chat message', async (msg) => {
        msg.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        // Быстрая отправка в сокет до сохранения в базу (для скорости)
        const sender = onlineUsers[msg.id];
        if (sender) msg.avatar = sender.avatar;

        const newMsg = new Message(msg);
        const saved = await newMsg.save();
        const finalMsg = saved.toObject();

        if (msg.to === 'global') {
            io.emit('chat message', finalMsg);
        } else {
            const target = onlineUsers[msg.to];
            if (target) io.to(target.socketId).emit('chat message', finalMsg);
            socket.emit('chat message', finalMsg);
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
