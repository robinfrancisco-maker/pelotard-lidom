const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;
const SERVER_URL = 'https://pelotard-lidom.onrender.com';

app.use(express.static(path.join(__dirname, 'public')));

const TEAM_MAP = {
  'Tigres del Licey': 'L',
  'Leones del Escogido': 'E',
  'Aguilas Cibaenas': 'AC',
  'Águilas Cibaeñas': 'AC',
  'Gigantes del Cibao': 'GC',
  'Toros del Este': 'TE',
  'Estrellas Orientales': 'EO'
};

// PREVENIR MODO SLEEP EN RENDER
setInterval(() => {
  axios.get(SERVER_URL).catch(() => {});
}, 600000);

// DATOS DE HOY 21 DE OCTUBRE Y JORNADAS PASADAS
const OFFICIAL_GAMES_DATABASE = [
  // JORNADA 3 (18 OCT - RESULTADOS REALES)
  { id: 7, date: '2026-10-18', stadium: 'Francisco Micheli (LRN)', time: '05:00 PM', away: 'TE', home: 'EO', awayRuns: 6, homeRuns: 4, status: 'FINAL', inning: 'Final' },
  { id: 8, date: '2026-10-18', stadium: 'Estadio Cibao (STI)', time: '05:00 PM', away: 'GC', home: 'AC', awayRuns: 1, homeRuns: 4, status: 'FINAL', inning: 'Final (10)' },
  { id: 9, date: '2026-10-18', stadium: 'Quisqueya (SDQ)', time: '05:00 PM', away: 'E', home: 'L', awayRuns: 4, homeRuns: 5, status: 'FINAL', inning: 'Final' },

  // JORNADA 4 (20 OCT - PASADOS)
  { id: 101, date: '2026-10-20', stadium: 'Estadio Julián Javier (SFM)', time: '07:00 PM', away: 'L', home: 'GC', awayRuns: 3, homeRuns: 5, status: 'FINAL', inning: 'Final' },
  { id: 102, date: '2026-10-20', stadium: 'Estadio Quisqueya (SDQ)', time: '07:15 PM', away: 'EO', home: 'E', awayRuns: 4, homeRuns: 2, status: 'FINAL', inning: 'Final' },
  { id: 103, date: '2026-10-20', stadium: 'Estadio Francisco Micheli (LRN)', time: '07:30 PM', away: 'AC', home: 'TE', awayRuns: 2, homeRuns: 6, status: 'FINAL', inning: 'Final' },

  // JORNADA 5 (21 OCTUBRE - HOY)
  {
    id: 201, date: '2026-10-21', time: '07:15 PM', stadium: 'Estadio Quisqueya Juan Marichal',
    away: 'GC', home: 'L', awayName: 'Gigantes del Cibao', homeName: 'Tigres del Licey',
    awayRuns: 0, homeRuns: 0, status: 'SCHEDULED', inning: '07:15 PM',
    awayPitcher: 'Wily Peralta (RHP)', homePitcher: 'Nico Tellache (LHP)',
    awayMl: 1.90, homeMl: 1.90, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
  },
  {
    id: 202, date: '2026-10-21', time: '07:30 PM', stadium: 'Estadio Tetelo Vargas (SPM)',
    away: 'E', home: 'EO', awayName: 'Leones del Escogido', homeName: 'Estrellas Orientales',
    awayRuns: 0, homeRuns: 0, status: 'SCHEDULED', inning: '07:30 PM',
    awayPitcher: 'Ariel Miranda (LHP)', homePitcher: 'Óscar de la Cruz (RHP)',
    awayMl: 2.00, homeMl: 1.80, rlLine: 1.5, awayRl: 1.70, homeRl: 2.10, total: 8.5, over: 1.85, under: 1.95
  },
  {
    id: 203, date: '2026-10-21', time: '07:30 PM', stadium: 'Estadio Cibao (STI)',
    away: 'TE', home: 'AC', awayName: 'Toros del Este', homeName: 'Águilas Cibaeñas',
    awayRuns: 0, homeRuns: 0, status: 'SCHEDULED', inning: '07:30 PM',
    awayPitcher: 'Esmil Rogers (RHP)', homePitcher: 'Tyler Alexander (LHP)',
    awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.60, homeRl: 2.25, total: 8.0, over: 1.90, under: 1.90
  }
];

