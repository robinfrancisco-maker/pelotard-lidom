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

// DICCIONARIO EXCLUSIVO DE EQUIPOS LIDOM
const LIDOM_TEAMS = {
    'L': { code: 'L', name: 'Tigres del Licey', aliases: ['licey', 'tigres', 'l'] },
    'E': { code: 'E', name: 'Leones del Escogido', aliases: ['escogido', 'leones', 'e'] },
    'AC': { code: 'AC', name: 'Águilas Cibaeñas', aliases: ['aguilas', 'águilas', 'ac'] },
    'GC': { code: 'GC', name: 'Gigantes del Cibao', aliases: ['gigantes', 'gc'] },
    'TE': { code: 'TE', name: 'Toros del Este', aliases: ['toros', 'te'] },
    'EO': { code: 'EO', name: 'Estrellas Orientales', aliases: ['estrellas', 'eo'] }
};

function normalizeLidomTeam(rawName, abbrev) {
    if (!rawName && !abbrev) return null;
    const cleanRaw = (rawName || '').toLowerCase();
    const cleanAbb = (abbrev || '').toUpperCase();

    // Verificación por abreviatura directa
    if (LIDOM_TEAMS[cleanAbb]) return LIDOM_TEAMS[cleanAbb];

    // Verificación por coincidencia de nombre
    for (let code in LIDOM_TEAMS) {
        const team = LIDOM_TEAMS[code];
        if (team.aliases.some(alias => cleanRaw.includes(alias))) {
            return team;
        }
    }
    return null;
}

