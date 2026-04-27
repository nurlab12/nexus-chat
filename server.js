const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { 
    maxHttpBufferSize: 1e8 // Лимит 100мб для фото и видео
});

app.use(express.static(__dirname));

// ТВОЯ ССЫЛКА С ПАРОЛЕМ (Уже вставлена!)
const uri = "mongodb+srv://nurdauletrakhat2012_db_user:merushonok@cluster0.0u9r5ql.mongodb.net/nexuslink?retryWrites=true&w=majority";

// Подключение к облаку
mongoose.connect(uri)
    .then(() => console.log("✅ Облачная база NexusLink подключена!"))
    .catch(err => console.error("❌ Ошибка подключения к базе:", err));

// Схема сообщения для базы данных
const MsgSchema = new mongoose.Schema({
    user: String,
    id: String,
    to: String,
    text: String,
    type: { type: String, default: 'text' },
    time: String,
    color: String,
    date: { type: Date, default: Date.now }
});

const Message = mongoose.model('Message', MsgSchema);

let onlineUsers = {}; 

io.on('connection', (socket) => {
    // Авторизация
    socket.on('auth request', async (data) => {
        const { nick, id, password } = data;
        const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
        
        onlineUsers[id] = { nick, socketId: socket.id, color };
        socket.emit('auth success', { nick, id, color });

        try {
            // Загружаем последние 50 сообщений из облака при входе
            const history = await Message.find().sort({ date: -1 }).limit(50);
            socket.emit('load history', history.reverse());
        } catch (err) {
            console.error("Ошибка загрузки истории:", err);
        }

        io.emit('update users', onlineUsers);
    });

    // Обработка сообщений
    socket.on('chat message', async (msg) => {
        msg.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        try {
            // Сохраняем сообщение в MongoDB навсегда
            const newMsg = new Message(msg);
            await newMsg.save();

            if (msg.to === 'global') {
                io.emit('chat message', msg);
            } else {
                const target = onlineUsers[msg.to];
                if (target) {
                    io.to(target.socketId).emit('chat message', msg);
                }
                // Отправляем себе, чтобы сообщение отобразилось в окне лички
                socket.emit('chat message', msg);
            }
        } catch (err) {
            console.error("Ошибка сохранения сообщения:", err);
        }
    });

    socket.on('disconnect', () => {
        for (let id in onlineUsers) {
            if (onlineUsers[id].socketId === socket.id) {
                delete onlineUsers[id];
                break;
            }
        }
        io.emit('update users', onlineUsers);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 NexusLink Ultra Cloud Active на порту ${PORT}`));
