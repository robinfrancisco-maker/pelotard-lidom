const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

// Configuración de límites y CORS
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

// Memoria temporal del servidor
let memoryDb = {
    standings: [],
    schedule: []
};

// Mapeo de códigos de equipos de LIDOM
function parseLidomCode(teamName, teamAbbr) {
    const name = (teamName || '').toLowerCase();
    const abbr = (teamAbbr || '').toLowerCase();

    if (name.includes('licey') || abbr.includes('tl')) return 'TL';
    if (name.includes('aguilas') || name.includes('águilas') || abbr.includes('ac')) return 'AC';
    if (name.includes('escogido') || abbr.includes('e')) return 'E';
    if (name.includes('estrellas') || abbr.includes('eo')) return 'EO';
    if (name.includes('toros') || abbr.includes('te')) return 'TE';
    if (name.includes('gigantes') || abbr.includes('gc')) return 'GC';
    return abbr.toUpperCase() || 'LIDOM';
}

// 1. ENDPOINT PARA STANDINGS (TABLA DE POSICIONES)
app.post('/api/update-lidom', (req, res) => {
    try {
        if (req.body && req.body.records) {
            let receivedStandings = [];
            req.body.records.forEach(record => {
                if (record.teamRecords) {
                    record.teamRecords.forEach(tr => {
                        const code = parseLidomCode(tr.team.name, tr.team.abbreviation);
                        if (code) {
                            receivedStandings.push({
                                code: code,
                                name: tr.team.name,
                                jj: (tr.wins || 0) + (tr.losses || 0),
                                g: tr.wins || 0,
                                p: tr.losses || 0,
                                pct: tr.winningPercentage || '.000',
                                dif: tr.gamesBack || '-',
                                u10: '0-0',
                                racha: tr.streak?.streakCode || '-',
                                ca: tr.runsScored || 0,
                                cp: tr.runsAllowed || 0,
                                difc: (tr.runsScored || 0) - (tr.runsAllowed || 0),
                                x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                            });
                        }
                    });
                }
            });

            memoryDb.standings = receivedStandings;
            io.emit('update-standings', memoryDb.standings);
            console.log(" Standings de LIDOM actualizados correctamente.");
            return res.json({ status: 'ok', count: memoryDb.standings.length });
        }
        res.status(400).json({ status: 'error', message: 'Estructura de Standings no válida' });
    } catch (error) {
        console.error("Error en update-lidom:", error);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// 2. ENDPOINT PARA CARTELERA (SCHEDULE / JUEGOS DE HOY)
app.post('/api/update-schedule', (req, res) => {
    try {
        if (req.body && req.body.dates) {
            let gamesList = [];
            req.body.dates.forEach(dateGroup => {
                if (dateGroup.games) {
                    dateGroup.games.forEach(game => {
                        gamesList.push({
                            gamePk: game.gamePk,
                            gameDate: game.gameDate,
                            status: game.status?.detailedState || 'Programado',
                            awayTeam: parseLidomCode(game.teams?.away?.team?.name, ''),
                            homeTeam: parseLidomCode(game.teams?.home?.team?.name, ''),
                            awayName: game.teams?.away?.team?.name,
                            homeName: game.teams?.home?.team?.name,
                            awayScore: game.teams?.away?.score || 0,
                            homeScore: game.teams?.home?.score || 0,
                            venue: game.venue?.name || ''
                        });
                    });
                }
            });

            memoryDb.schedule = gamesList;
            io.emit('update-schedule', memoryDb.schedule);
            console.log(" Cartelera de juegos actualizada correctamente.");
            return res.json({ status: 'ok', count: memoryDb.schedule.length });
        }
        res.status(400).json({ status: 'error', message: 'Estructura de Cartelera no válida' });
    } catch (error) {
        console.error("Error en update-schedule:", error);
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// GETters para el Frontend (para consultar datos al cargar la página)
app.get('/api/standings', (req, res) => res.json(memoryDb.standings));
app.get('/api/schedule', (req, res) => res.json(memoryDb.schedule));

// Manejo de conexiones con Socket.io
io.on('connection', (socket) => {
    console.log('Cliente conectado vía Socket.io');
    socket.emit('update-standings', memoryDb.standings);
    socket.emit('update-schedule', memoryDb.schedule);
});

http.listen(PORT, () => {
    console.log(`Servidor corriendo en el puerto ${PORT}`);
});