// ==========================================
// FUENTE 1: ESPN API (DOM.1)
// ==========================================
async function tryFetchESPN() {
    try {
        const stdUrl = 'https://site.api.espn.com/apis/v2/sports/baseball/dom.1/standings';
        const stdRes = await axios.get(stdUrl, { timeout: 6000 });
        let standings = [];

        if (stdRes.data && stdRes.data.children && stdRes.data.children[0]?.standings?.entries) {
            const entries = stdRes.data.children[0].standings.entries;
            entries.forEach(entry => {
                const teamInfo = normalizeLidomTeam(entry.team?.displayName || entry.team?.name, entry.team?.abbreviation);
                if (teamInfo) {
                    const stats = entry.stats || [];
                    const getVal = (keys) => {
                        const match = stats.find(s => keys.includes(s.name) || keys.includes(s.type));
                        return match ? (match.displayValue || match.value?.toString() || '0') : '0';
                    };

                    const w = parseInt(getVal(['wins', 'W']));
                    const l = parseInt(getVal(['losses', 'L']));
                    const jj = w + l || parseInt(getVal(['gamesPlayed', 'GP']));

                    standings.push({
                        code: teamInfo.code,
                        name: teamInfo.name,
                        jj: jj,
                        g: w,
                        p: l,
                        pct: getVal(['winPercent', 'PCT']) || '.000',
                        dif: getVal(['gamesBehind', 'GB']) || '-',
                        u10: getVal(['lastTen', 'L10']) || '0-0',
                        racha: getVal(['streak', 'STRK']) || '-',
                        ca: getVal(['runsFor', 'RF', 'RS']),
                        cp: getVal(['runsAgainst', 'RA']),
                        difC: parseInt(getVal(['runsFor', 'RF', 'RS'])) - parseInt(getVal(['runsAgainst', 'RA'])),
                        x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                    });
                }
            });
        }

        // Cartelera
        const schedUrl = 'https://site.api.espn.com/apis/site/v2/sports/baseball/dom.1/scoreboard';
        const schedRes = await axios.get(schedUrl, { timeout: 6000 });
        let games = [];

        if (schedRes.data && schedRes.data.events) {
            schedRes.data.events.forEach(evt => {
                const comp = evt.competitions[0];
                const awayObj = comp.competitors.find(c => c.homeAway === 'away');
                const homeObj = comp.competitors.find(c => c.homeAway === 'home');

                const awayTeam = normalizeLidomTeam(awayObj.team.displayName, awayObj.team.abbreviation);
                const homeTeam = normalizeLidomTeam(homeObj.team.displayName, homeObj.team.abbreviation);

                if (awayTeam && homeTeam) {
                    games.push({
                        id: evt.id,
                        date: evt.date.split('T')[0],
                        time: new Date(evt.date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                        stadium: comp.venue?.fullName || 'Estadio LIDOM',
                        away: awayTeam.code,
                        home: homeTeam.code,
                        awayName: awayTeam.name,
                        homeName: homeTeam.name,
                        awayRuns: parseInt(awayObj.score || '0'),
                        homeRuns: parseInt(homeObj.score || '0'),
                        status: evt.status.type.state.toUpperCase(),
                        inning: evt.status.type.detail || 'POR COMENZAR',
                        awayPitcher: awayObj.probables ? awayObj.probables[0]?.athlete?.displayName : 'Por definir',
                        homePitcher: homeObj.probables ? homeObj.probables[0]?.athlete?.displayName : 'Por definir',
                        awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
                    });
                }
            });
        }

        if (standings.length > 0) {
            console.log(`✅ [FUENTE 1 - ESPN] Standings cargados (${standings.length} equipos).`);
            return { standings, games };
        }
        return null;
    } catch (e) {
        console.log('⚠️ [FUENTE 1 - ESPN] No disponible:', e.message);
        return null;
    }
}

// ==========================================
// FUENTE 2: MLB STATS API (LEAGUE 132 - ESTRICTO LIDOM)
// ==========================================
async function tryFetchMLB() {
    try {
        const season = new Date().getFullYear();
        const stdUrl = `https://statsapi.mlb.com/api/v1/standings?leagueId=132&season=${season}`;
        const stdRes = await axios.get(stdUrl, { timeout: 6000 });
        let standings = [];

        if (stdRes.data && stdRes.data.records) {
            stdRes.data.records.forEach(record => {
                if (record.teamRecords) {
                    record.teamRecords.forEach(tr => {
                        const teamInfo = normalizeLidomTeam(tr.team.name, tr.team.abbreviation);
                        if (teamInfo) {
                            standings.push({
                                code: teamInfo.code,
                                name: teamInfo.name,
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
        }

        const todayStr = new Date().toISOString().split('T')[0];
        const schedUrl = `https://statsapi.mlb.com/api/v1/schedule?sportId=132&leagueId=132&date=${todayStr}`;
        const schedRes = await axios.get(schedUrl, { timeout: 6000 });
        let games = [];

        if (schedRes.data && schedRes.data.dates && schedRes.data.dates.length > 0) {
            const gamesList = schedRes.data.dates[0].games || [];
            gamesList.forEach(g => {
                const awayTeam = normalizeLidomTeam(g.teams.away.team.name, g.teams.away.team.abbreviation);
                const homeTeam = normalizeLidomTeam(g.teams.home.team.name, g.teams.home.team.abbreviation);

                if (awayTeam && homeTeam) {
                    games.push({
                        id: g.gamePk,
                        date: todayStr,
                        time: new Date(g.gameDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                        stadium: g.venue?.name || 'Estadio LIDOM',
                        away: awayTeam.code,
                        home: homeTeam.code,
                        awayName: awayTeam.name,
                        homeName: homeTeam.name,
                        awayRuns: g.teams.away.score || 0,
                        homeRuns: g.teams.home.score || 0,
                        status: g.status.abstractGameState,
                        inning: g.status.detailedState || 'POR COMENZAR',
                        awayPitcher: g.teams.away.probablePitcher?.fullName || 'Por definir',
                        homePitcher: g.teams.home.probablePitcher?.fullName || 'Por definir',
                        awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
                    });
                }
            });
        }

        if (standings.length > 0) {
            console.log(`✅ [FUENTE 2 - MLB STATS 132] Standings cargados (${standings.length} equipos).`);
            return { standings, games };
        }
        return null;
    } catch (e) {
        console.log('⚠️ [FUENTE 2 - MLB STATS 132] No disponible:', e.message);
        return null;
    }
}

// ==========================================
// ORQUESTADOR MULTI-FUENTE EN CASCADA
// ==========================================
async function syncLidomMultiSource() {
    // Intentar Fuente 1 (ESPN)
    let result = await tryFetchESPN();

    // Si Fuente 1 falla o viene vacía, pasar a Fuente 2 (MLB Stats)
    if (!result || !result.standings || result.standings.length === 0) {
        console.log('🔄 Conmutando a Fuente 2 (MLB Stats API)...');
        result = await tryFetchMLB();
    }

    if (result && result.standings && result.standings.length > 0) {
        lidomFullData.standings = result.standings;
        lidomFullData.games = result.games || [];
    } else {
        console.error('❌ Todas las fuentes externas fallaron temporalmente.');
    }

    lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
        timeZone: 'America/Santo_Domingo',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });

    io.emit('lidom_auto_update', lidomFullData);
}

setInterval(syncLidomMultiSource, 30 * 1000);
syncLidomMultiSource();

io.on('connection', (socket) => {
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor Multi-Fuente LIDOM en puerto ${PORT}`));
