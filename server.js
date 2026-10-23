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

// FILTRO ESTRICTO: SOLO LOS 6 EQUIPOS DE LA LIDOM
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
    return null; // Si no es de LIDOM, devuelve null para descartarlo
}

let lidomFullData = {
    games: [],
    standings: [],
    battingLeaders: [],
    pitchingLeaders: [],
    lastUpdated: null
};

// Eliminar caché previa al arrancar si contiene datos que no son de LIDOM
if (fs.existsSync(DATA_FILE)) {
    try {
        const raw = fs.readFileSync(DATA_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.standings && parsed.standings.some(s => !VALID_LIDOM_CODES.includes(s.code))) {
            console.log('🧹 Eliminando caché obsoleta con datos externos a LIDOM...');
            fs.unlinkSync(DATA_FILE);
        } else {
            lidomFullData = parsed;
        }
    } catch (e) {
        fs.unlinkSync(DATA_FILE);
    }
}

// PETICIÓN CON HEADERS DE NAVEGADOR REAL (PARA EVITAR BLOQUEOS EN RENDER)
const HTTP_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-ES,es;q=0.9'
};

async function syncLidomDataStrict() {
    try {
        // 1. CONSULTA A ESPN DOM.1 CON ENCABEZADOS DE NAVEGADOR
        const stdUrl = 'https://site.api.espn.com/apis/v2/sports/baseball/dom.1/standings';
        const stdRes = await axios.get(stdUrl, { headers: HTTP_HEADERS, timeout: 8000 });
        
        let cleanStandings = [];
        if (stdRes.data && stdRes.data.children && stdRes.data.children[0]?.standings?.entries) {
            const entries = stdRes.data.children[0].standings.entries;
            entries.forEach(entry => {
                const code = parseLidomCode(entry.team?.displayName, entry.team?.abbreviation);
                
                // SOLO AGREGAR SI ES UN EQUIPO VALIDO DE LIDOM
                if (code) {
                    const stats = entry.stats || [];
                    const getStat = (keys) => {
                        const m = stats.find(s => keys.includes(s.name) || keys.includes(s.type));
                        return m ? (m.displayValue || m.value?.toString() || '0') : '0';
                    };

                    const w = parseInt(getStat(['wins', 'W']));
                    const l = parseInt(getStat(['losses', 'L']));
                    const jj = w + l || parseInt(getStat(['gamesPlayed', 'GP']));

                    cleanStandings.push({
                        code: code,
                        name: entry.team?.displayName || entry.team?.name,
                        jj: jj,
                        g: w,
                        p: l,
                        pct: getStat(['winPercent', 'PCT']) || '.000',
                        dif: getStat(['gamesBehind', 'GB']) || '-',
                        u10: getStat(['lastTen', 'L10']) || '0-0',
                        racha: getStat(['streak', 'STRK']) || '-',
                        ca: getStat(['runsFor', 'RF']),
                        cp: getStat(['runsAgainst', 'RA']),
                        difC: parseInt(getStat(['runsFor', 'RF'])) - parseInt(getStat(['runsAgainst', 'RA'])),
                        x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                    });
                }
            });
        }

        if (cleanStandings.length > 0) {
            lidomFullData.standings = cleanStandings;
        }

        // 2. CONSULTA DE CARTELERA
        const schedUrl = 'https://site.api.espn.com/apis/site/v2/sports/baseball/dom.1/scoreboard';
        const schedRes = await axios.get(schedUrl, { headers: HTTP_HEADERS, timeout: 8000 });
        let cleanGames = [];

        if (schedRes.data && schedRes.data.events) {
            schedRes.data.events.forEach(evt => {
                const comp = evt.competitions[0];
                const awayObj = comp.competitors.find(c => c.homeAway === 'away');
                const homeObj = comp.competitors.find(c => c.homeAway === 'home');

                const awayCode = parseLidomCode(awayObj.team.displayName, awayObj.team.abbreviation);
                const homeCode = parseLidomCode(homeObj.team.displayName, homeObj.team.abbreviation);

                if (awayCode && homeCode) {
                    cleanGames.push({
                        id: evt.id,
                        date: evt.date.split('T')[0],
                        time: new Date(evt.date).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Santo_Domingo' }),
                        stadium: comp.venue?.fullName || 'Estadio LIDOM',
                        away: awayCode,
                        home: homeCode,
                        awayName: awayObj.team.displayName,
                        homeName: homeObj.team.displayName,
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

        lidomFullData.games = cleanGames;
        lidomFullData.lastUpdated = new Date().toLocaleTimeString('es-DO', { 
            timeZone: 'America/Santo_Domingo',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
        });

        // Guardar solo si los datos corresponden a LIDOM
        fs.writeFileSync(DATA_FILE, JSON.stringify(lidomFullData, null, 2));
        console.log(`✅ Sincronización estricta completada (${cleanStandings.length} equipos de LIDOM).`);

    } catch (e) {
        console.log('⚠️ Error en la petición a la API:', e.message);
    }

    io.emit('lidom_auto_update', lidomFullData);
}

setInterval(syncLidomDataStrict, 30 * 1000);
syncLidomDataStrict();

io.on('connection', (socket) => {
    socket.emit('lidom_auto_update', lidomFullData);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Servidor ejecutándose en puerto ${PORT}`));
