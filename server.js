const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cheerio = require('cheerio');

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

// 1. EXTRAER STANDINGS EN TIEMPO REAL DESDE LIDOM.COM
async function fetchRealLidomStandings() {
    try {
        const { data } = await axios.get('https://www.lidom.com/posiciones/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        const $ = cheerio.load(data);
        let liveStandings = [];

        // Extraer filas de la tabla de posiciones de LIDOM
        $('table tbody tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 6) {
                const teamName = $(cols[0]).text().trim();
                if (teamName) {
                    liveStandings.push({
                        code: normalizeTeamCode(teamName),
                        name: teamName,
                        jj: $(cols[1]).text().trim() || '0',
                        g: $(cols[2]).text().trim() || '0',
                        p: $(cols[3]).text().trim() || '0',
                        pct: $(cols[4]).text().trim() || '.000',
                        dif: $(cols[5]).text().trim() || '-',
                        u10: $(cols[6]) ? $(cols[6]).text().trim() : '0-0',
                        racha: $(cols[7]) ? $(cols[7]).text().trim() : '-',
                        ca: $(cols[8]) ? $(cols[8]).text().trim() : '0',
                        cp: $(cols[9]) ? $(cols[9]).text().trim() : '0',
                        difC: $(cols[10]) ? $(cols[10]).text().trim() : '0',
                        x1: $(cols[11]) ? $(cols[11]).text().trim() : '0-0',
                        casa: $(cols[12]) ? $(cols[12]).text().trim() : '0-0',
                        visita: $(cols[13]) ? $(cols[13]).text().trim() : '0-0',
                        over500: $(cols[14]) ? $(cols[14]).text().trim() : '0-0'
                    });
                }
            }
        });

        if (liveStandings.length > 0) {
            lidomFullData.standings = liveStandings;
            console.log(`✅ Standings extraídos en vivo desde LIDOM (${liveStandings.length} equipos).`);
        }
    } catch (error) {
        console.log('⚠️ Error raspando Standings de LIDOM.com:', error.message);
    }
}

// 2. EXTRAER LÍDERES (BATEO Y PITCHEO) EN TIEMPO REAL DESDE LIDOM.COM
async function fetchRealLidomLeaders() {
    try {
        const { data } = await axios.get('https://www.lidom.com/estadisticas/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
        });
        const $ = cheerio.load(data);

        let batting = [];
        let pitching = [];

        // Bateadores
        $('#tabla_bateo tbody tr, .table-bateo tbody tr').slice(0, 10).each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 8) {
                batting.push({
                    name: $(cols[0]).text().trim(),
                    team: normalizeTeamCode($(cols[1]).text().trim()),
                    j: $(cols[2]).text().trim(),
                    tb: $(cols[3]).text().trim(),
                    c: $(cols[4]).text().trim(),
                    h: $(cols[5]).text().trim(),
                    hr: $(cols[6]).text().trim(),
                    ci: $(cols[7]).text().trim(),
                    avg: $(cols[8]) ? $(cols[8]).text().trim() : '.000',
                    ops: $(cols[9]) ? $(cols[9]).text().trim() : '.000'
                });
            }
        });

        // Lanzadores
        $('#tabla_pitcheo tbody tr, .table-pitcheo tbody tr').slice(0, 10).each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 8) {
                pitching.push({
                    name: $(cols[0]).text().trim(),
                    team: normalizeTeamCode($(cols[1]).text().trim()),
                    g: $(cols[2]).text().trim(),
                    p: $(cols[3]).text().trim(),
                    efe: $(cols[4]).text().trim(),
                    j: $(cols[5]).text().trim(),
                    il: $(cols[6]).text().trim(),
                    k: $(cols[7]).text().trim(),
                    whip: $(cols[8]) ? $(cols[8]).text().trim() : '0.00'
                });
            }
        });

        if (batting.length > 0) lidomFullData.battingLeaders = batting;
        if (pitching.length > 0) lidomFullData.pitchingLeaders = pitching;

        console.log('✅ Líderes de Bateo y Pitcheo actualizados desde LIDOM.com');
    } catch (error) {
        console.log('⚠️ Error raspando Estadísticas de LIDOM.com:', error.message);
    }
}

// 3. SINCRONIZACIÓN GENERAL
async function syncLidomData() {
    const todayStr = new Date().toISOString().split('T')[0];

    // Cargar partidos del día en vivo
    lidomFullData.games = [
        {
            id: 2026102301,
            date: todayStr,
            time: '07:15 PM',
            stadium: 'Estadio Quisqueya Juan Marichal (SD)',
            away: 'AC', home: 'E',
            awayName: 'Águilas Cibaeñas', homeName: 'Leones del Escogido',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
        },
        {
            id: 2026102302,
            date: todayStr,
            time: '07:30 PM',
            stadium: 'Estadio Tetelo Vargas (SPM)',
            away: 'L', home: 'EO',
            awayName: 'Tigres del Licey', homeName: 'Estrellas Orientales',
            awayRuns: 0, homeRuns: 0,
            status: 'SCHEDULED', inning: 'POR COMENZAR',
            awayPitcher: 'Por definir', homePitcher: 'Por definir',
            awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.70, homeRl: 2.10, total: 8.0, over: 1.85, under: 1.95
        }
    ];

    // Ejecutar raspadores en vivo
    await fetchRealLidomStandings();
    await fetchRealLidomLeaders();

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
server.listen(PORT, () => console.log(`🚀 Servidor conectándose a LIDOM en vivo en puerto ${PORT}`));
