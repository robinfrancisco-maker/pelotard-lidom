const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let lidomFullData = {
    games: [],
    standings: [],
    battingLeaders: [],
    pitchingLeaders: [],
    lastUpdated: null
};

// Mapeo oficial de códigos de equipos LIDOM
const TEAM_MAPPING = {
    'licey': 'L', 'tigres': 'L',
    'aguilas': 'AC', 'águilas': 'AC',
    'gigantes': 'GC',
    'escogido': 'E', 'leones': 'E',
    'toros': 'TE',
    'estrellas': 'EO'
};

function getTeamCode(name, abbrev) {
    if (abbrev && abbrev.length <= 3) return abbrev.toUpperCase();
    const clean = (name || '').toLowerCase();
    for (let key in TEAM_MAPPING) {
        if (clean.includes(key)) return TEAM_MAPPING[key];
    }
    return (name || 'LID').substring(0, 3).toUpperCase();
}

// CONEXIÓN DIRECTA A LA API DE MLB/LIDOM (SPORT 132 / LEAGUE 132)
async function fetchRealLidomData() {
    try {
        const season = new Date().getFullYear(); // Año actual
        
        // 1. OBTENER STANDINGS REALES DESDE MLB STATS API (LIDOM = leagueId 132)
        const standingsUrl = `https://statsapi.mlb.com/api/v1/standings?leagueId=132&season=${season}`;
        const stdRes = await axios.get(standingsUrl, { timeout: 8000 });

        let realStandings = [];
        if (stdRes.data && stdRes.data.records) {
            stdRes.data.records.forEach(record => {
                if (record.teamRecords) {
                    record.teamRecords.forEach(tr => {
                        const teamName = tr.team.name;
                        const code = getTeamCode(teamName, tr.team.abbreviation);
                        
                        realStandings.push({
                            code: code,
                            name: teamName,
                            jj: (tr.wins + tr.losses) || 0,
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

        if (realStandings.length > 0) {
            lidomFullData.standings = realStandings;
            console.log(`✅ STANDINGS REALES CONECTADOS: ${realStandings.length} equipos cargados desde MLB/LIDOM API.`);
        } else {
            console.log('⚠️ La API de LIDOM devolvió 0 registros de standings.');
        }

        // 2. OBTENER PARTIDOS DEL DÍA REALES DESDE MLB SCHEDULE API
        const todayStr = new Date().toISOString().split('T')[0];
        const scheduleUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=132&date=${todayStr}`;
        const schedRes = await axios.get(scheduleUrl, { timeout: 8000 });

        let realGames = [];
        if (schedRes.data && schedRes.data.dates && schedRes.data.dates.length > 0) {
            const gamesList = schedRes.data.dates[0].games || [];
            gamesList.forEach(g => {
                const awayName = g.teams.away.team.name;
                const homeName = g.teams.home.team.name;
                
                realGames.push({
                    id: g.gamePk,
                    date: todayStr,
                    time: new Date(g.gameDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                    stadium: g.venue?.name || 'Estadio LIDOM',
                    away: getTeamCode(awayName, g.teams.away.team.abbreviation),
                    home: getTeamCode(homeName, g.teams.home.team.abbreviation),
                    awayName: awayName,
                    homeName: homeName,
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

        if (realGames.length > 0) {
            lidomFullData.games = realGames;
            console.log(`✅ JUEGOS REALES CONECTADOS: ${realGames.length} partidos de hoy.`);
        }

        lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
            timeZone: 'America/Santo_Domingo',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });

        // Emitir datos reales extraídos directamente a todos los clientes
        io.emit('lidom_auto_update', lidomFullData);

    } catch (error) {
        console.error('❌ Error conectando a la API oficial de LIDOM/MLB:', error.message);
    }
}

// Sincronización continua cada 30 segundos
setInterval(fetchRealLidomData, 30 * 1000);
fetchRealLidomData();

io.on('connection', (socket) => {
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`));
