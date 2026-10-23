const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'lidom_cache.json');

// FILTRO ESTRICTO: SOLO EQUIPOS OFICIALES DE LIDOM
const VALID_LIDOM_CODES = ['L', 'E', 'AC', 'GC', 'TE', 'EO'];

const LIDOM_TEAMS_MAP = {
    'licey': 'L', 'tigres': 'L', 'l': 'L',
    'escogido': 'E', 'leones': 'E', 'e': 'E',
    'aguilas': 'AC', 'águilas': 'AC', 'ac': 'AC',
    'gigantes': 'GC', 'gc': 'GC',
    'toros': 'TE', 'te': 'TE',
    'estrellas': 'EO', 'eo': 'EO'
};

function parseLidomCode(name, abbrev) {
    const cleanAbb = (abbrev || '').toUpperCase();
    if (VALID_LIDOM_CODES.includes(cleanAbb)) return cleanAbb;

    const cleanName = (name || '').toLowerCase();
    for (let key in LIDOM_TEAMS_MAP) {
        if (cleanName.includes(key)) return LIDOM_TEAMS_MAP[key];
    }
    return null;
}

// Estructura principal en memoria
let lidomFullData = {
    games: [],
    standings: [],
    battingLeaders: [],
    pitchingLeaders: [],
    lastUpdated: null
};

// Cargar caché previo si existe
if (fs.existsSync(DATA_FILE)) {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.standings && parsed.standings.every(s => VALID_LIDOM_CODES.includes(s.code))) {
            lidomFullData = parsed;
            console.log('📦 Caché de LIDOM cargado desde disco local.');
        } else {
            fs.unlinkSync(DATA_FILE);
        }
    } catch (e) {
        if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
    }
}

// =========================================================================
// ENDPOINT RECEPTOR (WEBHOOK) DESDE GITHUB ACTIONS (BYPASS DE IP EN RENDER)
// =========================================================================
app.post('/api/update-lidom', express.json(), (req, res) => {
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
                                difC: (tr.runsScored || 0) - (tr.runsAllowed || 0),
                                x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                            });
                        }
                    });
                }
            });

            if (receivedStandings.length > 0) {
                lidomFullData.standings = receivedStandings;
                lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
                    timeZone: 'America/Santo_Domingo',
                    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
                });
                
                // Guardar copia local en caché de disco
                fs.writeFileSync(DATA_FILE, JSON.stringify(lidomFullData, null, 2));

                // Emitir en vivo por websockets a los clientes
                io.emit('lidom_auto_update', lidomFullData);
                console.log('✅ Webhook: Standings de LIDOM actualizados desde GitHub Action');
            }
        }
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('❌ Error en el webhook receptor:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Emisión inicial a usuarios al conectar
io.on('connection', (socket) => {
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor PELOTARD ejecutándose en puerto ${PORT}`));
