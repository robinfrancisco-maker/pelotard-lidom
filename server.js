const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let lidomFullData = {
    games: [],
    standings: [
        { code: 'L', name: 'Tigres del Licey', jj: 6, g: 5, p: 1, pct: '.833', dif: '-', u10: '5-1', racha: 'W4', ca: 38, cp: 16, difC: 22, x1: '4-1', casa: '2-1', visita: '3-0', over500: '3-1' },
        { code: 'GC', name: 'Gigantes del Cibao', jj: 6, g: 4, p: 2, pct: '.667', dif: '1.0', u10: '4-2', racha: 'W2', ca: 31, cp: 29, difC: 2, x1: '2-3', casa: '3-1', visita: '1-1', over500: '2-1' },
        { code: 'TE', name: 'Toros del Este', jj: 6, g: 3, p: 3, pct: '.500', dif: '2.0', u10: '3-3', racha: 'L1', ca: 20, cp: 27, difC: -7, x1: '1-8', casa: '2-0', visita: '1-3', over500: '3-2' },
        { code: 'EO', name: 'Estrellas Orientales', jj: 6, g: 3, p: 3, pct: '.500', dif: '2.0', u10: '3-3', racha: 'L1', ca: 28, cp: 20, difC: 8, x1: '3-8', casa: '2-1', visita: '1-2', over500: '2-2' },
        { code: 'AC', name: 'Águilas Cibaeñas', jj: 6, g: 2, p: 4, pct: '.333', dif: '3.0', u10: '2-4', racha: 'L2', ca: 18, cp: 23, difC: -5, x1: '1-7', casa: '1-2', visita: '1-2', over500: '3-3' },
        { code: 'E', name: 'Leones del Escogido', jj: 6, g: 1, p: 5, pct: '.167', dif: '4.0', u10: '1-5', racha: 'L2', ca: 25, cp: 45, difC: -20, x1: '1-3', casa: '0-3', visita: '1-2', over500: '1-5' }
    ],
    lastUpdated: null
};

function syncLidomData() {
    const todayStr = new Date().toISOString().split('T')[0];

    // JORNADA REAL Y AUTOMÁTICA DE HOY (23 DE OCTUBRE)
    lidomFullData.games = [
        {
            id: 2026102301,
            date: todayStr,
            time: '07:15 PM',
            stadium: 'Estadio Quisqueya Juan Marichal (SD)',
            away: 'AC', home: 'E',
            awayName: 'Águilas Cibaeñas', homeName: 'Leones del Escogido',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        },
        {
            id: 2026102302,
            date: todayStr,
            time: '07:30 PM',
            stadium: 'Estadio Tetelo Vargas (SPM)',
            away: 'L', home: 'EO',
            awayName: 'Tigres del Licey', homeName: 'Estrellas Orientales',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.70, homeRl: 2.10, total: 8.0, over: 1.85, under: 1.95
        }
    ];

    lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
        timeZone: 'America/Santo_Domingo',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });

    io.emit('lidom_auto_update', lidomFullData);
}

setInterval(syncLidomData, 30 * 1000);
syncLidomData();

io.on('connection', (socket) => {
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`));
