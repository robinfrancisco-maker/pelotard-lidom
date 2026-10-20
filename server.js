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

// Cartelera de respaldo fija para asegurar juegos visibles
const FALLBACK_GAMES = [
  {
    id: 101,
    date: new Date().toISOString().split('T')[0],
    time: '07:15 PM',
    stadium: 'Estadio Quisqueya Juan Marichal',
    away: 'AC',
    home: 'L',
    awayName: 'Águilas Cibaeñas',
    homeName: 'Tigres del Licey',
    awayRuns: 0,
    homeRuns: 0,
    status: 'SCHEDULED',
    inning: '7:15 PM',
    awayPitcher: 'Por definir',
    homePitcher: 'Por definir',
    awayMl: 1.85, homeMl: 1.95
  },
  {
    id: 102,
    date: new Date().toISOString().split('T')[0],
    time: '07:00 PM',
    stadium: 'Estadio Julián Javier',
    away: 'E',
    home: 'GC',
    awayName: 'Leones del Escogido',
    homeName: 'Gigantes del Cibao',
    awayRuns: 0,
    homeRuns: 0,
    status: 'SCHEDULED',
    inning: '7:00 PM',
    awayPitcher: 'Por definir',
    homePitcher: 'Por definir',
    awayMl: 1.90, homeMl: 1.90
  },
  {
    id: 103,
    date: new Date().toISOString().split('T')[0],
    time: '07:30 PM',
    stadium: 'Estadio Tetelo Vargas',
    away: 'TE',
    home: 'EO',
    awayName: 'Toros del Este',
    homeName: 'Estrellas Orientales',
    awayRuns: 0,
    homeRuns: 0,
    status: 'SCHEDULED',
    inning: '7:30 PM',
    awayPitcher: 'Por definir',
    homePitcher: 'Por definir',
    awayMl: 2.00, homeMl: 1.80
  }
];

let liveGamesCache = [];

async function fetchLidomGames() {
  try {
    const options = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const [month, day, year] = new Date().toLocaleDateString('en-US', options).split('/');
    const today = `${year}-${month}-${day}`;

    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=11&startDate=${today}&endDate=${today}&hydrate=linescore,probablePitcher,team`;
    
    const response = await axios.get(url);
    const dates = response.data.dates || [];

    if (dates.length === 0 || !dates[0].games || dates[0].games.length === 0) {
      liveGamesCache = FALLBACK_GAMES;
      return FALLBACK_GAMES;
    }

    const games = dates[0].games.map(g => {
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
        awayMl: 1.85, homeMl: 1.95
      };
    });

    liveGamesCache = games;
    return games;

  } catch (error) {
    if (liveGamesCache.length === 0) {
      liveGamesCache = FALLBACK_GAMES;
    }
    return liveGamesCache;
  }
}

setInterval(async () => {
  const updatedGames = await fetchLidomGames();
  io.emit('lidom_update', updatedGames);
}, 30000);

io.on('connection', async (socket) => {
  if (liveGamesCache.length === 0) {
    liveGamesCache = await fetchLidomGames();
  }
  socket.emit('lidom_update', liveGamesCache);

  socket.on('manual_sync_request', async () => {
    const games = await fetchLidomGames();
    socket.emit('lidom_update', games);
  });
});

server.listen(PORT, () => {
  fetchLidomGames();
});
