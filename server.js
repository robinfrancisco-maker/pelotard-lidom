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
    schedule: [
        { gamePk: 101, status: '7:15 PM', awayTeam: 'TL', homeTeam: 'AC', awayName: 'Tigres del Licey', homeName: 'Águilas Cibaeñas', awayScore: 0, homeScore: 0, venue: 'Estadio Cibao', lineAway: '-110', lineHome: '-110', total: '8.5' },
        { gamePk: 102, status: '7:30 PM', awayTeam: 'EO', homeTeam: 'E', awayName: 'Estrellas Orientales', homeName: 'Leones del Escogido', awayScore: 0, homeScore: 0, venue: 'Estadio Quisqueya', lineAway: '+105', lineHome: '-125', total: '7.5' },
        { gamePk: 103, status: '7:30 PM', awayTeam: 'GC', homeTeam: 'TE', awayName: 'Gigantes del Cibao', homeName: 'Toros del Este', awayScore: 0, homeScore: 0, venue: 'Estadio Francisco Micheli', lineAway: '-120', lineHome: '+100', total: '8.0' }
    ],
    lideres: {
        bateo: [
            { pos: 1, jugador: 'Emilio Bonifacio', equipo: 'TL', avg: '.348', hr: 3, rbi: 18, h: 32 },
            { pos: 2, jugador: 'Yairo Muñoz', equipo: 'AC', avg: '.335', hr: 2, rbi: 15, h: 29 },
            { pos: 3, jugador: 'Junior Caminero', equipo: 'E', avg: '.320', hr: 5, rbi: 22, h: 28 },
            { pos: 4, jugador: 'Socrates Brito', equipo: 'EO', avg: '.312', hr: 4, rbi: 16, h: 26 },
            { pos: 5, jugador: 'Kelvin Gutiérrez', equipo: 'GC', avg: '.305', hr: 3, rbi: 14, h: 25 },
            { pos: 6, jugador: 'Yairo Muñoz', equipo: 'AC', avg: '.298', hr: 2, rbi: 12, h: 24 },
            { pos: 7, jugador: 'Gustavo Núñez', equipo: 'TE', avg: '.290', hr: 1, rbi: 10, h: 23 },
            { pos: 8, jugador: 'Sergio Alcántara', equipo: 'TL', avg: '.285', hr: 2, rbi: 11, h: 22 },
            { pos: 9, jugador: 'Franmil Reyes', equipo: 'E', avg: '.280', hr: 6, rbi: 20, h: 21 },
            { pos: 10, jugador: 'Elehuris Montero', equipo: 'AC', avg: '.275', hr: 4, rbi: 15, h: 20 }
        ],
        pitcheo: [
            { pos: 1, jugador: 'César Valdez', equipo: 'TL', efe: '1.85', so: 32, sv: 0, w: 4 },
            { pos: 2, jugador: 'Tyler Alexander', equipo: 'E', efe: '2.10', so: 28, sv: 0, w: 3 },
            { pos: 3, jugador: 'Gerson Garabito', equipo: 'AC', efe: '2.35', so: 30, sv: 0, w: 3 },
            { pos: 4, jugador: 'Jefry Yan', equipo: 'EO', efe: '1.15', so: 22, sv: 8, w: 1 },
            { pos: 5, jugador: 'Yennsy Díaz', equipo: 'TE', efe: '2.50', so: 25, sv: 0, w: 2 },
            { pos: 6, jugador: 'Esmil Rogers', equipo: 'EO', efe: '2.65', so: 24, sv: 0, w: 3 },
            { pos: 7, jugador: 'Raúl Valdés', equipo: 'TE', efe: '2.80', so: 29, sv: 0, w: 2 },
            { pos: 8, jugador: 'Brooks Hall', equipo: 'TL', efe: '2.95', so: 21, sv: 0, w: 2 },
            { pos: 9, jugador: 'Enny Romero', equipo: 'E', efe: '3.10', so: 26, sv: 0, w: 2 },
            { pos: 10, jugador: 'Joe Van Meter', equipo: 'AC', efe: '3.25', so: 20, sv: 0, w: 1 }
        ]
    },
    boletos: []
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

            if (receivedStandings.length > 0) {
                memoryDb.standings = receivedStandings;
                io.emit('update-standings', memoryDb.standings);
            }
            return res.json({ status: 'ok', count: memoryDb.standings.length });
        }
        res.status(400).json({ status: 'error', message: 'Estructura no válida' });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

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
                            venue: game.venue?.name || 'Estadio LIDOM',
                            lineAway: '-110',
                            lineHome: '-110',
                            total: '8.5'
                        });
                    });
                }
            });
        }

        if (gamesList.length > 0) {
            memoryDb.schedule = gamesList;
            io.emit('update-schedule', memoryDb.schedule);
        }
        return res.json({ status: 'ok', count: memoryDb.schedule.length });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.post('/api/crear-boleto', (req, res) => {
    try {
        const { jugadas, tipo, monto, pagoPotencial } = req.body;
        const codigoBoleto = 'TKT-' + Math.floor(100000 + Math.random() * 900000);
        const nuevoBoleto = {
            id: codigoBoleto,
            fecha: new Date().toLocaleString('es-DO'),
            jugadas,
            tipo,
            monto,
            pagoPotencial,
            estado: 'Activo'
        };
        memoryDb.boletos.unshift(nuevoBoleto);
        io.emit('update-boletos', memoryDb.boletos);
        return res.json({ status: 'ok', boleto: nuevoBoleto });
    } catch (error) {
        res.status(500).json({ status: 'error', error: error.message });
    }
});

app.get('/api/standings', (req, res) => res.json(memoryDb.standings));
app.get('/api/schedule', (req, res) => res.json(memoryDb.schedule));
app.get('/api/lideres', (req, res) => res.json(memoryDb.lideres));
app.get('/api/boletos', (req, res) => res.json(memoryDb.boletos));

io.on('connection', (socket) => {
    socket.emit('update-standings', memoryDb.standings);
    socket.emit('update-schedule', memoryDb.schedule);
    socket.emit('update-lideres', memoryDb.lideres);
    socket.emit('update-boletos', memoryDb.boletos);
});

http.listen(PORT, () => {
    console.log(`Servidor activo en el puerto ${PORT}`);
});
