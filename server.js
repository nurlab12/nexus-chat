const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let usersDB = {}; // База аккаунтов
let onlineUsers = {}; // Кто в сети прямо сейчас

io.on('connection', (socket) => {
    // Логика авторизации
    socket.on('auth request', (data) => {
        const { nick, id, password } = data;
        if (!nick || !id || !password) return;

        if (usersDB[id]) {
            if (usersDB[id].password === password) {
                login(id, usersDB[id].nick);
            } else {
                socket.emit('auth error', 'Неверный пароль для этого ID!');
            }
        } else {
            usersDB[id] = { nick, password };
            login(id, nick);
        }

        function login(userId, userNick) {
            const color = `hsl(${Math.random() * 360}, 70%, 60%)`;
            onlineUsers[userId] = { nick: userNick, socketId: socket.id, color: color };
            socket.emit('auth success', { nick: userNick, id: userId, color: color });
            io.emit('update users', onlineUsers); // Обновляем список контактов у всех
        }
    });

    // Логика сообщений (Глобал и Личка)
    socket.on('chat message', (msg) => {
        msg.time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        
        if (msg.to === 'global') {
            io.emit('chat message', msg);
        } else {
            const target = onlineUsers[msg.to];
            if (target) {
                // Отправляем только отправителю и получателю
                io.to(target.socketId).to(socket.id).emit('chat message', msg);
            }
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
server.listen(PORT, () => console.log(`🚀 NexusLink Ultra Full запущен на порту ${PORT}`));