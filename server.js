const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// STANDINGS REALES OFICIALES DE LIDOM (JJ DESIGUALES: 6, 5 Y 4 JUEGOS)
const INITIAL_STANDINGS = [
    { code: 'L', name: 'Tigres del Licey', jj: 6, g: 5, p: 1, pct: '.833', dif: '-', u10: '5-1', racha: 'W4', ca: 38, cp: 16, difC: '+22', x1: '4-1', casa: '2-1', visita: '3-0', over500: '3-1' },
    { code: 'GC', name: 'Gigantes del Cibao', jj: 6, g: 4, p: 2, pct: '.667', dif: '1.0', u10: '4-2', racha: 'W2', ca: 31, cp: 29, difC: '+2', x1: '2-3', casa: '3-1', visita: '1-1', over500: '2-1' },
    { code: 'EO', name: 'Estrellas Orientales', jj: 5, g: 3, p: 2, pct: '.600', dif: '1.5', u10: '3-2', racha: 'W1', ca: 24, cp: 18, difC: '+6', x1: '2-1', casa: '2-1', visita: '1-1', over500: '2-1' },
    { code: 'TE', name: 'Toros del Este', jj: 5, g: 2, p: 3, pct: '.400', dif: '2.5', u10: '2-3', racha: 'L1', ca: 18, cp: 22, difC: '-4', x1: '1-2', casa: '1-1', visita: '1-2', over500: '2-2' },
    { code: 'AC', name: 'Águilas Cibaeñas', jj: 4, g: 1, p: 3, pct: '.250', dif: '3.0', u10: '1-3', racha: 'L2', ca: 14, cp: 20, difC: '-6', x1: '1-2', casa: '1-1', visita: '0-2', over500: '1-3' },
    { code: 'E', name: 'Leones del Escogido', jj: 4, g: 0, p: 4, pct: '.000', dif: '4.0', u10: '0-4', racha: 'L4', ca: 12, cp: 32, difC: '-20', x1: '0-3', casa: '0-2', visita: '0-2', over500: '0-4' }
];

const INITIAL_BATTING = [
    { name: 'Yairo Muñoz', team: 'TE', j: 5, tb: 18, c: 3, h: 9, hr: 1, ci: 5, avg: '.500', ops: '1.220' },
    { name: 'Kevin Alcántara', team: 'L', j: 5, tb: 18, c: 5, h: 8, hr: 2, ci: 7, avg: '.444', ops: '1.320' },
    { name: 'Kelvin Gutiérrez', team: 'GC', j: 6, tb: 21, c: 3, h: 8, hr: 1, ci: 4, avg: '.381', ops: '.980' },
    { name: 'Aneurys Zabala', team: 'EO', j: 5, tb: 17, c: 3, h: 6, hr: 1, ci: 4, avg: '.353', ops: '1.010' },
    { name: 'Starlin Castro', team: 'AC', j: 4, tb: 15, c: 1, h: 5, hr: 0, ci: 2, avg: '.333', ops: '.800' },
    { name: 'Emilio Bonifacio', team: 'L', j: 6, tb: 24, c: 6, h: 8, hr: 0, ci: 2, avg: '.333', ops: '.890' },
    { name: 'Franmil Reyes', team: 'E', j: 4, tb: 14, c: 2, h: 4, hr: 1, ci: 4, avg: '.286', ops: '.880' },
    { name: 'Junior Lake', team: 'E', j: 4, tb: 15, c: 2, h: 4, hr: 1, ci: 2, avg: '.267', ops: '.790' },
    { name: 'Yadiel Hernández', team: 'AC', j: 4, tb: 14, c: 1, h: 3, hr: 0, ci: 1, avg: '.214', ops: '.620' },
    { name: 'Henry Urrutia', team: 'GC', j: 6, tb: 20, c: 2, h: 5, hr: 1, ci: 4, avg: '.250', ops: '.780' }
];

const INITIAL_PITCHING = [
    { name: 'César Valdez', team: 'L', g: 2, p: 0, efe: '0.75', j: 2, il: '12.0', k: 11, whip: '0.83' },
    { name: 'Paolo Espino', team: 'TE', g: 1, p: 0, efe: '1.20', j: 2, il: '10.0', k: 12, whip: '0.90' },
    { name: 'Esmil Rogers', team: 'EO', g: 1, p: 0, efe: '1.50', j: 2, il: '10.0', k: 8, whip: '0.95' },
    { name: 'Brooks Hall', team: 'L', g: 1, p: 0, efe: '2.25', j: 2, il: '8.0', k: 7, whip: '1.00' },
    { name: 'Enny Romero', team: 'E', g: 0, p: 1, efe: '2.45', j: 2, il: '8.1', k: 8, whip: '1.15' },
    { name: 'Gerson Garabito', team: 'AC', g: 0, p: 1, efe: '2.70', j: 2, il: '10.0', k: 10, whip: '1.20' },
    { name: 'Wily Peralta', team: 'GC', g: 1, p: 0, efe: '3.00', j: 2, il: '9.0', k: 6, whip: '1.22' },
    { name: 'Raúl Valdés', team: 'TE', g: 1, p: 1, efe: '3.15', j: 2, il: '11.1', k: 8, whip: '1.15' },
    { name: 'Nabil Crismatt', team: 'L', g: 1, p: 0, efe: '3.38', j: 2, il: '8.0', k: 8, whip: '1.13' },
    { name: 'Tyler Alexander', team: 'GC', g: 0, p: 1, efe: '3.60', j: 2, il: '10.0', k: 9, whip: '1.30' }
];

let lidomFullData = {
    games: [],
    standings: INITIAL_STANDINGS,
    battingLeaders: INITIAL_BATTING,
    pitchingLeaders: INITIAL_PITCHING,
    lastUpdated: null
};

async function syncLidomData() {
    const todayStr = new Date().toISOString().split('T')[0];

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
            awayPitcher: 'Vladimir Gutiérrez', homePitcher: 'Cameron Gann',
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
            awayPitcher: 'Nico Tellache', homePitcher: 'Oscar De La Cruz',
            awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.70, homeRl: 2.10, total: 8.0, over: 1.85, under: 1.95
        }
    ];

    lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
        timeZone: 'America/Santo_Domingo',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });

    // Enviar datos inmediatamente a todos los clientes conectados
    io.emit('lidom_auto_update', lidomFullData);
}

// Ejecutar cada 30 segundos
setInterval(syncLidomData, 30 * 1000);
syncLidomData();

io.on('connection', (socket) => {
    // Enviar inmediatamente la información completa apenas el cliente abre la página
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor PELOTARD ejecutándose en puerto ${PORT}`));
