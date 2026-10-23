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

// 1. OBTENER STANDINGS REALES DE LIDOM DESDE ESPN API
async function fetchLidomStandingsESPN() {
    try {
        const url = 'https://site.api.espn.com/apis/v2/sports/baseball/dom.1/standings';
        const response = await axios.get(url, { timeout: 8000 });
        
        let fetchedStandings = [];
        if (response.data && response.data.children) {
            const standingsData = response.data.children[0]?.standings?.entries || [];
            
            standingsData.forEach(entry => {
                const teamName = entry.team.displayName;
                const stats = entry.stats || [];
                
                const getStat = (name) => {
                    const s = stats.find(x => x.name === name || x.type === name);
                    return s ? s.displayValue : '0';
                };

                const wins = parseInt(getStat('wins') || '0');
                const losses = parseInt(getStat('losses') || '0');
                const gamesPlayed = wins + losses;

                fetchedStandings.push({
                    code: normalizeTeamCode(teamName),
                    name: teamName,
                    jj: gamesPlayed || getStat('gamesPlayed') || '0',
                    g: wins,
                    p: losses,
                    pct: getStat('winPercent') || '.000',
                    dif: getStat('gamesBehind') || '-',
                    u10: getStat('differential') || '0-0',
                    racha: getStat('streak') || '-',
                    ca: getStat('runsFor') || '0',
                    cp: getStat('runsAgainst') || '0',
                    difC: (parseInt(getStat('runsFor') || '0') - parseInt(getStat('runsAgainst') || '0')),
                    x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                });
            });
        }

        if (fetchedStandings.length > 0) {
            lidomFullData.standings = fetchedStandings;
            console.log(`✅ Standings de LIDOM actualizados desde ESPN (${fetchedStandings.length} equipos).`);
        }
    } catch (e) {
        console.log('⚠️ Error al obtener Standings de ESPN:', e.message);
    }
}

// 2. OBTENER JUEGOS Y ABRIDORES DESDE ESPN API
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
                
                // Abridores si están anunciados
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
        console.log(`✅ Cartelera de LIDOM actualizada (${fetchedGames.length} partidos).`);
    } catch (e) {
        console.log('⚠️ Error al obtener Cartelera de ESPN:', e.message);
    }
}

// 3. SINCRONIZACIÓN GENERAL
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
server.listen(PORT, () => console.log(`🚀 Servidor LIDOM conectado a ESPN en puerto ${PORT}`));
