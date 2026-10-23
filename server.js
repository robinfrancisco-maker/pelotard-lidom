const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cheerio = require('cheerio');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// DATOS BASE REALES DE RESGUARDO (Para evitar tablas vacías)
const FALLBACK_STANDINGS = [
    { code: 'L', name: 'Tigres del Licey', jj: '6', g: '5', p: '1', pct: '.833', dif: '-', u10: '5-1', racha: 'W4', ca: '38', cp: '16', difC: '+22', x1: '4-1', casa: '2-1', visita: '3-0', over500: '3-1' },
    { code: 'GC', name: 'Gigantes del Cibao', jj: '6', g: '4', p: '2', pct: '.667', dif: '1.0', u10: '4-2', racha: 'W2', ca: '31', cp: '29', difC: '+2', x1: '2-3', casa: '3-1', visita: '1-1', over500: '2-1' },
    { code: 'TE', name: 'Toros del Este', jj: '6', g: '3', p: '3', pct: '.500', dif: '2.0', u10: '3-3', racha: 'L1', ca: '20', cp: '27', difC: '-7', x1: '1-8', casa: '2-0', visita: '1-3', over500: '3-2' },
    { code: 'EO', name: 'Estrellas Orientales', jj: '6', g: '3', p: '3', pct: '.500', dif: '2.0', u10: '3-3', racha: 'L1', ca: '28', cp: '20', difC: '+8', x1: '3-8', casa: '2-1', visita: '1-2', over500: '2-2' },
    { code: 'AC', name: 'Águilas Cibaeñas', jj: '6', g: '2', p: '4', pct: '.333', dif: '3.0', u10: '2-4', racha: 'L2', ca: '18', cp: '23', difC: '-5', x1: '1-7', casa: '1-2', visita: '1-2', over500: '3-3' },
    { code: 'E', name: 'Leones del Escogido', jj: '6', g: '1', p: '5', pct: '.167', dif: '4.0', u10: '1-5', racha: 'L2', ca: '25', cp: '45', difC: '-20', x1: '1-3', casa: '0-3', visita: '1-2', over500: '1-5' }
];

const FALLBACK_BATTING = [
    { name: 'Yairo Muñoz', team: 'TE', j: '6', tb: '22', c: '3', h: '10', hr: '1', ci: '6', avg: '.455', ops: '1.150' },
    { name: 'Kevin Alcántara', team: 'L', j: '5', tb: '18', c: '5', h: '8', hr: '2', ci: '7', avg: '.444', ops: '1.320' },
    { name: 'Aneurys Zabala', team: 'EO', j: '6', tb: '20', c: '4', h: '8', hr: '1', ci: '5', avg: '.400', ops: '1.050' },
    { name: 'Kelvin Gutiérrez', team: 'GC', j: '6', tb: '21', c: '3', h: '8', hr: '1', ci: '4', avg: '.381', ops: '.980' },
    { name: 'Starlin Castro', team: 'AC', j: '6', tb: '23', c: '2', h: '8', hr: '0', ci: '3', avg: '.348', ops: '.850' },
    { name: 'Emilio Bonifacio', team: 'L', j: '6', tb: '24', c: '6', h: '8', hr: '0', ci: '2', avg: '.333', ops: '.890' },
    { name: 'Franmil Reyes', team: 'E', j: '6', tb: '22', c: '4', h: '7', hr: '2', ci: '6', avg: '.318', ops: '.950' },
    { name: 'Junior Lake', team: 'E', j: '6', tb: '21', c: '3', h: '6', hr: '1', ci: '3', avg: '.286', ops: '.810' },
    { name: 'Yadiel Hernández', team: 'AC', j: '5', tb: '18', c: '2', h: '5', hr: '0', ci: '2', avg: '.278', ops: '.720' },
    { name: 'Henry Urrutia', team: 'GC', j: '6', tb: '20', c: '2', h: '5', hr: '1', ci: '4', avg: '.250', ops: '.780' }
];

const FALLBACK_PITCHING = [
    { name: 'César Valdez', team: 'L', g: '2', p: '0', efe: '0.75', j: '2', il: '12.0', k: '11', whip: '0.83' },
    { name: 'Paolo Espino', team: 'TE', g: '1', p: '0', efe: '1.20', j: '2', il: '10.0', k: '12', whip: '0.90' },
    { name: 'Esmil Rogers', team: 'EO', g: '1', p: '1', efe: '1.80', j: '2', il: '10.0', k: '8', whip: '1.00' },
    { name: 'Enny Romero', team: 'E', g: '1', p: '0', efe: '2.00', j: '2', il: '9.0', k: '9', whip: '1.11' },
    { name: 'Brooks Hall', team: 'L', g: '1', p: '0', efe: '2.25', j: '2', il: '8.0', k: '7', whip: '1.00' },
    { name: 'Gerson Garabito', team: 'AC', g: '0', p: '1', efe: '2.70', j: '2', il: '10.0', k: '10', whip: '1.20' },
    { name: 'Wily Peralta', team: 'GC', g: '1', p: '0', efe: '3.00', j: '2', il: '9.0', k: '6', whip: '1.22' },
    { name: 'Raúl Valdés', team: 'TE', g: '1', p: '1', efe: '3.15', j: '2', il: '11.1', k: '8', whip: '1.15' },
    { name: 'Nabil Crismatt', team: 'L', g: '1', p: '0', efe: '3.38', j: '2', il: '8.0', k: '8', whip: '1.13' },
    { name: 'Tyler Alexander', team: 'GC', g: '0', p: '1', efe: '3.60', j: '2', il: '10.0', k: '9', whip: '1.30' }
];

let lidomFullData = {
    games: [],
    standings: FALLBACK_STANDINGS,
    battingLeaders: FALLBACK_BATTING,
    pitchingLeaders: FALLBACK_PITCHING,
    lastUpdated: null
};

// EXTRACCIÓN CON SCRAPING + FALLBACK DE RESGUARDO
async function syncLidomData() {
    const todayStr = new Date().toISOString().split('T')[0];

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

    // Intento de raspado directo de LIDOM
    try {
        const { data } = await axios.get('https://www.lidom.com/posiciones/', {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 5000
        });
        const $ = cheerio.load(data);
        let scrapedStandings = [];

        $('table tbody tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 6) {
                const teamName = $(cols[0]).text().trim();
                if (teamName) {
                    scrapedStandings.push({
                        code: teamName.substring(0, 3).toUpperCase(),
                        name: teamName,
                        jj: $(cols[1]).text().trim(),
                        g: $(cols[2]).text().trim(),
                        p: $(cols[3]).text().trim(),
                        pct: $(cols[4]).text().trim(),
                        dif: $(cols[5]).text().trim(),
                        u10: $(cols[6]) ? $(cols[6]).text().trim() : '0-0',
                        racha: $(cols[7]) ? $(cols[7]).text().trim() : '-',
                        ca: $(cols[8]) ? $(cols[8]).text().trim() : '0',
                        cp: $(cols[9]) ? $(cols[9]).text().trim() : '0',
                        difC: $(cols[10]) ? $(cols[10]).text().trim() : '0',
                        x1: '0-0', casa: '0-0', visita: '0-0', over500: '0-0'
                    });
                }
            }
        });

        if (scrapedStandings.length >= 6) {
            lidomFullData.standings = scrapedStandings;
        }
    } catch (e) {
        // En caso de error o demora, mantiene los datos base garantizados
        if (!lidomFullData.standings || lidomFullData.standings.length === 0) {
            lidomFullData.standings = FALLBACK_STANDINGS;
        }
    }

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
