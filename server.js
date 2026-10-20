const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const PORT = process.env.PORT || 3000;

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

// BASE DE DATOS AJUSTADA AL STANDING OFICIAL DE LA LIDOM (3 JJ POR EQUIPO)
const OFFICIAL_GAMES_DATABASE = [
  // JORNADA 1 (16 OCT)
  { id: 1, date: '2026-10-16', stadium: 'Julián Javier (SFM)', time: '07:00 PM', away: 'AC', home: 'GC', awayRuns: 1, homeRuns: 4, status: 'FINAL', inning: 'Final' },
  { id: 2, date: '2026-10-16', stadium: 'Quisqueya (SDQ)', time: '07:15 PM', away: 'L', home: 'E', awayRuns: 12, homeRuns: 2, status: 'FINAL', inning: 'Final' },
  { id: 3, date: '2026-10-16', stadium: 'Tetelo Vargas (SPM)', time: '07:30 PM', away: 'TE', home: 'EO', awayRuns: 2, homeRuns: 5, status: 'FINAL', inning: 'Final' },

  // JORNADA 2 (17 OCT)
  { id: 4, date: '2026-10-17', stadium: 'Francisco Micheli (LRN)', time: '07:30 PM', away: 'EO', home: 'TE', awayRuns: 4, homeRuns: 1, status: 'FINAL', inning: 'Final' },
  { id: 5, date: '2026-10-17', stadium: 'Estadio Cibao (STI)', time: '07:00 PM', away: 'E', home: 'AC', awayRuns: 3, homeRuns: 2, status: 'FINAL', inning: 'Final' },
  { id: 6, date: '2026-10-17', stadium: 'Quisqueya (SDQ)', time: '07:15 PM', away: 'GC', home: 'L', awayRuns: 6, homeRuns: 3, status: 'FINAL', inning: 'Final' },

  // JORNADA 3 (18 OCT) - MARCADORES AJUSTADOS AL STANDING OFICIAL
  { id: 7, date: '2026-10-18', stadium: 'Quisqueya (SDQ)', time: '05:00 PM', away: 'E', home: 'L', awayRuns: 4, homeRuns: 3, status: 'FINAL', inning: 'Final' },
  { id: 8, date: '2026-10-18', stadium: 'Estadio Cibao (STI)', time: '05:00 PM', away: 'GC', home: 'AC', awayRuns: 2, homeRuns: 5, status: 'FINAL', inning: 'Final' },
  { id: 9, date: '2026-10-18', stadium: 'Francisco Micheli (LRN)', time: '05:00 PM', away: 'EO', home: 'TE', awayRuns: 0, homeRuns: 8, status: 'FINAL', inning: 'Final' },

  // CARTELERA OFICIAL DE HOY (20 OCT)
  {
    id: 101, date: '2026-10-20', time: '07:00 PM', stadium: 'Estadio Julián Javier (SFM)',
    away: 'L', home: 'GC', awayName: 'Tigres del Licey (2-1)', homeName: 'Gigantes del Cibao (2-1)',
    awayRuns: 0, homeRuns: 0, status: 'SCHEDULED', inning: '07:00 PM',
    awayPitcher: 'Por definir', homePitcher: 'Por definir', awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.60, homeRl: 2.25, total: 8.5, over: 1.90, under: 1.90
  },
  {
    id: 102, date: '2026-10-20', time: '07:15 PM', stadium: 'Estadio Quisqueya Juan Marichal',
    away: 'EO', home: 'E', awayName: 'Estrellas Orientales (2-1)', homeName: 'Leones del Escogido (0-3)',
    awayRuns: 0, homeRuns: 0, status: 'SCHEDULED', inning: '07:15 PM',
    awayPitcher: 'Por definir', homePitcher: 'Por definir', awayMl: 1.80, homeMl: 2.00, rlLine: 1.5, awayRl: 2.10, homeRl: 1.70, total: 8.5, over: 1.85, under: 1.95
  },
  {
    id: 103, date: '2026-10-20', time: '07:30 PM', stadium: 'Estadio Francisco Micheli (LRN)',
    away: 'AC', home: 'TE', awayName: 'Águilas Cibaeñas (1-2)', homeName: 'Toros del Este (2-1)',
    awayRuns: 0, homeRuns: 0, status: 'SCHEDULED', inning: '07:30 PM',
    awayPitcher: 'Por definir', homePitcher: 'Por definir', awayMl: 2.05, homeMl: 1.75, rlLine: 1.5, awayRl: 1.65, homeRl: 2.15, total: 8.0, over: 1.90, under: 1.90
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

    const apiGames = dates[0].games.map(g => {
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
      if (status === 'LIVE') {
        inningDisplay = `${inningState === 'Top' ? '▲' : '▼'} ${currentInning}`;
      } else if (status === 'FINAL') {
        inningDisplay = 'Final';
      }

      return {
        id: g.gamePk,
        date: today,
        time: new Date(g.gameDate).toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit', hour12: true }),
        stadium: g.venue ? g.venue.name : 'Estadio LIDOM',
        away: awayCode,
        home: homeCode,
        awayName: awayName,
        homeName: homeName,
        awayRuns: linescore.teams?.away?.runs ?? 0,
        homeRuns: linescore.teams?.home?.runs ?? 0,
        status: status,
        inning: inningDisplay,
        awayPitcher: g.teams.away.probablePitcher ? g.teams.away.probablePitcher.fullName : 'Por definir',
        homePitcher: g.teams.home.probablePitcher ? g.teams.home.probablePitcher.fullName : 'Por definir',
        awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
      };
    });

    liveGamesCache = apiGames;
    return apiGames;

  } catch (error) {
    liveGamesCache = OFFICIAL_GAMES_DATABASE;
    return OFFICIAL_GAMES_DATABASE;
  }
}

setInterval(async () => {
  const updatedGames = await fetchLidomGames();
  io.emit('lidom_update', updatedGames);
}, 30000);

io.on('connection', async (socket) => {
  socket.emit('lidom_update', liveGamesCache);

  socket.on('manual_sync_request', async () => {
    const games = await fetchLidomGames();
    socket.emit('lidom_update', games);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor escuchando en puerto ${PORT}`);
  fetchLidomGames();
});
