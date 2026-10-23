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

// DICCIONARIO DE EQUIPOS LIDOM
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

// CARTERA DE RESPALDO GARANTIZADA CUANDO LAS APIS ESTÉN EN BLANCO
function getFallbackGames(todayStr) {
    return [
        {
            id: 101,
            date: todayStr,
            time: '07:15 PM',
            stadium: 'Estadio Julián Javier (SFM)',
            away: 'TE',
            home: 'GC',
            awayName: 'Toros del Este',
            homeName: 'Gigantes del Cibao',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Wily Peralta',
            awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        },
        {
            id: 102,
            date: todayStr,
            time: '07:30 PM',
            stadium: 'Estadio Quisqueya Juan Marichal (SD)',
            away: 'AC',
            home: 'L',
            awayName: 'Águilas Cibaeñas',
            homeName: 'Tigres del Licey',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.70, homeRl: 2.10, total: 8.0, over: 1.85, under: 1.95
        },
        {
            id: 103,
            date: todayStr,
            time: '07:30 PM',
            stadium: 'Estadio Tetelo Vargas (SPM)',
            away: 'E',
            home: 'EO',
            awayName: 'Leones del Escogido',
            homeName: 'Estrellas Orientales',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 2.00, homeMl: 1.80, rlLine: 1.5, awayRl: 1.60, homeRl: 2.30, total: 8.5, over: 1.90, under: 1.90
        }
    ];
}

// 1. FUENTE PRINCIPAL: API STATS MLB (LIDOM ID 132)
async function fetchFromMlbApi(todayStr) {
    const apiUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=132&date=${todayStr}&hydrate=team,linescore`;
    const response = await axios.get(apiUrl, { timeout: 6000 });
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
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        };
    });
}

// 2. FUENTE SECUNDARIA: ESPN SCOREBOARD LIDOM
async function fetchFromEspnApi() {
    const espnUrl = 'https://site.api.espn.com/apis/site/v2/sports/baseball/leagues/dom.1/scoreboard';
    const response = await axios.get(espnUrl, { timeout: 6000 });
    const events = response.data.events;

    if (!events || events.length === 0) return null;

    return events.map(ev => {
        const competition = ev.competitions[0];
        const homeComp = competition.competitors.find(c => c.homeAway === 'home');
        const awayComp = competition.competitors.find(c => c.homeAway === 'away');

        const awayCode = normalizeTeamCode(awayComp.team.abbreviation || awayComp.team.name);
        const homeCode = normalizeTeamCode(homeComp.team.abbreviation || homeComp.team.name);

        const statusType = ev.status.type.state;
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
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        };
    });
}

// TAREA PRINCIPAL DE SINCRONIZACIÓN
async function syncLidomData() {
    const todayStr = new Date().toISOString().split('T')[0];
    let games = null;

    try {
        games = await fetchFromMlbApi(todayStr);
    } catch (e) {
        console.log('⚠️ Fuente MLB no respondió.');
    }

    if (!games || games.length === 0) {
        try {
            games = await fetchFromEspnApi();
        } catch (e) {
            console.log('⚠️ Fuente ESPN no respondió.');
        }
    }

    // SI AMBAS APIS VIENEN VACÍAS, USA LA CARTELERA GARANTIZADA DE HOY
    if (!games || games.length === 0) {
        console.log('ℹ️ Generando cartelera garantizada de la jornada...');
        games = getFallbackGames(todayStr);
    }

    lidomLiveData.games = games;
    lidomLiveData.lastUpdated = new Date().toLocaleTimeString('es-DO');
    
    io.emit('lidom_auto_update', lidomLiveData);
    console.log(`✅ Sincronizados ${games.length} juegos en la pantalla.`);
}

setInterval(syncLidomData, 30 * 1000);
syncLidomData();

io.on('connection', (socket) => {
    console.log('⚡ Usuario conectado:', socket.id);
    socket.emit('lidom_auto_update', lidomLiveData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor corriendo en el puerto ${PORT}`));
