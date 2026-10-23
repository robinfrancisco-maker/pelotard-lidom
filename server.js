const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

let lidomLiveData = {
    games: [],
    lastUpdated: null
};

// DICCIONARIO OFICIAL DE EQUIPOS LIDOM
const TEAM_MAPPING = {
    'licey': 'L', 'tigres': 'L', 'l': 'L',
    'aguilas': 'AC', 'águilas': 'AC', 'ac': 'AC',
    'gigantes': 'GC', 'gc': 'GC',
    'escogido': 'E', 'leones': 'E', 'e': 'E',
    'toros': 'TE', 'te': 'TE',
    'estrellas': 'EO', 'eo': 'EO'
};

function normalizeTeamCode(rawName) {
    if (!rawName) return 'LIDOM';
    const clean = rawName.toLowerCase();
    for (let key in TEAM_MAPPING) {
        if (clean.includes(key)) return TEAM_MAPPING[key];
    }
    return rawName.substring(0, 3).toUpperCase();
}

// 1. FUENTE PRINCIPAL: API STATS MLB (LIDOM ID 132)
async function fetchFromMlbApi(todayStr) {
    const apiUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=132&date=${todayStr}&hydrate=team,linescore`;
    const response = await axios.get(apiUrl, { timeout: 8000 });
    const dates = response.data.dates;
    
    if (!dates || dates.length === 0 || !dates[0].games || dates[0].games.length === 0) {
        return null;
    }

    return dates[0].games.map(g => {
        const awayAbbr = normalizeTeamCode(g.teams.away.team.abbreviation || g.teams.away.team.name);
        const homeAbbr = normalizeTeamCode(g.teams.home.team.abbreviation || g.teams.home.team.name);
        
        let statusStr = 'SCHEDULED';
        let inningStr = 'POR COMENZAR';

        if (g.status.abstractGameState === 'Live') {
            statusStr = 'LIVE';
            const currentInning = g.linescore ? g.linescore.currentInning : 1;
            const isTop = g.linescore ? g.linescore.isTopInning : true;
            inningStr = `${isTop ? 'Alta' : 'Baja'} ${currentInning}º`;
        } else if (g.status.abstractGameState === 'Final') {
            statusStr = 'FINAL';
            inningStr = 'FINALIZADO';
        }

        const gameDate = new Date(g.gameDate);
        const timeStr = gameDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        return {
            id: g.gamePk,
            date: todayStr,
            time: timeStr,
            stadium: g.venue ? g.venue.name : 'Estadio LIDOM',
            away: awayAbbr,
            home: homeAbbr,
            awayName: g.teams.away.team.name,
            homeName: g.teams.home.team.name,
            awayRuns: g.linescore ? (g.linescore.teams.away.runs || 0) : 0,
            homeRuns: g.linescore ? (g.linescore.teams.home.runs || 0) : 0,
            status: statusStr,
            inning: inningStr,
            awayPitcher: 'Por definir',
            homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        };
    });
}

// 2. FUENTE DE RESPALDO AUTO-ALIMENTADA (ESPN SCOREBOARD)
async function fetchFromEspnApi() {
    // Liga Dominicana en ESPN
    const espnUrl = 'https://site.api.espn.com/apis/site/v2/sports/baseball/leagues/dom.1/scoreboard';
    const response = await axios.get(espnUrl, { timeout: 8000 });
    const events = response.data.events;

    if (!events || events.length === 0) return null;

    return events.map(ev => {
        const competition = ev.competitions[0];
        const homeComp = competition.competitors.find(c => c.homeAway === 'home');
        const awayComp = competition.competitors.find(c => c.homeAway === 'away');

        const awayCode = normalizeTeamCode(awayComp.team.abbreviation || awayComp.team.name);
        const homeCode = normalizeTeamCode(homeComp.team.abbreviation || homeComp.team.name);

        const statusType = ev.status.type.state; // "pre", "in", "post"
        let statusStr = 'SCHEDULED';
        let inningStr = ev.status.type.shortDetail || 'POR COMENZAR';

        if (statusType === 'in') statusStr = 'LIVE';
        else if (statusType === 'post') statusStr = 'FINAL';

        return {
            id: ev.id,
            date: new Date().toISOString().split('T')[0],
            time: new Date(ev.date).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            stadium: competition.venue ? competition.venue.fullName : 'Estadio LIDOM',
            away: awayCode,
            home: homeCode,
            awayName: awayComp.team.displayName,
            homeName: homeComp.team.displayName,
            awayRuns: parseInt(awayComp.score) || 0,
            homeRuns: parseInt(homeComp.score) || 0,
            status: statusStr,
            inning: inningStr,
            awayPitcher: 'Por definir',
            homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        };
    });
}

// FUNCIÓN PRINCIPAL DE SINCRONIZACIÓN AUTOMÁTICA
async function syncLidomData() {
    const todayStr = new Date().toISOString().split('T')[0];
    console.log(`🔄 Sincronizando cartelera LIDOM [${new Date().toLocaleTimeString('es-DO')}]...`);

    let games = null;

    // Intento 1: API MLB
    try {
        games = await fetchFromMlbApi(todayStr);
    } catch (e) {
        console.log('⚠️ Fuente MLB no respondió, alternando a fuente de respaldo ESPN...');
    }

    // Intento 2: Respaldo ESPN
    if (!games || games.length === 0) {
        try {
            games = await fetchFromEspnApi();
        } catch (e) {
            console.error('⚠️ Error en fuente de respaldo:', e.message);
        }
    }

    if (games && games.length > 0) {
        lidomLiveData.games = games;
        lidomLiveData.lastUpdated = new Date().toLocaleTimeString('es-DO');
        io.emit('lidom_auto_update', lidomLiveData);
        console.log(`✅ Sincronizados ${games.length} juegos activos de LIDOM.`);
    } else {
        console.log('ℹ️ No hay partidos de LIDOM programados para la fecha actual.');
    }
}

// Sincronizar cada 45 segundos
setInterval(syncLidomData, 45 * 1000);
syncLidomData();

io.on('connection', (socket) => {
    console.log('⚡ Cliente web conectado:', socket.id);
    socket.emit('lidom_auto_update', lidomLiveData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor PELOTARD corriendo en puerto ${PORT}`));