let liveGamesCache = OFFICIAL_GAMES_DATABASE;

async function fetchLidomGames() {
  try {
    const options = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const [month, day, year] = new Date().toLocaleDateString('en-US', options).split('/');
    const today = `${year}-${month}-${day}`;

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=11&startDate=${today}&endDate=${today}&hydrate=linescore,probablePitcher,team`;
    const response = await axios.get(url);
    const dates = response.data.dates || [];

    if (dates.length === 0 || !dates[0].games || dates[0].games.length === 0) {
      liveGamesCache = OFFICIAL_GAMES_DATABASE;
      return OFFICIAL_GAMES_DATABASE;
    }

    const apiGames = dates[0].games.map((g, index) => {
      const defaultGame = OFFICIAL_GAMES_DATABASE.find(og => og.id === g.gamePk) || OFFICIAL_GAMES_DATABASE[6 + index] || {};
      const awayName = g.teams.away.team.name;
      const homeName = g.teams.home.team.name;
      const awayCode = TEAM_MAP[awayName] || awayName.substring(0,2).toUpperCase();
      const homeCode = TEAM_MAP[homeName] || homeName.substring(0,2).toUpperCase();

      let status = 'SCHEDULED';
      if (g.status.abstractGameState === 'Live') status = 'LIVE';
      else if (g.status.abstractGameState === 'Final') status = 'FINAL';

      const linescore = g.linescore || {};
      const inningState = linescore.inningState || '';
      const currentInning = linescore.currentInningOrdinal || '';
      
      let inningDisplay = g.status.detailedState || 'Programado';
      if (status === 'LIVE') inningDisplay = `${inningState === 'Top' ? '▲' : '▼'} ${currentInning}`;
      else if (status === 'FINAL') inningDisplay = 'Final';

      const apiAwayPitcher = g.teams.away.probablePitcher ? g.teams.away.probablePitcher.fullName : null;
      const apiHomePitcher = g.teams.home.probablePitcher ? g.teams.home.probablePitcher.fullName : null;

      return {
        id: g.gamePk,
        date: today,
        time: new Date(g.gameDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }),
        stadium: g.venue ? g.venue.name : (defaultGame.stadium || 'Estadio LIDOM'),
        away: awayCode, home: homeCode,
        awayName: awayName, homeName: homeName,
        awayRuns: linescore.teams?.away?.runs ?? 0,
        homeRuns: linescore.teams?.home?.runs ?? 0,
        status: status, inning: inningDisplay,
        awayPitcher: apiAwayPitcher || defaultGame.awayPitcher || 'Por definir',
        homePitcher: apiHomePitcher || defaultGame.homePitcher || 'Por definir',
        awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
      };
    });

    const otherGames = OFFICIAL_GAMES_DATABASE.filter(og => og.date !== today);
    liveGamesCache = [...otherGames, ...apiGames];
    return liveGamesCache;

  } catch (error) {
    liveGamesCache = OFFICIAL_GAMES_DATABASE;
    return OFFICIAL_GAMES_DATABASE;
  }
}

setInterval(async () => {
  const updatedGames = await fetchLidomGames();
  io.emit('lidom_update', { date: '2026-10-21', games: updatedGames });
}, 30000);

io.on('connection', async (socket) => {
  socket.emit('lidom_update', { date: '2026-10-21', games: liveGamesCache });
  socket.on('manual_sync_request', async () => {
    const games = await fetchLidomGames();
    socket.emit('lidom_update', { date: '2026-10-21', games: games });
  });
});

server.listen(PORT, () => { fetchLidomGames(); });
