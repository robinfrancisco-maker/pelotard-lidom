const express = require('express');
const cors = require('cors');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http, {
    cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(express.static('public'));

let memoryDb = {
    standings: [],
    schedule: []
};

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

// 1. ENDPOINT STANDINGS
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
                                racha: tr.streak?.streakCode || '-'
                            });
                        }
                    });
                }
            });

            memoryDb.standings = receivedStandings;
            io.emit('update-standings', memoryDb.standings);
            console.log("Standings de LIDOM actualizados exitosamente.");
            return res.json({ status: 'ok', count: memoryDb.standings.length });
        }
        res.status(400).json({ status: 'error', message: 'Estructura de Standings no válida' });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

// ENDPOINT CARTELERA (SCHEDULE)
app.post('/api/update-schedule', (req, res) => {
    try {
        let gamesList = [];

        if (req.body && req.body.dates && req.body.dates.length > 0) {
            req.body.dates.forEach(dateGroup => {
                if (dateGroup.games && dateGroup.games.length > 0) {
                    dateGroup.games.forEach(game => {
                        gamesList.push({
                            gamePk: game.gamePk,
                            gameDate: game.gameDate,
                            status: game.status?.detailedState || 'Programado',
                            awayTeam: parseLidomCode(game.teams?.away?.team?.name, ''),
                            homeTeam: parseLidomCode(game.teams?.home?.team?.name, ''),
                            awayName: game.teams?.away?.team?.name || 'Visitante',
                            homeName: game.teams?.home?.team?.name || 'Local',
                            awayScore: game.teams?.away?.score ?? 0,
                            homeScore: game.teams?.home?.score ?? 0,
                            venue: game.venue?.name || 'Estadio LIDOM'
                        });
                    });
                }
            });
        }

        // Si la API de la MLB no devuelve juegos para el rango actual, cargar partidos de la jornada LIDOM
        if (gamesList.length === 0) {
            gamesList = [
                { gamePk: 101, status: '7:15 PM', awayTeam: 'TL', homeTeam: 'AC', awayName: 'Tigres del Licey', homeName: 'Águilas Cibaeñas', awayScore: 0, homeScore: 0, venue: 'Estadio Cibao' },
                { gamePk: 102, status: '7:30 PM', awayTeam: 'EO', homeTeam: 'E', awayName: 'Estrellas Orientales', homeName: 'Leones del Escogido', awayScore: 0, homeScore: 0, venue: 'Estadio Quisqueya' },
                { gamePk: 103, status: '7:30 PM', awayTeam: 'GC', homeTeam: 'TE', awayName: 'Gigantes del Cibao', homeName: 'Toros del Este', awayScore: 0, homeScore: 0, venue: 'Estadio Francisco Micheli' }
            ];
        }

        memoryDb.schedule = gamesList;
        io.emit('update-schedule', memoryDb.schedule);
        console.log(`Cartelera de LIDOM cargada con ${gamesList.length} partidos.`);
        return res.json({ status: 'ok', count: memoryDb.schedule.length });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.get('/api/standings', (req, res) => res.json(memoryDb.standings));
app.get('/api/schedule', (req, res) => res.json(memoryDb.schedule));

io.on('connection', (socket) => {
    socket.emit('update-standings', memoryDb.standings);
    socket.emit('update-schedule', memoryDb.schedule);
});

http.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});
