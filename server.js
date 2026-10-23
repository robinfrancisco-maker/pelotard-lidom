const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const DATA_FILE = path.join(__dirname, 'lidom_cache.json');

// DICCIONARIO DE EQUIPOS LIDOM
const TEAM_MAPPING = {
    'licey': 'L', 'tigres': 'L', 'l': 'L',
    'aguilas': 'AC', 'águilas': 'AC', 'ac': 'AC',
    'gigantes': 'GC', 'gc': 'GC',
    'escogido': 'E', 'leones': 'E', 'e': 'E',
    'toros': 'TE', 'te': 'TE',
    'estrellas': 'EO', 'eo': 'EO'
};

function normalizeTeamCode(name, abbrev) {
    if (abbrev && abbrev.length <= 3) return abbrev.toUpperCase();
    const clean = (name || '').toLowerCase();
    for (let key in TEAM_MAPPING) {
        if (clean.includes(key)) return TEAM_MAPPING[key];
    }
    return (name || 'LID').substring(0, 3).toUpperCase();
}

// Cargar datos previos si existen en disco (Para no empezar nunca vacíos)
let lidomFullData = {
    games: [],
    standings: [],
    battingLeaders: [],
    pitchingLeaders: [],
    lastUpdated: null
};

if (fs.existsSync(DATA_FILE)) {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        lidomFullData = JSON.parse(raw);
        console.log('📦 Caché de LIDOM cargado desde disco local.');
    } catch (e) {
        console.log('⚠️ No se pudo leer la caché inicial.');
    }
}

// EXTRACTOR AUTOMÁTICO DE DATOS REALES (MLB API LIDOM ID 132)
async function ingestLidomData() {
    try {
        const season = new Date().getFullYear();
        
        // 1. EXTRAER POSICIONES REALES (STANDINGS)
        const stdUrl = `https://statsapi.mlb.com/api/v1/standings?leagueId=132&season=${season}`;
        const stdRes = await axios.get(stdUrl, { timeout: 8000 });
        
        let newStandings = [];
        if (stdRes.data && stdRes.data.records) {
            stdRes.data.records.forEach(record => {
                if (record.teamRecords) {
                    record.teamRecords.forEach(tr => {
                        const code = normalizeTeamCode(tr.team.name, tr.team.abbreviation);
                        newStandings.push({
                            code: code,
                            name: tr.team.name,
                            jj: (tr.wins || 0) + (tr.losses || 0),
                            g: tr.wins || 0,
                            p: tr.losses || 0,
                            pct: tr.winningPercentage || '.000',
                            dif: tr.gamesBack || '-',
                            u10: tr.records?.splitRecords?.find(s => s.type === 'lastTen') ? 
                                `${tr.records.splitRecords.find(s => s.type === 'lastTen').wins}-${tr.records.splitRecords.find(s => s.type === 'lastTen').losses}` : '0-0',
                            racha: tr.streak?.streakCode || '-',
                            ca: tr.runsScored || 0,
                            cp: tr.runsAllowed || 0,
                            difC: (tr.runsScored || 0) - (tr.runsAllowed || 0),
                            x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                        });
                    });
                }
            });
        }

        if (newStandings.length > 0) {
            lidomFullData.standings = newStandings;
        }

        // 2. EXTRAER PARTIDOS DEL DÍA
        const todayStr = new Date().toISOString().split('T')[0];
        const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=132&leagueId=132&date=${todayStr}`;
        const schedRes = await axios.get(schedUrl, { timeout: 8000 });

        let newGames = [];
        if (schedRes.data && schedRes.data.dates && schedRes.data.dates.length > 0) {
            const gamesList = schedRes.data.dates[0].games || [];
            gamesList.forEach(g => {
                const awayCode = normalizeTeamCode(g.teams.away.team.name, g.teams.away.team.abbreviation);
                const homeCode = normalizeTeamCode(g.teams.home.team.name, g.teams.home.team.abbreviation);

                newGames.push({
                    id: g.gamePk,
                    date: todayStr,
                    time: new Date(g.gameDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                    stadium: g.venue?.name || 'Estadio LIDOM',
                    away: awayCode,
                    home: homeCode,
                    awayName: g.teams.away.team.name,
                    homeName: g.teams.home.team.name,
                    awayRuns: g.teams.away.score || 0,
                    homeRuns: g.teams.home.score || 0,
                    status: g.status.abstractGameState,
                    inning: g.status.detailedState || 'POR COMENZAR',
                    awayPitcher: g.teams.away.probablePitcher?.fullName || 'Por definir',
                    homePitcher: g.teams.home.probablePitcher?.fullName || 'Por definir',
                    awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
                });
            });
        }

        lidomFullData.games = newGames;
        lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
            timeZone: 'America/Santo_Domingo',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });

        // Guardar actualización en caché local de disco
        fs.writeFileSync(DATA_FILE, JSON.stringify(lidomFullData, null, 2));

        console.log(`✅ Ingesta de LIDOM completada exitosamente a las ${lidomFullData.lastUpdated}`);
    } catch (error) {
        console.log('⚠️ Error en la ingesta automática de LIDOM:', error.message);
    }

    // Emitir datos actualizados a todos los usuarios conectados
    io.emit('lidom_auto_update', lidomFullData);
}

// Ejecución continua cada 30 segundos
setInterval(ingestLidomData, 30 * 1000);
ingestLidomData();

io.on('connection', (socket) => {
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor PELOTARD ejecutándose en puerto ${PORT}`));
