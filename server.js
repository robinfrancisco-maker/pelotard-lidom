const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// MARCADORES EN VIVO OFICIALES EN EL SERVIDOR
let lidomData = {
    date: '2026-10-21',
    games: [
        {
            id: 301,
            date: '2026-10-21',
            time: '07:15 PM',
            stadium: 'Estadio Tetelo Vargas (SPM)',
            away: 'EO',
            home: 'AC',
            awayName: 'Estrellas Orientales',
            homeName: 'Águilas Cibaeñas',
            awayRuns: 0,
            homeRuns: 0,
            status: 'LIVE',
            inning: 'RETRASADO POR LLUVIA',
            awayPitcher: 'Óscar de la Cruz',
            homePitcher: 'Tyler Alexander',
            awayMl: 1.85,
            homeMl: 1.95,
            rlLine: 1.5,
            awayRl: 2.25,
            homeRl: 1.60,
            total: 8.5,
            over: 1.90,
            under: 1.90
        },
        {
            id: 302,
            date: '2026-10-21',
            time: '07:15 PM',
            stadium: 'Estadio Julián Javier (SFM)',
            away: 'E',
            home: 'GC',
            awayName: 'Leones del Escogido',
            homeName: 'Gigantes del Cibao',
            awayRuns: 6,
            homeRuns: 1,
            status: 'LIVE',
            inning: 'BOT 4',
            awayPitcher: 'Ariel Miranda',
            homePitcher: 'Cristopher Molina',
            awayMl: 2.05,
            homeMl: 1.75,
            rlLine: 1.5,
            awayRl: 1.70,
            homeRl: 2.10,
            total: 8.5,
            over: 1.85,
            under: 1.95
        },
        {
            id: 303,
            date: '2026-10-21',
            time: '07:30 PM',
            stadium: 'Estadio Francisco Micheli (LRN)',
            away: 'L',
            home: 'TE',
            awayName: 'Tigres del Licey',
            homeName: 'Toros del Este',
            awayRuns: 1,
            homeRuns: 0,
            status: 'LIVE',
            inning: 'BOT 4',
            awayPitcher: 'L. Gil',
            homePitcher: 'Esmil Rogers',
            awayMl: 1.85,
            homeMl: 1.95,
            rlLine: 1.5,
            awayRl: 1.65,
            homeRl: 2.20,
            total: 8.0,
            over: 1.90,
            under: 1.90
        },
        {
            id: 101,
            date: '2026-10-20',
            stadium: 'Estadio Julián Javier (SFM)',
            time: '07:00 PM',
            away: 'L',
            home: 'GC',
            awayName: 'Tigres del Licey',
            homeName: 'Gigantes del Cibao',
            awayRuns: 5,
            homeRuns: 3,
            status: 'FINAL',
            inning: 'Final'
        }
    ]
};

io.on('connection', (socket) => {
    socket.emit('lidom_update', lidomData);

    socket.on('update_game_admin', (updatedGame) => {
        const index = lidomData.games.findIndex(g => g.id === updatedGame.id);
        if (index !== -1) {
            lidomData.games[index] = { ...lidomData.games[index], ...updatedGame };
            io.emit('lidom_update', lidomData);
        }
    });
});

app.get('/api/games', (req, res) => {
    res.json(lidomData);
});

server.listen(PORT, () => {
    console.log(`Servidor Pelotard ejecutándose en el puerto ${PORT}`);
});
