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
const SERVER_URL = 'https://pelotard-lidom.onrender.com'; // Dominio oficial en Render

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

// AUTO-PING PARA EVITAR QUE RENDER SE DUERMA (MANTIENE EL SERVIDOR DESPIERTO 24/7)
setInterval(() => {
  axios.get(SERVER_URL).then(() => {
    console.log('Keep-alive ping exitoso.');
  }).catch(() => {});
}, 600000); // Cada 10 minutos

async function fetchLidomGames() {
  try {
    const options = { timeZone: 'America/Santo_Domingo', year: 'numeric', month: '2-digit', day: '2-digit' };
    const [month, day, year] = new Date().toLocaleDateString('en-US', options).split('/');
    const today = `${year}-${month}-${day}`;

    // Consulta directa a la API de MLB/LIDOM para partidos de hoy
    const url = `https://statsapi.mlb.com/api/v1/schedule?sportId=11&startDate=${today}&endDate=${today}&hydrate=linescore,probablePitcher,team`;
    const response = await axios.get(url);
    const dates = response.data.dates || [];

    if (dates.length === 0 || !dates[0].games) {
      return [];
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
        awayMl: 1.85, homeMl: 1.95, rlLine: 1.5, awayRl: 1.65, homeRl: 2.20, total: 8.5, over: 1.90, under: 1.90
      };
    });

    return games;

  } catch (error) {
    console.error('Error al conectar con la API LIDOM:', error.message);
    return [];
  }
}

// SINCRONIZACIÓN CADA 30 SEGUNDOS
setInterval(async () => {
  const games = await fetchLidomGames();
  if (games.length > 0) {
    io.emit('lidom_update', games);
  }
}, 30000);

io.on('connection', async (socket) => {
  const games = await fetchLidomGames();
  socket.emit('lidom_update', games);

  socket.on('manual_sync_request', async () => {
    const updatedGames = await fetchLidomGames();
    socket.emit('lidom_update', updatedGames);
  });
});

server.listen(PORT, () => {
  console.log(`Servidor de PELOTARD corriendo en puerto ${PORT}`);
});
