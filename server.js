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

// Mapeo exclusivo de equipos LIDOM
const TEAM_MAPPING = {
    'licey': 'L', 'tigres': 'L', 'l': 'L',
    'aguilas': 'AC', 'águilas': 'AC', 'ac': 'AC',
    'gigantes': 'GC', 'gc': 'GC',
    'escogido': 'E', 'leones': 'E', 'e': 'E',
    'toros': 'TE', 'te': 'TE',
    'estrellas': 'EO', 'eo': 'EO'
};

function normalizeTeamCode(name) {
    if (!name) return 'LID';
    const clean = name.toLowerCase();
    for (let key in TEAM_MAPPING) {
        if (clean.includes(key)) return TEAM_MAPPING[key];
    }
    return name.substring(0, 3).toUpperCase();
}

// 1. OBTENER Y MAPEAR STANDINGS DESDE ESPN API (LIGAS DOM.1)
async function fetchLidomStandingsESPN() {
    try {
        const url = 'https://site.api.espn.com/apis/v2/sports/baseball/dom.1/standings';
        const response = await axios.get(url, { timeout: 8000 });
        
        let fetchedStandings = [];
        if (response.data && response.data.children) {
            const standingsEntries = response.data.children[0]?.standings?.entries || [];
            
            standingsEntries.forEach(entry => {
                const teamName = entry.team?.displayName || entry.team?.name || 'Equipo';
                const stats = entry.stats || [];
                
                // Función flexible para extraer cada estadística según su clave
                const findStat = (keys) => {
                    const match = stats.find(s => keys.includes(s.name) || keys.includes(s.type));
                    return match ? (match.displayValue || match.value?.toString() || '0') : null;
                };

                const wins = parseInt(findStat(['wins', 'W']) || '0');
                const losses = parseInt(findStat(['losses', 'L']) || '0');
                const gamesPlayed = wins + losses || parseInt(findStat(['gamesPlayed', 'GP', 'J']) || '0');
                const pctVal = findStat(['winPercent', 'PCT', 'winpct']) || (gamesPlayed > 0 ? (wins / gamesPlayed).toFixed(3).replace('0.', '.') : '.000');
                const gbVal = findStat(['gamesBehind', 'GB', 'DIF']) || '-';

                fetchedStandings.push({
                    code: normalizeTeamCode(teamName),
                    name: teamName,
                    jj: gamesPlayed,
                    g: wins,
                    p: losses,
                    pct: pctVal,
                    dif: gbVal,
                    u10: findStat(['lastTen', 'L10']) || '0-0',
                    racha: findStat(['streak', 'STRK']) || '-',
                    ca: findStat(['runsFor', 'RF', 'RS']) || '0',
                    cp: findStat(['runsAgainst', 'RA']) || '0',
                    difC: (parseInt(findStat(['runsFor', 'RF', 'RS']) || '0') - parseInt(findStat(['runsAgainst', 'RA']) || '0')),
                    x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                });
            });
        }

        if (fetchedStandings.length > 0) {
            lidomFullData.standings = fetchedStandings;
            console.log(`✅ Standings de LIDOM procesados correctamente (${fetchedStandings.length} equipos).`);
        }
    } catch (e) {
        console.log('⚠️ Error al procesar Standings de ESPN:', e.message);
    }
}

// 2. OBTENER CARTELERA Y DILIGENCIAR PARTIDOS
async function fetchLidomGamesESPN() {
    try {
        const url = 'https://site.api.espn.com/apis/site/v2/sports/baseball/dom.1/scoreboard';
        const response = await axios.get(url, { timeout: 8000 });
        
        let fetchedGames = [];
        if (response.data && response.data.events) {
            response.data.events.forEach(evt => {
                const competition = evt.competitions[0];
                const away = competition.competitors.find(c => c.homeAway === 'away');
                const home = competition.competitors.find(c => c.homeAway === 'home');
                
                const awayName = away.team.displayName;
                const homeName = home.team.displayName;
                
                const awayProbable = away.probables ? away.probables[0]?.athlete?.displayName : 'Por definir';
                const homeProbable = home.probables ? home.probables[0]?.athlete?.displayName : 'Por definir';

                fetchedGames.push({
                    id: evt.id,
                    date: evt.date.split('T')[0],
                    time: new Date(evt.date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                    stadium: competition.venue?.fullName || 'Estadio LIDOM',
                    away: normalizeTeamCode(awayName),
                    home: normalizeTeamCode(homeName),
                    awayName: awayName,
                    homeName: homeName,
                    awayRuns: parseInt(away.score || '0'),
                    homeRuns: parseInt(home.score || '0'),
                    status: evt.status.type.state.toUpperCase(),
                    inning: evt.status.type.detail || 'POR COMENZAR',
                    awayPitcher: awayProbable,
                    homePitcher: homeProbable,
                    awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
                });
            });
        }

        lidomFullData.games = fetchedGames;
        console.log(`✅ Cartelera procesada (${fetchedGames.length} partidos).`);
    } catch (e) {
        console.log('⚠️ Error al procesar Cartelera de ESPN:', e.message);
    }
}

// 3. EJECUCIÓN CONTINUA
async function syncLidomData() {
    await fetchLidomStandingsESPN();
    await fetchLidomGamesESPN();

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
